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

export function getForumCategoryUrl(): string {
  return `${FORUM_BASE_URL}/c/${NNS_PROPOSAL_CATEGORY_SLUG}/${NNS_PROPOSAL_CATEGORY_ID}`;
}

export function getForumTopicUrl(slug: string, id: number): string {
  return `${FORUM_BASE_URL}/t/${slug}/${id}`;
}

export async function findForumTopicForProposal(
  proposalId: string
): Promise<ForumTopic | null> {
  try {
    // Search the forum for topics containing the proposal ID in the NNS proposal category
    const searchUrl = `${FORUM_BASE_URL}/search.json?q=${encodeURIComponent(
      `${proposalId} #${NNS_PROPOSAL_CATEGORY_SLUG}`
    )}`;

    const response = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error("Forum search failed:", response.status);
      return null;
    }

    const data = await response.json();

    // Look for a topic that contains the proposal ID in its title
    const topics = data.topics || [];
    const matchingTopic = topics.find((topic: { title: string }) => {
      const title = topic.title.toLowerCase();
      // Match patterns like "#123456" or "123456" or "proposal 123456"
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
