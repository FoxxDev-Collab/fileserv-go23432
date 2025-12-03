"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "wrap" }],
        ]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="scroll-m-20 text-4xl font-bold tracking-tight mb-6 pb-2 border-b">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-10 mb-4 pb-2 border-b first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="scroll-m-20 text-xl font-semibold tracking-tight mt-8 mb-3">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="scroll-m-20 text-lg font-semibold tracking-tight mt-6 mb-2">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="scroll-m-20 text-base font-semibold tracking-tight mt-4 mb-2">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="scroll-m-20 text-sm font-semibold tracking-tight mt-4 mb-2">
              {children}
            </h6>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="leading-7 [&:not(:first-child)]:mt-4">{children}</p>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {children}
            </a>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="my-4 ml-6 list-disc [&>li]:mt-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 ml-6 list-decimal [&>li]:mt-2">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-7">{children}</li>,

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="mt-4 border-l-4 border-primary/30 pl-4 italic text-muted-foreground [&>p]:mt-2">
              {children}
            </blockquote>
          ),

          // Code blocks
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !className;
            
            if (isInline) {
              return (
                <code
                  className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            
            return (
              <code
                className={cn(
                  "block relative rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto",
                  className
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-lg bg-muted">
              {children}
            </pre>
          ),

          // Tables
          table: ({ children }) => (
            <div className="my-6 w-full overflow-auto">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b bg-muted/50">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b transition-colors hover:bg-muted/50">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="p-4 align-middle">{children}</td>
          ),

          // Horizontal rule
          hr: () => <hr className="my-8 border-t" />,

          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),

          // Emphasis/Italic
          em: ({ children }) => <em className="italic">{children}</em>,

          // Images
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="rounded-lg border my-4 max-w-full"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
