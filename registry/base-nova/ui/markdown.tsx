"use client"

import * as React from "react"
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown"
import remarkGfm from "remark-gfm"
import remend from "remend"
import { cn } from "cn"

import { PENDING_HREF, classify } from "@/lib/link-pill-core"

// GitHub-flavoured Markdown as React elements, never an HTML string: raw HTML in the source is dropped
// (`skipHtml`, no rehype-raw) and a URL passes react-markdown's default transform, which keeps only http(s),
// irc(s), mailto, xmpp and relative links, so `javascript:` and `data:` never reach an href. Text is drawn
// first and only then made safe, which is the order frontend#73 set.
//
// A reply that is still arriving takes `streaming`. remend finishes half-written syntax (`**bold`, a code
// span, `[text](https://exa`) in the block being written, and the text is cut at blank lines so only that
// block is parsed again per chunk: react-markdown alone re-parses the whole reply every time.

// remend's stand-in for a link whose URL is still arriving is link-pill-core's PENDING_HREF: one value, so the
// two cannot drift. The default link and LinkPill both draw it as plain text.

type MarkdownUrlTransform = NonNullable<Options["urlTransform"]>
type MarkdownLink = React.ElementType<React.ComponentProps<"a">>

type MarkdownProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** The Markdown source. */
  children: string
  /** The reply is still arriving: finish half-written syntax and draw an unfinished link as plain text. */
  streaming?: boolean
  /**
   * The component every link is drawn with. Give it `LinkPill` to get pills, and `mention:` and `geo:` links
   * (the two schemes a pill reads) reach it; the default link never sees them. It never receives `node`, and
   * never a URL that failed the safe-scheme check.
   */
  link?: MarkdownLink
  /** How many levels a heading moves down (default 2: the page owns h1 and h2). It stops at h6. */
  headingOffset?: number
  /** Overrides for single elements, merged over the defaults. Keep the object stable between renders: it is part of what a block's re-render depends on. */
  components?: Components
  /** Remark plugins that run after `remark-gfm`. Keep the array stable between renders. */
  remarkPlugins?: NonNullable<Options["remarkPlugins"]>
  /** Rewrites a URL that has already passed the safe-scheme check. It is never called with a rejected URL or with the pending placeholder. */
  urlTransform?: MarkdownUrlTransform
}

// A line that starts a block which can tie blocks together (a link reference definition, raw HTML), or a
// footnote anywhere: the text is then parsed whole.
const DOCUMENT_WIDE_SYNTAX = /^ {0,3}(?:\[[^\]\n]+\]:|<[A-Za-z!?/])|\[\^/m
// A backtick fence's info string cannot hold a backtick, so "```a``` is code" is an inline span.
const FENCE = /^ {0,3}(`{3,}(?![^`\n]*`)|~{3,})/
// After a blank line these still belong to the block before: an indented line or another list item.
const CONTINUATION = /^(?:[ \t]|(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$))/

/**
 * Cuts Markdown at blank lines that close every open block, so each piece renders as it would inside the whole
 * text, and the pieces join back to it. A blank line inside a fenced block, before an indented line or before
 * another list item is not a cut. Returns null when the text uses syntax that spans blocks.
 */
function splitMarkdownBlocks(text: string): string[] | null {
  const source = text.replace(/\r\n?/g, "\n")
  if (DOCUMENT_WIDE_SYNTAX.test(source)) return null
  const blocks: string[] = []
  let blockStart = 0
  let lineStart = 0
  let fence: string | null = null
  let afterBlankLine = false
  for (const line of source.split("\n")) {
    const opener = FENCE.exec(line)?.[1]
    if (fence !== null) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length && line.trim() === opener) fence = null
    } else if (line.trim() === "") {
      afterBlankLine = true
    } else {
      if (afterBlankLine && lineStart > blockStart && !CONTINUATION.test(line)) {
        blocks.push(source.slice(blockStart, lineStart))
        blockStart = lineStart
      }
      afterBlankLine = false
      fence = opener ?? null
    }
    lineStart += line.length + 1
  }
  blocks.push(source.slice(blockStart))
  return blocks
}

const HEADING_CLASS = ["text-lg font-semibold", "text-base font-semibold", "text-sm font-semibold", "text-sm font-medium"]
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const

// The two schemes a LinkPill reads that react-markdown's safe list does not keep.
function isPillScheme(url: string) {
  const { kind } = classify(url)
  return kind === "mention" || kind === "location"
}

function DefaultLink({ href, className, children, ...props }: React.ComponentProps<"a">) {
  if (href === PENDING_HREF) return <>{children}</>
  const opensNewTab = href !== undefined && /^(?:https?:)?\/\//i.test(href)
  return (
    <a
      href={href}
      className={cn("text-primary underline underline-offset-3 break-words", className)}
      {...(opensNewTab ? { target: "_blank", rel: "noreferrer noopener" } : null)}
      {...props}
    >
      {children}
    </a>
  )
}

type WithNode<Props> = Props & { node?: unknown }

function defaultComponents(Link: MarkdownLink, headingOffset: number): Components {
  const heading = (level: number) => {
    const Tag = HEADING_TAGS[Math.min(level + headingOffset, 6) - 1]
    return function Heading({ node: _node, className, ...props }: WithNode<React.ComponentProps<"h1">>) {
      return <Tag className={cn("mt-4 first:mt-0", HEADING_CLASS[Math.min(level, 4) - 1], className)} {...props} />
    }
  }
  return {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    p: ({ node: _node, className, ...props }) => <p className={cn("leading-relaxed", className)} {...props} />,
    a: ({ node: _node, href, children, ...props }) => {
      // A URL that failed the safe-scheme check arrives with no href: it stays as its text.
      if (!href) return <>{children}</>
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      )
    },
    ul: ({ node: _node, className, ...props }) => (
      <ul className={cn("flex list-disc flex-col gap-1 pl-5", className?.includes("contains-task-list") && "list-none pl-1", className)} {...props} />
    ),
    ol: ({ node: _node, className, ...props }) => <ol className={cn("flex list-decimal flex-col gap-1 pl-5", className)} {...props} />,
    input: ({ node: _node, className, ...props }) => <input className={cn("mr-1.5 align-middle", className)} {...props} />,
    blockquote: ({ node: _node, className, ...props }) => <blockquote className={cn("rounded-md bg-muted/50 px-3 py-2 text-muted-foreground", className)} {...props} />,
    code: ({ node: _node, className, ...props }) => <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)} {...props} />,
    pre: ({ node: _node, className, ...props }) => (
      <pre className={cn("overflow-x-auto rounded-md bg-muted p-3 text-2xs [&_code]:bg-transparent [&_code]:p-0", className)} {...props} />
    ),
    table: ({ node: _node, className, ...props }) => (
      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-2xs", className)} {...props} />
      </div>
    ),
    th: ({ node: _node, className, ...props }) => <th className={cn("border px-2 py-1 text-left font-medium", className)} {...props} />,
    td: ({ node: _node, className, ...props }) => <td className={cn("border px-2 py-1 align-top", className)} {...props} />,
    hr: ({ node: _node, className, ...props }) => <hr className={cn("border-border", className)} {...props} />,
    img: ({ node: _node, src, alt, className, ...props }) => {
      // An image whose URL is still arriving has no src: it is left out until the URL closes.
      if (typeof src !== "string" || src === "") return null
      return <img src={src} alt={alt ?? ""} loading="lazy" className={cn("max-w-full rounded", className)} {...props} />
    },
  }
}

type MarkdownBlockProps = {
  text: string
  remarkPlugins: NonNullable<Options["remarkPlugins"]>
  urlTransform: MarkdownUrlTransform
  components: Components
}

const MarkdownBlock = React.memo(function MarkdownBlock({ text, remarkPlugins, urlTransform, components }: MarkdownBlockProps) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} skipHtml urlTransform={urlTransform} components={components}>
      {text}
    </ReactMarkdown>
  )
})

function Markdown({
  children,
  streaming = false,
  link,
  headingOffset = 2,
  components,
  remarkPlugins,
  urlTransform,
  className,
  ...props
}: MarkdownProps) {
  const mergedComponents = React.useMemo(
    () => ({ ...defaultComponents(link ?? DefaultLink, headingOffset), ...components }),
    [link, headingOffset, components],
  )
  const plugins = React.useMemo(() => [remarkGfm, ...(remarkPlugins ?? [])], [remarkPlugins])
  const hasLink = link !== undefined
  const transform = React.useMemo<MarkdownUrlTransform>(
    () => (url, key, node) => {
      if (streaming && key === "href" && url === PENDING_HREF) return url
      const safe = defaultUrlTransform(url) || (hasLink && key === "href" && isPillScheme(url) ? url : "")
      if (safe === "") return ""
      return urlTransform ? urlTransform(safe, key, node) : safe
    },
    [streaming, hasLink, urlTransform],
  )
  const blocks = React.useMemo(() => {
    if (!streaming) return [children]
    const pieces = splitMarkdownBlocks(children) ?? [children]
    // Only the block still being written can hold unfinished syntax: a blank line closed the others.
    pieces[pieces.length - 1] = remend(pieces[pieces.length - 1])
    return pieces
  }, [children, streaming])

  return (
    <div data-slot="markdown" className={cn("flex min-w-0 flex-col gap-3 text-sm break-words wrap-anywhere", className)} {...props}>
      {blocks.map((text, index) => (
        <MarkdownBlock key={index} text={text} remarkPlugins={plugins} urlTransform={transform} components={mergedComponents} />
      ))}
    </div>
  )
}

export { Markdown, splitMarkdownBlocks }
export type { MarkdownLink, MarkdownProps, MarkdownUrlTransform }
