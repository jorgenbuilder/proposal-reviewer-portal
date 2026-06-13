const FORUM_BASE_URL = "https://forum.dfinity.org";
const NNS_PROPOSAL_CATEGORY_ID = 76;
const NNS_PROPOSAL_CATEGORY_SLUG = "governance/nns-proposal-discussions";

export function getForumCategoryUrl(): string {
  return `${FORUM_BASE_URL}/c/${NNS_PROPOSAL_CATEGORY_SLUG}/${NNS_PROPOSAL_CATEGORY_ID}`;
}

// --- Authenticated Discourse access via a long-lived User-API-Key ---------------------
// Replaces the old session-cookie approach (no browser, no stored cookies). The key is
// minted out-of-band (ii-automation/scripts/mint-userapikey.mjs) and provided as
// FORUM_USER_API_KEY. ForumAuthError (key revoked/invalid) is distinct from a plain
// "not found yet" so callers don't retry forever on a dead key.

export class ForumAuthError extends Error {}

function apiKey(): string {
  const key = process.env.FORUM_USER_API_KEY;
  if (!key) throw new ForumAuthError("FORUM_USER_API_KEY not configured");
  return key;
}

async function forumGet(path: string): Promise<Response> {
  return fetch(`${FORUM_BASE_URL}${path}`, {
    headers: {
      "User-Api-Key": apiKey(),
      Accept: "application/json",
      "User-Agent": "pcm-portal/forum-detect",
    },
  });
}

interface SearchTopic {
  id: number;
  title: string;
  slug: string;
  category_id: number;
}

export interface CanonicalThread {
  url: string;
  title: string;
}

async function search(proposalId: string): Promise<SearchTopic[]> {
  const res = await forumGet(`/search.json?q=${encodeURIComponent(proposalId)}`);
  if (res.status === 401 || res.status === 403) {
    throw new ForumAuthError(`forum search rejected key: HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`forum search failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.topics ?? [];
}

// A thread is the canonical discussion iff its first post mentions the proposal ID.
async function firstPostMentions(topic: SearchTopic, proposalId: string): Promise<boolean> {
  const res = await forumGet(`/t/${topic.slug}/${topic.id}.json`);
  if (res.status === 401 || res.status === 403) {
    throw new ForumAuthError(`forum thread fetch rejected key: HTTP ${res.status}`);
  }
  if (!res.ok) return false;
  const data = await res.json();
  const firstPost = data.post_stream?.posts?.[0];
  const text = firstPost?.cooked || firstPost?.raw || "";
  return text.includes(proposalId);
}

/**
 * Find the canonical NNS forum thread for a proposal, or null if not found yet.
 * Throws ForumAuthError if the key is rejected (so callers can stop + alert).
 */
export async function findCanonicalThread(proposalId: string): Promise<CanonicalThread | null> {
  const topics = await search(proposalId);
  const nnsTopics = topics.filter((t) => t.category_id === NNS_PROPOSAL_CATEGORY_ID);
  for (const topic of nnsTopics) {
    if (await firstPostMentions(topic, proposalId)) {
      return { url: `${FORUM_BASE_URL}/t/${topic.slug}/${topic.id}`, title: topic.title };
    }
  }
  return null;
}
