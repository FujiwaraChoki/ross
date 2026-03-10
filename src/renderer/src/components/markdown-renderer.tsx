import type { AnchorHTMLAttributes, HTMLAttributes, ReactElement, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './code-block'
import { useCodexStore } from '@/lib/store'

interface MarkdownRendererProps {
  markdown: string
  className?: string
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const UI_TEXT_SIZE_CLASS = 'text-[14px]'

function extractText(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number' || typeof children === 'boolean') return String(children)
  if (Array.isArray(children)) return children.map(extractText).join('')
  return ''
}

function getLanguage(className?: string): string | undefined {
  const match = className?.match(/language-([a-z0-9-]+)/i)
  return match?.[1]
}

function InlineMarkdownCode({ children }: { children: string }): ReactElement {
  return (
    <code className="px-1 py-0.5 bg-secondary rounded text-[length:var(--app-code-font-size)] font-mono">
      {children}
    </code>
  )
}

function isLocalAbsolutePath(href: string): boolean {
  return (href.startsWith('/') && !href.startsWith('//')) || href.startsWith('file://')
}

function isExternalLink(href: string): boolean {
  return /^(https?:|mailto:|codex:)/i.test(href)
}

function MarkdownLink({
  href,
  children,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>): ReactElement {
  const safeHref = href || ''
  const defaultOpenDestination = useCodexStore((state) => state.settings.defaultOpenDestination)

  if (isLocalAbsolutePath(safeHref)) {
    return (
      <button
        type="button"
        onClick={() =>
          void window.codex
            .openFileLink({
              href: safeHref,
              editor: defaultOpenDestination
            })
            .catch((error) => {
              console.error('Failed to open linked file', error)
            })
        }
        className={cx(
          'cursor-pointer text-accent underline decoration-accent/60 underline-offset-2 hover:text-foreground transition-colors',
          className
        )}
      >
        {children}
      </button>
    )
  }

  if (isExternalLink(safeHref)) {
    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noreferrer"
        className={cx(
          'text-accent underline decoration-accent/60 underline-offset-2 hover:text-foreground transition-colors',
          className
        )}
      >
        {children}
      </a>
    )
  }

  return <span className={className}>{children}</span>
}

function Paragraph({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): ReactElement {
  return (
    <p {...props} className={cx('my-3 leading-[1.7]', className)}>
      {children}
    </p>
  )
}

export default function MarkdownRenderer({
  markdown,
  className
}: MarkdownRendererProps): ReactElement | null {
  if (!markdown.trim()) return null

  return (
    <div className={cx(UI_TEXT_SIZE_CLASS, 'text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: Paragraph,
          h1: ({ className, children, ...props }) => (
            <h1
              {...props}
              className={cx(
                'mt-5 mb-3 text-ui-markdown-h1 font-semibold tracking-tight',
                className
              )}
            >
              {children}
            </h1>
          ),
          h2: ({ className, children, ...props }) => (
            <h2
              {...props}
              className={cx(
                'mt-5 mb-3 text-ui-markdown-h2 font-semibold tracking-tight',
                className
              )}
            >
              {children}
            </h2>
          ),
          h3: ({ className, children, ...props }) => (
            <h3 {...props} className={cx('mt-4 mb-2 text-ui-markdown-h3 font-semibold', className)}>
              {children}
            </h3>
          ),
          h4: ({ className, children, ...props }) => (
            <h4 {...props} className={cx('mt-4 mb-2 text-ui-markdown-h4 font-semibold', className)}>
              {children}
            </h4>
          ),
          ul: ({ className, children, ...props }) => (
            <ul {...props} className={cx('my-3 list-disc pl-5 space-y-1.5', className)}>
              {children}
            </ul>
          ),
          ol: ({ className, children, ...props }) => (
            <ol {...props} className={cx('my-3 list-decimal pl-5 space-y-1.5', className)}>
              {children}
            </ol>
          ),
          li: ({ className, children, ...props }) => (
            <li {...props} className={cx('leading-[1.7]', className)}>
              {children}
            </li>
          ),
          blockquote: ({ className, children, ...props }) => (
            <blockquote
              {...props}
              className={cx(
                'my-4 border-l-2 border-border pl-4 text-muted-foreground italic',
                className
              )}
            >
              {children}
            </blockquote>
          ),
          hr: ({ className, ...props }) => (
            <hr {...props} className={cx('my-5 border-0 border-t border-border', className)} />
          ),
          a: MarkdownLink,
          strong: ({ className, children, ...props }) => (
            <strong {...props} className={cx('font-semibold', className)}>
              {children}
            </strong>
          ),
          em: ({ className, children, ...props }) => (
            <em {...props} className={cx('italic', className)}>
              {children}
            </em>
          ),
          code: ({ className, children, ...props }) => {
            const language = getLanguage(className)
            const code = extractText(children).replace(/\n$/, '')

            if (language) {
              return <CodeBlock code={code} language={language} />
            }

            return (
              <span {...props}>
                <InlineMarkdownCode>{code}</InlineMarkdownCode>
              </span>
            )
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ className, children, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table
                {...props}
                className={cx(
                  'min-w-full border-collapse text-left text-[14px]',
                  className
                )}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ className, children, ...props }) => (
            <thead {...props} className={cx('border-b border-border', className)}>
              {children}
            </thead>
          ),
          tbody: ({ className, children, ...props }) => (
            <tbody {...props} className={cx('[&_tr:last-child]:border-b-0', className)}>
              {children}
            </tbody>
          ),
          tr: ({ className, children, ...props }) => (
            <tr {...props} className={cx('border-b border-border/70 align-top', className)}>
              {children}
            </tr>
          ),
          th: ({ className, children, ...props }) => (
            <th
              {...props}
              className={cx(
                'px-3 py-2 font-medium text-foreground bg-secondary/40 whitespace-nowrap',
                className
              )}
            >
              {children}
            </th>
          ),
          td: ({ className, children, ...props }) => (
            <td {...props} className={cx('px-3 py-2 text-muted-foreground', className)}>
              {children}
            </td>
          )
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
