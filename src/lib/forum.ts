const FORUM_BASE_URL = "https://forum.dfinity.org";
const NNS_PROPOSAL_CATEGORY_ID = 76;
const NNS_PROPOSAL_CATEGORY_SLUG = "governance/nns-proposal-discussions";

export interface ForumTopic {
  id: number;
  title: string;
  slug: string;
  url: string;
  createdAt: string;
}

export interface ForumSearchResult {
  found: boolean;
  topic?: ForumTopic;
  confidence?: "high" | "medium" | "low";
  reason?: string;
}

export function getForumCategoryUrl(): string {
  return `${FORUM_BASE_URL}/c/${NNS_PROPOSAL_CATEGORY_SLUG}/${NNS_PROPOSAL_CATEGORY_ID}`;
}

export function getForumTopicUrl(slug: string, id: number): string {
  return `${FORUM_BASE_URL}/t/${slug}/${id}`;
}

// Simple search fallback (used if Gemini is not available)
export async function findForumTopicForProposal(
  proposalId: string
): Promise<ForumTopic | null> {
  try {
    const searchUrl = `${FORUM_BASE_URL}/search.json?q=${encodeURIComponent(
      `${proposalId} #${NNS_PROPOSAL_CATEGORY_SLUG}`
    )}`;

    const response = await fetch(searchUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const topics = data.topics || [];

    const matchingTopic = topics.find((topic: { title: string }) => {
      const title = topic.title.toLowerCase();
      return (
        title.includes(`#${proposalId}`) ||
        title.includes(`proposal ${proposalId}`) ||
        title.match(new RegExp(`\\b${proposalId}\\b`))
      );
    });

    if (!matchingTopic) {
      return null;
    }

    return {
      id: matchingTopic.id,
      title: matchingTopic.title,
      slug: matchingTopic.slug,
      url: getForumTopicUrl(matchingTopic.slug, matchingTopic.id),
      createdAt: matchingTopic.created_at,
    };
  } catch (error) {
    console.error("Failed to search forum:", error);
    return null;
  }
}
