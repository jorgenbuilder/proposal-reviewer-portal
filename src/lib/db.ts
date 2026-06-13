import { supabase } from './supabase/client'
import type {
  PushSubscription,
  ProposalSeen,
  ProposalForumThread
} from './supabase/types'
import type { CommentaryData, CommentaryWithMetadata } from '@/types/commentary'
import type { Json } from './supabase/types'

// Re-export types for backwards compatibility
export type PushSubscriptionRecord = PushSubscription
export type ProposalSeenRecord = Omit<ProposalSeen, 'proposal_id'> & { proposal_id: string }
export type { ProposalForumThread }

// Push subscription operations

export async function saveSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  email?: string,
  topics?: number[]
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint,
        p256dh,
        auth,
        email: email || null,
        topics: topics || [17] // Default to Protocol Canister Management
      },
      { onConflict: 'endpoint' }
    )

  if (error) throw error
}

export async function getSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')

  if (error) throw error
  return data || []
}

export async function updateSubscriptionTopics(
  endpoint: string,
  topics: number[]
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ topics })
    .eq('endpoint', endpoint)

  if (error) throw error
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)

  if (error) throw error
}

export async function updateSubscriptionSuccess(endpoint: string): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ last_success: new Date().toISOString() })
    .eq('endpoint', endpoint)

  if (error) throw error
}

// Proposal tracking operations

export async function markProposalSeen(
  proposalId: string,
  topic: string,
  title: string,
  commitHash?: string | null,
  proposalUrl?: string | null,
  proposalTimestamp?: Date | null
): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .upsert(
      {
        proposal_id: parseInt(proposalId, 10),
        topic,
        title,
        commit_hash: commitHash || null,
        proposal_url: proposalUrl || null,
        proposal_timestamp: proposalTimestamp?.toISOString() || null
      },
      { onConflict: 'proposal_id', ignoreDuplicates: true }
    )

  if (error) throw error
}

export async function getSeenProposalIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('proposals_seen')
    .select('proposal_id')

  if (error) throw error
  return new Set((data || []).map(r => r.proposal_id.toString()))
}

export async function markProposalNotified(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .update({ notified: true })
    .eq('proposal_id', parseInt(proposalId, 10))

  if (error) throw error
}

export async function markVerificationTriggered(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .update({ verification_triggered_at: new Date().toISOString() })
    .eq('proposal_id', parseInt(proposalId, 10))

  if (error) throw error
}

export async function getRecentProposals(limit: number = 50): Promise<ProposalSeenRecord[]> {
  // Import MIN_PROPOSAL_ID to filter old proposals
  const { MIN_PROPOSAL_ID } = await import('./nns')

  const { data, error } = await supabase
    .from('proposals_seen')
    .select('*')
    .gte('proposal_id', Number(MIN_PROPOSAL_ID))
    .order('proposal_id', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Convert proposal_id from number to string for backwards compatibility
  return (data || []).map(row => ({
    ...row,
    proposal_id: row.proposal_id.toString()
  }))
}

// Notification log operations

export async function logNotification(
  proposalId: string,
  subscriptionId: string,
  channel: 'push' | 'email',
  status: 'sent' | 'failed' | 'delivered',
  error?: string
): Promise<void> {
  const { error: dbError } = await supabase
    .from('notification_log')
    .insert({
      proposal_id: parseInt(proposalId, 10),
      subscription_id: subscriptionId,
      channel,
      status,
      error: error || null
    })

  if (dbError) throw dbError
}

// Forum thread operations

export async function addForumThread(
  proposalId: string,
  forumUrl: string,
  threadTitle?: string,
  isCanonical?: boolean
): Promise<ProposalForumThread> {
  const { data, error } = await supabase
    .from('proposal_forum_threads')
    .upsert(
      {
        proposal_id: proposalId,
        forum_url: forumUrl,
        thread_title: threadTitle || null,
        is_canonical: isCanonical || false
      },
      { onConflict: 'proposal_id,forum_url' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getProposalsWithoutCanonicalForum(
  proposalIds: string[]
): Promise<string[]> {
  if (proposalIds.length === 0) return []

  // Get all proposals that DO have a canonical forum thread
  const { data, error } = await supabase
    .from('proposal_forum_threads')
    .select('proposal_id')
    .in('proposal_id', proposalIds)
    .eq('is_canonical', true)

  if (error) throw error

  const withCanonical = new Set((data || []).map(d => d.proposal_id))
  return proposalIds.filter(id => !withCanonical.has(id))
}

export async function hasCanonicalForumThread(
  proposalId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('proposal_forum_threads')
    .select('proposal_id')
    .eq('proposal_id', proposalId)
    .eq('is_canonical', true)
    .limit(1)

  if (error) throw error
  return (data?.length || 0) > 0
}

export async function removeForumThread(
  proposalId: string,
  forumUrl: string
): Promise<void> {
  const { error } = await supabase
    .from('proposal_forum_threads')
    .delete()
    .eq('proposal_id', proposalId)
    .eq('forum_url', forumUrl)

  if (error) throw error
}

export async function getForumThreadsForProposal(
  proposalId: string
): Promise<ProposalForumThread[]> {
  const { data, error } = await supabase
    .from('proposal_forum_threads')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('added_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getForumThreadsForProposals(
  proposalIds: string[]
): Promise<Map<string, ProposalForumThread[]>> {
  if (proposalIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('proposal_forum_threads')
    .select('*')
    .in('proposal_id', proposalIds)
    .order('added_at', { ascending: false })

  if (error) throw error

  // Group by proposal_id
  const threadsMap = new Map<string, ProposalForumThread[]>()
  for (const thread of data || []) {
    const existing = threadsMap.get(thread.proposal_id) || []
    threadsMap.set(thread.proposal_id, [...existing, thread])
  }

  return threadsMap
}

// Reviewer tracking operations

export async function markProposalViewerSeen(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .update({ viewer_seen_at: new Date().toISOString() })
    .eq('proposal_id', parseInt(proposalId, 10))

  if (error) throw error
}

export async function submitProposalReview(
  proposalId: string,
  forumUrl: string,
  reviewedAt?: string
): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .update({
      review_forum_url: forumUrl,
      reviewed_at: reviewedAt || new Date().toISOString()
    })
    .eq('proposal_id', parseInt(proposalId, 10))

  if (error) throw error
}

export async function clearProposalReview(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .update({
      review_forum_url: null,
      reviewed_at: null
    })
    .eq('proposal_id', parseInt(proposalId, 10))

  if (error) throw error
}

export async function getProposalReviewStatus(
  proposalId: string
): Promise<{ viewerSeenAt: string | null; reviewForumUrl: string | null; reviewedAt: string | null } | null> {
  const { data, error } = await supabase
    .from('proposals_seen')
    .select('viewer_seen_at, review_forum_url, reviewed_at')
    .eq('proposal_id', parseInt(proposalId, 10))
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  return {
    viewerSeenAt: data.viewer_seen_at,
    reviewForumUrl: data.review_forum_url,
    reviewedAt: data.reviewed_at
  }
}

export async function updateProposalDiffStats(
  proposalId: string,
  linesAdded: number,
  linesRemoved: number
): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .update({
      lines_added: linesAdded,
      lines_removed: linesRemoved
    })
    .eq('proposal_id', parseInt(proposalId, 10))

  if (error) throw error
}

export async function getProposalsWithoutDiffStats(
  proposalIds: string[]
): Promise<string[]> {
  if (proposalIds.length === 0) return []

  const { data, error } = await supabase
    .from('proposals_seen')
    .select('proposal_id, lines_added')
    .in('proposal_id', proposalIds.map(id => parseInt(id, 10)))
    .is('lines_added', null)

  if (error) throw error
  return (data || []).map(d => d.proposal_id.toString())
}

export async function getProposalDiffStats(
  proposalId: string
): Promise<{ linesAdded: number | null; linesRemoved: number | null } | null> {
  const { data, error } = await supabase
    .from('proposals_seen')
    .select('lines_added, lines_removed')
    .eq('proposal_id', parseInt(proposalId, 10))
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  return {
    linesAdded: data.lines_added,
    linesRemoved: data.lines_removed
  }
}

export async function getProposalsNeedingDiffStats(
  limit: number = 50,
  forceRefresh: boolean = false
): Promise<Array<{ proposalId: string; commitHash: string | null; proposalUrl: string | null }>> {
  let query = supabase
    .from('proposals_seen')
    .select('proposal_id, commit_hash, proposal_url')

  if (!forceRefresh) {
    // Only get proposals without diff stats
    query = query.is('lines_added', null)
  }

  // Only include proposals that have GitHub data to fetch from
  query = query
    .or('commit_hash.neq.null,proposal_url.ilike.%github.com%')
    .order('proposal_id', { ascending: false })
    .limit(limit)

  const { data, error } = await query

  if (error) throw error

  return (data || []).map(row => ({
    proposalId: row.proposal_id.toString(),
    commitHash: row.commit_hash,
    proposalUrl: row.proposal_url
  }))
}

// Commentary operations

export async function saveCommentary(
  proposalId: string,
  commentary: CommentaryData,
  metadata?: {
    cost_usd?: number
    duration_ms?: number
    turns?: number
  }
): Promise<{ id: string; created_at: string }> {
  const { data, error } = await supabase
    .from('proposal_commentaries')
    .insert({
      proposal_id: parseInt(proposalId, 10),
      title: commentary.title,
      canister_id: commentary.canister_id || null,
      analysis_incomplete: commentary.analysis_incomplete,
      incomplete_reason: commentary.incomplete_reason || null,
      cost_usd: metadata?.cost_usd || null,
      duration_ms: metadata?.duration_ms || null,
      turns: metadata?.turns || null,
      commentary_data: commentary as unknown as Json
    })
    .select('id, created_at')
    .single()

  if (error) throw error
  return data
}

export async function getLatestCommentary(
  proposalId: string
): Promise<CommentaryWithMetadata | null> {
  const { data, error } = await supabase
    .from('proposal_commentaries')
    .select('*')
    .eq('proposal_id', parseInt(proposalId, 10))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  // Parse JSONB back to typed object
  const commentaryData = data.commentary_data as unknown as CommentaryData

  return {
    ...commentaryData,
    cost_usd: data.cost_usd ?? undefined,
    duration_ms: data.duration_ms ?? undefined,
    turns: data.turns ?? undefined,
    created_at: data.created_at
  }
}

export async function getAllCommentaries(
  proposalId: string
): Promise<CommentaryWithMetadata[]> {
  const { data, error } = await supabase
    .from('proposal_commentaries')
    .select('*')
    .eq('proposal_id', parseInt(proposalId, 10))
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map(row => ({
    ...(row.commentary_data as unknown as CommentaryData),
    cost_usd: row.cost_usd ?? undefined,
    duration_ms: row.duration_ms ?? undefined,
    turns: row.turns ?? undefined,
    created_at: row.created_at
  }))
}

export async function getCommentaryCount(proposalId: string): Promise<number> {
  const { count, error } = await supabase
    .from('proposal_commentaries')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', parseInt(proposalId, 10))

  if (error) throw error
  return count || 0
}

export async function getLatestCommentaryTitles(
  proposalIds: string[]
): Promise<Map<string, string>> {
  if (proposalIds.length === 0) return new Map()

  // Query to get the latest commentary title for each proposal
  const { data, error } = await supabase
    .from('proposal_commentaries')
    .select('proposal_id, title, created_at')
    .in('proposal_id', proposalIds.map(id => parseInt(id, 10)))
    .order('created_at', { ascending: false })

  if (error) throw error

  // Build a map of proposal_id -> latest commentary title
  const titleMap = new Map<string, string>()
  const seen = new Set<number>()

  for (const row of data || []) {
    // Only keep the first (most recent) title for each proposal
    if (!seen.has(row.proposal_id) && row.title) {
      titleMap.set(row.proposal_id.toString(), row.title)
      seen.add(row.proposal_id)
    }
  }

  return titleMap
}


export async function logForumSearch(
  proposalId: string,
  searchQuery: string,
  resultsCount: number,
  selectedUrl: string | null,
  status: 'success' | 'no_results' | 'auth_failed' | 'error',
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from('forum_search_log')
    .insert({
      proposal_id: proposalId,
      search_query: searchQuery,
      results_count: resultsCount,
      selected_url: selectedUrl,
      status,
      error_message: errorMessage || null
    })

  if (error) throw error
}
