// Classification of an NNS proposal by what it does to canister code.
//
// - "upgrade": modern InstallCode action, or legacy ExecuteNnsFunction with
//   NnsCanisterUpgrade. Upgrades existing canister code.
// - "install": legacy ExecuteNnsFunction with NnsCanisterInstall. Installs a
//   brand-new canister (e.g. "Add nns canister: engine-controller").
// - "other": anything that does not ship canister code (motions, params, etc.).
//
// Kept dependency-free so client components can import it without pulling in
// the @dfinity/agent stack that lives in nns.ts.
export type ProposalType = "upgrade" | "install" | "other";

// Both upgrades and installs ship WASM and are reproducible, so both warrant
// build verification and AI commentary.
export function isVerifiableProposal(type: ProposalType): boolean {
  return type === "upgrade" || type === "install";
}
