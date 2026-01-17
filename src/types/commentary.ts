// Commentary schema types (matching gh-verifier schema)
export interface CommentarySource {
  type: 'proposal_body' | 'git_diff' | 'github_pr' | 'forum_post' | 'documentation' | 'other'
  url?: string
  description: string
}

export interface CommitSummary {
  commit_hash: string
  summary: string
  additions?: number
  deletions?: number
}

export interface FileSummary {
  file_path: string
  summary: string
}

export interface CommentaryData {
  title: string
  proposal_id: string
  canister_id?: string
  commit_summaries?: CommitSummary[]
  file_summaries?: FileSummary[]
  overall_summary: string
  why_now?: string
  sources: CommentarySource[]
  confidence_notes?: string
  analysis_incomplete: boolean
  incomplete_reason?: string
}

export interface CommentaryWithMetadata extends CommentaryData {
  cost_usd?: number
  duration_ms?: number
  turns?: number
  created_at?: string
}
