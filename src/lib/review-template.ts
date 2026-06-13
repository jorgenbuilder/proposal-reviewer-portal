// Renders the factual verification-note posted to the canonical forum thread.
// Decision: factual only — no "Adopt" vote. Asserts solely what was machine-verified
// (build reproduced to the on-chain wasm hash) + a link to the run. The human adds any
// vote/analysis themselves.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATE_PATH = join(process.cwd(), "templates", "forum-verification-note.md");

export interface ReviewVars {
  proposalId: string;
  title: string;
  verificationRunUrl: string;
}

// Minimal {{var}} interpolation (no logic/conditionals by design — keep the post deterministic).
export function renderVerificationNote(vars: ReviewVars): string {
  const tpl = readFileSync(TEMPLATE_PATH, "utf8");
  return tpl
    .replace(/\{\{proposalId\}\}/g, vars.proposalId)
    .replace(/\{\{title\}\}/g, vars.title)
    .replace(/\{\{verificationRunUrl\}\}/g, vars.verificationRunUrl)
    .trim();
}
