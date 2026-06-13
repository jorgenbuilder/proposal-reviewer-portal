// Deterministic parser for DFINITY NNS proposal bodies (the on-chain `summary` markdown).
// No LLM — the proposal templates are rigid. Handles both the IC-monorepo template
// (`__Proposer__`, `## Features & Fixes`, `## New Commits`) and the standalone-canister
// template (`Repository:`, `## Motivation`, `## Release Notes`). The repo is always derived
// from the body (never guessed), which is what makes commit links correct across repos.

export interface ParsedSection {
  heading: string;
  markdown: string;
}
export interface ParsedCommit {
  hash: string;
  subject: string;
}
export interface ParsedProposalBody {
  proposer: string | null;
  repo: { owner: string; name: string; url: string } | null;
  targetCommit: string | null;
  previousCommit: string | null;
  /** "What this does" section markdown (Features & Fixes / Motivation / Changed / Summary). */
  features: string | null;
  /** All non-boilerplate sections (excludes verification/current-version/log sections). */
  description: ParsedSection[];
  /** The exact `git log <range> -- <path>` command from the body (for our own re-verification). */
  gitLogCommand: string | null;
  commits: ParsedCommit[];
}

const reLine = (re: RegExp, md: string): string | null => (md.match(re)?.[1] ?? "").trim() || null;

function sections(md: string): ParsedSection[] {
  const out: ParsedSection[] = [];
  const re = /^##\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  let last: { h: string; start: number } | null = null;
  while ((m = re.exec(md))) {
    if (last) out.push({ heading: last.h, markdown: md.slice(last.start, m.index).trim() });
    last = { h: m[1], start: re.lastIndex };
  }
  if (last) out.push({ heading: last.h, markdown: md.slice(last.start).trim() });
  return out;
}

function parseRepo(md: string): { repo: ParsedProposalBody["repo"]; commitFromLink: string | null } {
  // Standalone-canister template: `Repository: `https://github.com/owner/repo.git``
  const explicit = md.match(/Repository:\s*`?https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/i);
  if (explicit) {
    const owner = explicit[1];
    const name = explicit[2].replace(/\.git$/, "");
    return { repo: { owner, name, url: `https://github.com/${owner}/${name}` }, commitFromLink: null };
  }
  // IC-monorepo / generic: a github link that includes a commit-ish hash.
  const links = [...md.matchAll(/https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:\/(?:tree|commit|blob))?\/([0-9a-f]{7,40})/g)];
  const preferred = links.find((l) => /new-commit|source/i.test(md.slice(Math.max(0, (l.index ?? 0) - 40), l.index))) || links[0];
  if (!preferred) return { repo: null, commitFromLink: null };
  const [, owner, name, sha] = preferred;
  return { repo: { owner, name, url: `https://github.com/${owner}/${name}` }, commitFromLink: sha };
}

function parseCommitsBlock(md: string): { gitLogCommand: string | null; commits: ParsedCommit[] } {
  const block = ([...md.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).find((b) => /git log/.test(b)) || "").replace(/```/g, "");
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const gitLogCommand = lines.find((l) => /git log/.test(l))?.replace(/^\$\s*/, "") ?? null;
  const commits = lines
    .filter((l) => /^[0-9a-f]{7,40}\s+\S/.test(l))
    .map((l) => {
      const sp = l.indexOf(" ");
      return { hash: l.slice(0, sp), subject: l.slice(sp + 1).trim() };
    });
  return { gitLogCommand, commits };
}

export function parseProposalSummary(md: string): ParsedProposalBody {
  const secs = sections(md);
  const { repo, commitFromLink } = parseRepo(md);
  const { gitLogCommand, commits } = parseCommitsBlock(md);
  const range = gitLogCommand?.match(/([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})/);

  const proposer = reLine(/^_*\s*Proposer\s*_*\s*:\s*(.+)$/im, md);
  const targetCommit =
    reLine(/_*\s*Source code\s*_*\s*:\s*\[?([0-9a-f]{7,40})\]?/i, md) ||
    reLine(/_*\s*Git hash\s*_*\s*:\s*`?([0-9a-f]{7,40})`?/i, md) ||
    commitFromLink ||
    range?.[2] ||
    null;
  const previousCommit = reLine(/_*\s*Current git hash\s*_*\s*:\s*([0-9a-f]{7,40})/i, md) || range?.[1] || null;

  const features = secs.find((s) => /features|fixes|change|motivation|summary|release notes/i.test(s.heading))?.markdown ?? null;
  const description = secs.filter((s) => !/verification|current version|new commits|release notes/i.test(s.heading));

  return { proposer, repo, targetCommit, previousCommit, features, description, gitLogCommand, commits };
}

/** Repo-aware commit URL, or null if the repo couldn't be determined. */
export function commitUrl(repo: ParsedProposalBody["repo"], hash: string): string | null {
  return repo ? `${repo.url}/commit/${hash}` : null;
}
