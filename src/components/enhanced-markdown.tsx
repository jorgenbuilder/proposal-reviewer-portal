"use client"

import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

interface EnhancedMarkdownProps {
  children: string
  className?: string
}

// Custom components for ReactMarkdown
const markdownComponents: Components = {
  // Links - open in browser with blue styling
  a: ({ node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
    />
  ),
  // Code blocks with syntax highlighting
  code: ({ node, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "")
    const language = match ? match[1] : ""
    const codeString = String(children).replace(/\n$/, "")

    // Check if it's inline code: no className AND no newlines means inline
    // Code blocks either have className (with language) or contain newlines
    const isInline = !className && !String(children).includes('\n')

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-muted text-[0.9em] font-mono border border-border"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <div className="my-4 rounded-lg border border-border shadow-sm overflow-x-auto">
        <SyntaxHighlighter
          style={oneDark}
          language={language || "text"}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "0.875rem",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            overflowX: "auto",
          }}
          codeTagProps={{
            style: {
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            },
          }}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    )
  },
  // Headings with better styling
  h1: ({ node, ...props }) => (
    <h1
      className="text-3xl font-bold mt-0 mb-4 pb-2 border-b border-border"
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="text-2xl font-semibold mt-4 mb-3 pb-1.5 border-b border-border"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="text-xl font-semibold mt-4 mb-2" {...props} />
  ),
  h4: ({ node, ...props }) => (
    <h4 className="text-lg font-semibold mt-4 mb-2" {...props} />
  ),
  h5: ({ node, ...props }) => (
    <h5 className="text-base font-semibold mt-3 mb-2" {...props} />
  ),
  h6: ({ node, ...props }) => (
    <h6 className="text-sm font-semibold mt-3 mb-2" {...props} />
  ),
  // Blockquotes
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="border-l-4 border-blue-500 pl-4 py-2 my-4 italic bg-muted/50 rounded-r"
      {...props}
    />
  ),
  // Lists
  ul: ({ node, ...props }) => (
    <ul className="list-disc list-outside ml-6 my-3 space-y-1" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="list-decimal list-outside ml-6 my-3 space-y-1" {...props} />
  ),
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  // Paragraphs
  p: ({ node, ...props }) => <p className="my-3 leading-relaxed" {...props} />,
  // Tables
  table: ({ node, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead className="bg-muted" {...props} />
  ),
  tbody: ({ node, ...props }) => (
    <tbody className="divide-y divide-border bg-background" {...props} />
  ),
  tr: ({ node, ...props }) => <tr {...props} />,
  th: ({ node, ...props }) => (
    <th
      className="px-4 py-2 text-left text-sm font-semibold"
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td className="px-4 py-2 text-sm" {...props} />
  ),
  // Horizontal rule
  hr: ({ node, ...props }) => (
    <hr className="my-6 border-t-2 border-border" {...props} />
  ),
}

export function EnhancedMarkdown({ children, className = "" }: EnhancedMarkdownProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
