import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CommentaryWithMetadata } from "@/types/commentary"

// Custom link component for ReactMarkdown
// Opens external links in browser (not PWA) and styles them blue
const markdownComponents: Components = {
  a: ({ node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 hover:underline"
    />
  ),
}

interface CommentaryWidgetProps {
  commentary: CommentaryWithMetadata | null
  proposalId: string
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

function formatSourceLink(source: CommentaryWithMetadata['sources'][0]): string {
  const typeEmoji: Record<string, string> = {
    proposal_body: '📜',
    git_diff: '🔀',
    github_pr: '🔗',
    forum_post: '💬',
    documentation: '📚',
    other: '📎',
  }

  const emoji = typeEmoji[source.type] || '📎'

  if (source.url) {
    return `${emoji} [${source.description}](${source.url})`
  }
  return `${emoji} ${source.description}`
}

function CommentaryMetadataTable({
  commentary
}: {
  commentary: CommentaryWithMetadata
}) {
  return (
    <div className="text-sm border rounded-md overflow-hidden">
      <table className="w-full">
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-3 font-medium text-muted-foreground bg-muted/50">
              Proposal
            </td>
            <td className="py-2 px-3">{commentary.proposal_id}</td>
          </tr>
          {commentary.canister_id && (
            <tr className="border-b">
              <td className="py-2 px-3 font-medium text-muted-foreground bg-muted/50">
                Canister
              </td>
              <td className="py-2 px-3 font-mono text-xs">
                {commentary.canister_id}
              </td>
            </tr>
          )}
          {commentary.cost_usd !== undefined && (
            <tr className="border-b">
              <td className="py-2 px-3 font-medium text-muted-foreground bg-muted/50">
                Analysis Cost
              </td>
              <td className="py-2 px-3">${commentary.cost_usd.toFixed(2)}</td>
            </tr>
          )}
          {commentary.duration_ms !== undefined && (
            <tr className="border-b">
              <td className="py-2 px-3 font-medium text-muted-foreground bg-muted/50">
                Duration
              </td>
              <td className="py-2 px-3">
                {formatDuration(commentary.duration_ms)}
              </td>
            </tr>
          )}
          {commentary.turns !== undefined && (
            <tr>
              <td className="py-2 px-3 font-medium text-muted-foreground bg-muted/50">
                Turns
              </td>
              <td className="py-2 px-3">{commentary.turns}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function CommentaryWidget({
  commentary,
  proposalId
}: CommentaryWidgetProps) {
  // No commentary available yet
  if (!commentary) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-lg text-muted-foreground">
            AI Commentary
          </CardTitle>
          <CardDescription>Pending</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            AI-generated commentary for proposal #{proposalId} has not been generated yet.
            Commentary is typically available within a few minutes after proposal submission.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={commentary.analysis_incomplete ? "border-yellow-500/50" : ""}>
      <CardHeader>
        <CardTitle className="text-lg">
          {commentary.title}
        </CardTitle>
        <CardDescription>
          AI-generated analysis
          {commentary.created_at && (
            <> • Generated {new Date(commentary.created_at).toLocaleString()}</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metadata */}
        <CommentaryMetadataTable commentary={commentary} />

        {/* Warning if incomplete */}
        {commentary.analysis_incomplete && (
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-md p-4">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              ⚠️ Analysis Incomplete
            </p>
            {commentary.incomplete_reason && (
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {commentary.incomplete_reason}
              </p>
            )}
          </div>
        )}

        {/* Overall Summary */}
        <div>
          <h3 className="font-semibold mb-2">Summary</h3>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown components={markdownComponents}>{commentary.overall_summary}</ReactMarkdown>
          </div>
        </div>

        {/* Why Now */}
        {commentary.why_now && (
          <div>
            <h3 className="font-semibold mb-2">Why Now</h3>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown components={markdownComponents}>{commentary.why_now}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Commits */}
        {commentary.commit_summaries && commentary.commit_summaries.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Commits</h3>
            <div className="space-y-4">
              {commentary.commit_summaries.map((commit) => {
                const shortHash = commit.commit_hash.substring(0, 8)
                return (
                  <div key={commit.commit_hash} className="border-l-2 border-muted pl-4">
                    <a
                      href={`https://github.com/dfinity/ic/commit/${commit.commit_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {shortHash}
                    </a>
                    <div className="prose prose-sm dark:prose-invert max-w-none mt-1">
                      <ReactMarkdown components={markdownComponents}>{commit.summary}</ReactMarkdown>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* File Changes (collapsible) */}
        {commentary.file_summaries && commentary.file_summaries.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer font-semibold list-none flex items-center">
              <span className="mr-2">File Changes ({commentary.file_summaries.length})</span>
              <span className="text-muted-foreground group-open:rotate-90 transition-transform">
                ▶
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              {commentary.file_summaries.map((file) => (
                <div key={file.file_path} className="border-l-2 border-muted pl-4">
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {file.file_path}
                  </code>
                  <div className="prose prose-sm dark:prose-invert max-w-none mt-2">
                    <ReactMarkdown components={markdownComponents}>{file.summary}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Sources */}
        {commentary.sources && commentary.sources.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Sources</h3>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown components={markdownComponents}>
                {commentary.sources.map(formatSourceLink).map(link => `- ${link}`).join('\n')}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Confidence Notes */}
        {commentary.confidence_notes && (
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground italic">
              Note: {commentary.confidence_notes}
            </p>
          </div>
        )}

        {/* Attribution */}
        <div className="border-t pt-4 text-xs text-muted-foreground text-center">
          Generated by <a
            href="https://claude.ai/code"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Claude Code
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
