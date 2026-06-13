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
  ok: boolean;
  reasons: string[]; // why it failed (empty when ok)
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
  const listRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}/artifacts`,
    { headers: ghHeaders() }
  );
  if (!listRes.ok) return null;
  const list = await listRes.json();
  const art = (list.artifacts || []).find((a: { name: string }) => a.name === "verification-result");
  if (!art) return null;
  // archive_download_url 302-redirects to a signed blob; fetch follows by default.
  const zipRes = await fetch(art.archive_download_url, { headers: ghHeaders() });
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
  const reasons: string[] = [];

  const run = await getVerificationRunForProposal(proposalId, true);
  const runUrl = run?.htmlUrl ?? null;
  if (!run) return { ok: false, reasons: ["no verification run found"], runUrl, title: null, verifier: null, chain: null };
  if (run.status !== "completed") return { ok: false, reasons: [`run not completed (status=${run.status})`], runUrl, title: null, verifier: null, chain: null };
  if (run.conclusion !== "success") reasons.push(`run conclusion is "${run.conclusion}", not success`);

  const verifier = await fetchVerifierResult(run.id);
  if (!verifier) reasons.push("verification-result artifact missing or unreadable (cannot confirm output)");

  const chainDetail = await getProposal(BigInt(proposalId));
  if (!chainDetail) {
    reasons.push("could not read proposal from chain");
    return { ok: false, reasons, runUrl, title: null, verifier, chain: null };
  }
  const chain = {
    wasmHash: chainDetail.expectedWasmHash,
    argHash: chainDetail.expectedArgHash,
    canisterId: chainDetail.canisterId,
    installMode: chainDetail.installMode,
  };

  if (verifier) {
    if (!verifier.overallMatch) reasons.push("verifier reported overallMatch=false");
    if (!verifier.wasmMatch) reasons.push("verifier reported wasmMatch=false");
    if (!verifier.actualWasmHash) reasons.push("verifier produced no actual wasm hash (blank output)");

    // The core false-positive guard, when the chain exposes the hash directly (InstallCode):
    if (chain.wasmHash) {
      // verifier read the SAME proposal we did
      if (verifier.expectedWasmHash && norm(verifier.expectedWasmHash) !== norm(chain.wasmHash)) {
        reasons.push("verifier's expected wasm hash does not match the on-chain proposal");
      }
      // the REPRODUCED build matches what's on chain (the substance of "verified")
      if (verifier.actualWasmHash && norm(verifier.actualWasmHash) !== norm(chain.wasmHash)) {
        reasons.push("reproduced wasm hash does not match the on-chain wasm hash");
      }
      // arg hash, when present on chain
      if (chain.argHash) {
        if (!verifier.argMatch) reasons.push("verifier reported argMatch=false");
        if (verifier.actualArgHash && norm(verifier.actualArgHash) !== norm(chain.argHash)) {
          reasons.push("reproduced arg hash does not match the on-chain arg hash");
        }
      }
    } else {
      // Legacy ExecuteNnsFunction: no on-chain hash to compare against — the hash only exists
      // by reproducing the embedded wasm. We can only rely on the verifier's own overallMatch.
      // (Flagged as a note, not a failure, but we require overallMatch above.)
    }
  }

  return { ok: reasons.length === 0, reasons, runUrl, title: chainDetail.title, verifier, chain };
}
