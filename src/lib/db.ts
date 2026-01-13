import { supabase } from './supabase/client'
import type {
  PushSubscription,
  ProposalSeen,
  ProposalForumThread
} from './supabase/types'

// Re-export types for backwards compatibility
export type PushSubscriptionRecord = PushSubscription
export type ProposalSeenRecord = Omit<ProposalSeen, 'proposal_id'> & { proposal_id: string }
export type { ProposalForumThread }

// Push subscription operations

export async function saveSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  email?: string
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { endpoint, p256dh, auth, email: email || null },
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
  proposalUrl?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('proposals_seen')
    .upsert(
      {
        proposal_id: parseInt(proposalId, 10),
        topic,
        title,
        commit_hash: commitHash || null,
        proposal_url: proposalUrl || null
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

export async function getRecentProposals(limit: number = 50): Promise<ProposalSeenRecord[]> {
  const { data, error } = await supabase
    .from('proposals_seen')
    .select('*')
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
  threadTitle?: string
): Promise<ProposalForumThread> {
  const { data, error } = await supabase
    .from('proposal_forum_threads')
    .upsert(
      {
        proposal_id: proposalId,
        forum_url: forumUrl,
        thread_title: threadTitle || null
      },
      { onConflict: 'proposal_id,forum_url' }
    )
    .select()
    .single()

  if (error) throw error
  return data
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
