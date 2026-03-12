import { useEffect, useState, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { ANIMATION_EASE } from '@/lib/animations'
import { createHighlighter, type Highlighter } from 'shiki'
import { toast } from 'sonner'

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'javascript',
        'typescript',
        'python',
        'bash',
        'json',
        'html',
        'css',
        'tsx',
        'jsx',
        'rust',
        'go',
        'java',
        'c',
        'cpp',
        'markdown',
        'yaml',
        'toml',
        'sql',
        'shell',
        'diff'
      ]
    })
  }
  return highlighterPromise
}

interface CodeBlockProps {
  code: string
  language?: string
}

export default function CodeBlock({ code, language = 'text' }: CodeBlockProps): ReactElement {
  const [html, setHtml] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    getHighlighter().then((highlighter) => {
      if (cancelled) return
      const langs = highlighter.getLoadedLanguages()
      const lang = langs.includes(language) ? language : 'text'
      const result = highlighter.codeToHtml(code, {
        lang,
        themes: { light: 'github-light', dark: 'github-dark' }
      })
      setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, language])

  const copyToClipboard = useCallback((): void => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    toast.success('Copied')
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: ANIMATION_EASE }}
      className="rounded-md overflow-hidden border border-border my-1.5 text-[length:var(--app-code-font-size)]"
    >
      <div className="flex items-center justify-between px-3 py-1 bg-secondary border-b border-border">
        <span className="text-ui-11 text-muted-foreground font-mono">{language}</span>
        <button
          onClick={copyToClipboard}
          className="text-ui-11 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <span className="text-green-500">Copied</span> : 'Copy'}
        </button>
      </div>
      <div className="bg-background p-3 overflow-x-auto">
        {html ? (
          <div
            dangerouslySetInnerHTML={{ __html: html }}
            className="[&_pre]:!bg-transparent [&_code]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0"
          />
        ) : (
          <pre className="text-foreground/80 font-mono">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </motion.div>
  )
}
