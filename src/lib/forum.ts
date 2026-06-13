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

// --- Posting (write scope) -----------------------------------------------------------
// Posting uses a SEPARATE write-scoped key (least privilege: detection uses the read key).
// The account that minted FORUM_USER_API_KEY_WRITE is the author of the post.

export class ForumRateLimitError extends Error {
  waitSeconds: number;
  constructor(waitSeconds: number) { super("rate_limited"); this.waitSeconds = waitSeconds; }
}
export class ForumDuplicateError extends Error {} // body identical/too-similar → already posted

function writeApiKey(): string {
  const key = process.env.FORUM_USER_API_KEY_WRITE;
  if (!key) throw new ForumAuthError("FORUM_USER_API_KEY_WRITE not configured");
  return key;
}

export const FORUM_POST_USERNAME = process.env.FORUM_USERNAME || "jorgenbuilder";

export function topicIdFromUrl(url: string): number | null {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).find((s) => /^\d+$/.test(s));
    return seg ? Number(seg) : null;
  } catch {
    return null;
  }
}

// Idempotency guard: has the posting user already posted in this topic?
export async function hasPostByUser(topicId: number, username: string): Promise<boolean> {
  const res = await fetch(`${FORUM_BASE_URL}/t/${topicId}.json`, {
    headers: { "User-Api-Key": writeApiKey(), Accept: "application/json", "User-Agent": "pcm-portal/post" },
  });
  if (res.status === 401 || res.status === 403) throw new ForumAuthError(`topic read rejected write key: HTTP ${res.status}`);
  if (!res.ok) throw new Error(`topic fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  const posts: Array<{ username?: string }> = data.post_stream?.posts ?? [];
  return posts.some((p) => p.username?.toLowerCase() === username.toLowerCase());
}

export interface PostedReply { id: number; postNumber: number; url: string }

export async function postReply(topicId: number, raw: string): Promise<PostedReply> {
  const res = await fetch(`${FORUM_BASE_URL}/posts.json`, {
    method: "POST",
    headers: { "User-Api-Key": writeApiKey(), "Content-Type": "application/json", "User-Agent": "pcm-portal/post" },
    body: JSON.stringify({ topic_id: topicId, raw }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new ForumAuthError(`post rejected write key: HTTP ${res.status}`);
  if (res.status === 429) throw new ForumRateLimitError(Number(body?.extras?.wait_seconds) || 10);
  if (res.status === 422) {
    const errs = (body.errors || []).join(" ");
    if (/identical|too similar/i.test(errs)) throw new ForumDuplicateError(errs);
    throw new Error(`post validation failed: ${errs || JSON.stringify(body).slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`post failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  const slug = body.topic_slug || "topic";
  return { id: body.id, postNumber: body.post_number, url: `${FORUM_BASE_URL}/t/${slug}/${body.topic_id}/${body.post_number}` };
}
