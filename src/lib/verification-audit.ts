// Independent audit of a build verification, to catch false positives before we ever post
// under the user's name. It does NOT re-run the build; it cross-references three sources:
//   1. the GitHub Actions run conclusion (success?)
//   2. gh-verifier's machine-readable result artifact (what it actually computed)
//   3. the proposal payload read directly from chain (the authoritative expected values)
//
// The post happens ONLY if everything lines up. Any discrepancy → `ok:false` with reasons,
// which the caller turns into an email alert and refuses to post.
import { unzipSync, strFromU8 } from "fflate";
import { getProposal } from "./nns";
import { getVerificationRunForProposal } from "./github";

const REPO_OWNER = "jorgenbuilder";
const REPO_NAME = "gh-verifier";

interface VerifierResult {
  schemaVersion?: number;
  proposalId?: string;
  expectedWasmHash: string | null;
  actualWasmHash: string | null;
  wasmMatch: boolean;
  hasArgVerification: boolean;
  expectedArgHash: string | null;
  actualArgHash: string | null;
  argMatch: boolean;
  overallMatch: boolean;
}

export interface AuditResult {
  ok: boolean; // verified clean → safe to post
  // inconclusive: couldn't determine yet (artifact absent, run pending, chain read failed).
  // NOT a discrepancy — skip silently, don't flag/email, leave for a later retry.
  inconclusive: boolean;
  reasons: string[]; // discrepancy reasons (flag/email) when ok=false && !inconclusive
  inconclusiveReasons: string[];
  runUrl: string | null;
  title: string | null; // proposal title from chain (authoritative; for the post)
  verifier: VerifierResult | null;
  chain: { wasmHash: string | null; argHash: string | null; canisterId: string | null; installMode: number | null } | null;
}

const norm = (h: string | null | undefined) => (h ? h.toLowerCase().replace(/^0x/, "") : null);

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "pcm-portal/audit" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

// Download + parse the verification-result.json artifact for a run.
async function fetchVerifierResult(runId: number): Promise<VerifierResult | null> {
  // no-store: never serve a stale (e.g. empty, pre-upload) artifact list from Next's fetch cache.
  const listRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}/artifacts`,
    { headers: ghHeaders(), cache: "no-store" }
  );
  if (!listRes.ok) return null;
  const list = await listRes.json();
  const art = (list.artifacts || []).find((a: { name: string }) => a.name === "verification-result");
  if (!art) return null;
  // archive_download_url 302-redirects to a signed blob; fetch follows by default.
  const zipRes = await fetch(art.archive_download_url, { headers: ghHeaders(), cache: "no-store" });
  if (!zipRes.ok) return null;
  const buf = new Uint8Array(await zipRes.arrayBuffer());
  const files = unzipSync(buf);
  const entry = files["verification-result.json"];
  if (!entry) return null;
  try {
    return JSON.parse(strFromU8(entry));
  } catch {
    return null;
  }
}

/**
 * Audit proposal `proposalId`'s verification. Returns ok:true only when the run succeeded,
 * the artifact is present, and gh-verifier's reproduced hashes match the on-chain payload.
 */
export async function auditProposalVerification(proposalId: string): Promise<AuditResult> {
  const reasons: string[] = []; // real discrepancies → flag + email
  const inc: string[] = []; // inconclusive → skip silently, retry later
  const done = (ok: boolean, runUrl: string | null, title: string | null, verifier: VerifierResult | null, chain: AuditResult["chain"]): AuditResult => ({
    ok,
    inconclusive: !ok && reasons.length === 0,
    reasons,
    inconclusiveReasons: inc,
    runUrl,
    title,
    verifier,
    chain,
  });

  const run = await getVerificationRunForProposal(proposalId, true);
  const runUrl = run?.htmlUrl ?? null;
  if (!run) { inc.push("no verification run found"); return done(false, runUrl, null, null, null); }
  if (run.status !== "completed") { inc.push(`run not completed (status=${run.status})`); return done(false, runUrl, null, null, null); }
  if (run.conclusion !== "success") { inc.push(`run conclusion is "${run.conclusion}", not success`); return done(false, runUrl, null, null, null); }

  const verifier = await fetchVerifierResult(run.id);
  if (!verifier) { inc.push("verification-result artifact missing/unreadable (run predates the artifact, or not yet available)"); }

  const chainDetail = await getProposal(BigInt(proposalId));
  if (!chainDetail) { inc.push("could not read proposal from chain"); return done(false, runUrl, null, verifier, null); }
  const chain = {
    wasmHash: chainDetail.expectedWasmHash,
    argHash: chainDetail.expectedArgHash,
    canisterId: chainDetail.canisterId,
    installMode: chainDetail.installMode,
  };

  if (verifier) {
    // Real discrepancies (the false-positive guard):
    if (!verifier.overallMatch) reasons.push("verifier reported overallMatch=false");
    if (!verifier.wasmMatch) reasons.push("verifier reported wasmMatch=false");
    if (!verifier.actualWasmHash) reasons.push("verifier produced no actual wasm hash (blank output)");
    if (chain.wasmHash) {
      if (verifier.expectedWasmHash && norm(verifier.expectedWasmHash) !== norm(chain.wasmHash)) {
        reasons.push("verifier's expected wasm hash does not match the on-chain proposal");
      }
      if (verifier.actualWasmHash && norm(verifier.actualWasmHash) !== norm(chain.wasmHash)) {
        reasons.push("reproduced wasm hash does not match the on-chain wasm hash");
      }
      if (chain.argHash) {
        if (!verifier.argMatch) reasons.push("verifier reported argMatch=false");
        if (verifier.actualArgHash && norm(verifier.actualArgHash) !== norm(chain.argHash)) {
          reasons.push("reproduced arg hash does not match the on-chain arg hash");
        }
      }
    }
    // Legacy ExecuteNnsFunction (no on-chain hash): rely on verifier.overallMatch (checked above).
  }

  // ok only if artifact present AND no discrepancies AND no inconclusive notes.
  const ok = !!verifier && reasons.length === 0 && inc.length === 0;
  return done(ok, runUrl, chainDetail.title, verifier, chain);
}
