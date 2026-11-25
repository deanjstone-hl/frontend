import { cleanup, render, screen } from "@testing-library/react"
import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"

import { PENDING_HREF } from "../registry/lib/link-pill-core"
import { LinkPill } from "../registry/base-nova/ui/link-pill"
import { INCOMPLETE_LINK_HREF, Markdown, splitMarkdownBlocks } from "../registry/base-nova/ui/markdown"

// The renderer behind `markdown` is react-markdown with remark-gfm, and remend to finish a half-written reply
// (frontend#221 compares it with the zero-dependency parser in briefings and with T3 Code's). These tests hold
// the four constraints frontend#73 set: GFM, a `components.a` hook the LinkPill drops into, render then
// sanitise (Markdown becomes React elements, never an HTML string), and a pending placeholder in a stream.

afterEach(cleanup)

const html = (container: HTMLElement) => container.querySelector('[data-slot="markdown"]')?.innerHTML ?? ""

describe("Markdown: GitHub-flavoured Markdown", () => {
  it("draws a table inside a box that scrolls sideways, so a wide table cannot widen the page", () => {
    const { container } = render(<Markdown>{"| a | b |\n|---|---|\n| 1 | 2 |"}</Markdown>)
    const table = container.querySelector("table")
    expect(table).not.toBeNull()
    expect(table?.parentElement?.className).toContain("overflow-x-auto")
    expect(screen.getByRole("columnheader", { name: "a" })).toBeTruthy()
    expect(screen.getByRole("cell", { name: "2" })).toBeTruthy()
  })

  it("draws strikethrough, a task list with disabled checkboxes, and a bare URL as a link", () => {
    const { container } = render(<Markdown>{"~~gone~~\n\n- [x] done\n- [ ] todo\n\nsee https://example.dev/a now"}</Markdown>)
    expect(container.querySelector("del")?.textContent).toBe("gone")
    const boxes = container.querySelectorAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect([...boxes].every((box) => (box as HTMLInputElement).disabled)).toBe(true)
    expect((boxes[0] as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole("link", { name: "https://example.dev/a" }).getAttribute("href")).toBe("https://example.dev/a")
  })

  it("draws a footnote, nested lists, a blockquote, a rule, a reference link and an image", () => {
    const { container } = render(
      <Markdown>
        {"a[^1]\n\n[^1]: the note\n\n- a\n  - b\n\n> quoted\n\n---\n\n[ref][r] and ![alt](https://example.dev/a.png)\n\n[r]: https://example.dev/r"}
      </Markdown>,
    )
    expect(container.querySelector("section[data-footnotes]")).not.toBeNull()
    expect(container.querySelector("ul ul")).not.toBeNull()
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted")
    expect(container.querySelector("hr")).not.toBeNull()
    expect(screen.getByRole("link", { name: "ref" }).getAttribute("href")).toBe("https://example.dev/r")
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("alt")
  })

  it("keeps a fenced block's language on its code element, so a highlighter can find it", () => {
    const { container } = render(<Markdown>{"```ts\nconst a = 1\n```"}</Markdown>)
    expect(container.querySelector("pre code")?.className).toContain("language-ts")
  })

  it("draws nothing for an empty string, but keeps the box", () => {
    const { container } = render(<Markdown>{""}</Markdown>)
    expect(container.querySelector('[data-slot="markdown"]')?.childElementCount).toBe(0)
  })

  it("shifts headings two levels down by default, because the page owns h1 and h2, and clamps at h6", () => {
    const { container } = render(<Markdown>{"# one\n\n## two\n\n###### six"}</Markdown>)
    expect(container.querySelector("h3")?.textContent).toBe("one")
    expect(container.querySelector("h4")?.textContent).toBe("two")
    expect(container.querySelectorAll("h6")).toHaveLength(1)
    expect(container.querySelector("h1")).toBeNull()
  })

  it("takes the shift as a prop: 0 keeps the written levels", () => {
    const { container } = render(<Markdown headingOffset={0}>{"# one\n\n## two"}</Markdown>)
    expect(container.querySelector("h1")?.textContent).toBe("one")
    expect(container.querySelector("h2")?.textContent).toBe("two")
  })

  it("wraps long words and takes the root's className and other div props", () => {
    const { container } = render(
      <Markdown className="extra" id="body" data-testid="md">
        {"text"}
      </Markdown>,
    )
    const root = container.querySelector('[data-slot="markdown"]') as HTMLElement
    expect(root.className).toContain("wrap-anywhere")
    expect(root.className).toContain("extra")
    expect(root.id).toBe("body")
    expect(root.getAttribute("data-testid")).toBe("md")
  })
})

describe("Markdown: render, then sanitise", () => {
  it("drops raw HTML: a script, an event handler, an iframe", () => {
    const { container } = render(
      <Markdown>{'before <script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<iframe src="https://evil.dev"></iframe>\n\nafter'}</Markdown>,
    )
    expect(container.querySelector("script, iframe, img")).toBeNull()
    expect(html(container)).not.toMatch(/onerror/i)
    expect(container.textContent).toContain("after")
  })

  it.each([
    ["javascript:", "[x](javascript:alert(1))"],
    ["JaVaScRiPt:", "[x](JaVaScRiPt:alert(1))"],
    ["data:", "[x](data:text/html,hi)"],
    ["vbscript:", "[x](vbscript:msgbox(1))"],
  ])("draws a %s link as its text, with no anchor and no empty href", (_scheme, source) => {
    const { container } = render(<Markdown>{source}</Markdown>)
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toBe("x")
  })

  it("keeps http, https, mailto, relative and in-page links", () => {
    const { container } = render(
      <Markdown>{"[a](https://example.dev) [b](http://example.dev) [c](mailto:me@example.dev) [d](/docs/x) [e](#top)"}</Markdown>,
    )
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "https://example.dev",
      "http://example.dev",
      "mailto:me@example.dev",
      "/docs/x",
      "#top",
    ])
  })

  it("opens an absolute link in a new tab with noopener, and leaves a relative or in-page one in the tab", () => {
    render(<Markdown>{"[abs](https://example.dev) [rel](/docs/x) [top](#top)"}</Markdown>)
    const abs = screen.getByRole("link", { name: "abs" })
    expect(abs.getAttribute("target")).toBe("_blank")
    expect(abs.getAttribute("rel")).toBe("noreferrer noopener")
    expect(screen.getByRole("link", { name: "rel" }).getAttribute("target")).toBeNull()
    expect(screen.getByRole("link", { name: "top" }).getAttribute("target")).toBeNull()
  })

  it("loads an image lazily and keeps it inside its box", () => {
    const { container } = render(<Markdown>{"![alt](https://example.dev/a.png)"}</Markdown>)
    const image = container.querySelector("img")
    expect(image?.getAttribute("loading")).toBe("lazy")
    expect(image?.className).toContain("max-w-full")
  })
})

describe("Markdown: the link hook", () => {
  it("hands every link to the `link` component with its href and children, and no `node`", () => {
    const seen: Array<{ href?: string; text: string; props: string[] }> = []
    const Probe = ({ href, children, ...rest }: React.ComponentProps<"a">) => {
      seen.push({ href, text: String(children), props: Object.keys(rest) })
      return <a href={href}>{children}</a>
    }
    render(<Markdown link={Probe}>{"[one](https://example.dev/1) and [two](/two)"}</Markdown>)
    expect(seen.map(({ href, text }) => [href, text])).toEqual([
      ["https://example.dev/1", "one"],
      ["/two", "two"],
    ])
    expect(seen.every(({ props }) => !props.includes("node"))).toBe(true)
  })

  it("lets LinkPill be the link: a mention becomes a pill and a plain URL becomes a URL pill", () => {
    const { container } = render(
      <Markdown link={LinkPill}>{"[Tex](mention:agent/tex) and [docs](https://example.dev/docs)"}</Markdown>,
    )
    const pills = container.querySelectorAll("a.link-pill")
    expect(pills).toHaveLength(2)
    expect(pills[0].className).toContain("link-pill--mention")
    expect(pills[0].textContent).toContain("Tex")
  })

  it("never gives the link component a link it must not follow: a script URL reaches it as plain text", () => {
    const Probe = ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>
    const { container } = render(<Markdown link={Probe}>{"[x](javascript:alert(1))"}</Markdown>)
    expect(container.querySelector("a")).toBeNull()
  })

  it("uses the same pending href as LinkPill, so the two cannot drift", () => {
    expect(INCOMPLETE_LINK_HREF).toBe(PENDING_HREF)
  })
})

describe("Markdown: a reply that is still streaming", () => {
  it("leaves half-written syntax as written when it is not streaming", () => {
    const { container } = render(<Markdown>{"This is **bold"}</Markdown>)
    expect(container.querySelector("strong")).toBeNull()
    expect(container.textContent).toBe("This is **bold")
  })

  it("finishes unfinished bold, italic and code while it streams, so the text does not jump when it closes", () => {
    const { container } = render(<Markdown streaming>{"This is **bold and `code"}</Markdown>)
    expect(container.querySelector("strong")?.textContent).toContain("bold and")
    expect(container.querySelector("code")?.textContent).toBe("code")
  })

  it("draws a half-written link as its text, not as a link, with the default link", () => {
    const { container } = render(<Markdown streaming>{"See [the docs](https://exa"}</Markdown>)
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toBe("See the docs")
  })

  it("hands a half-written link to the `link` component with the pending href, which LinkPill draws as text", () => {
    const hrefs: Array<string | undefined> = []
    const Probe = ({ href, children }: React.ComponentProps<"a">) => {
      hrefs.push(href)
      return <a href={href}>{children}</a>
    }
    render(<Markdown streaming link={Probe}>{"See [the docs](https://exa"}</Markdown>)
    expect(hrefs).toEqual([PENDING_HREF])

    cleanup()
    const { container } = render(
      <Markdown streaming link={LinkPill}>
        {"See [the docs](https://exa"}
      </Markdown>,
    )
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toBe("See the docs")
  })

  it("turns the half-written link into the real link once the URL closes", () => {
    const { container, rerender } = render(<Markdown streaming>{"See [the docs](https://exa"}</Markdown>)
    expect(container.querySelector("a")).toBeNull()
    rerender(<Markdown streaming>{"See [the docs](https://example.dev/docs)"}</Markdown>)
    expect(screen.getByRole("link", { name: "the docs" }).getAttribute("href")).toBe("https://example.dev/docs")
  })

  it("draws no image for a half-written image, and no empty src", () => {
    const { container } = render(<Markdown streaming>{"Look: ![a chart](https://example.dev/ch"}</Markdown>)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("[src='']")).toBeNull()
  })

  it("keeps an open code fence open, and does not close a fence inside it", () => {
    const { container } = render(<Markdown streaming>{"```ts\nconst a = 1\n\nconst b = 2"}</Markdown>)
    expect(container.querySelector("pre code")?.textContent).toContain("const b = 2")
  })

  it("re-parses only the block still being written", () => {
    let paragraphs = 0
    const components = {
      p: ({ node: _node, ...props }: React.ComponentProps<"p"> & { node?: unknown }) => {
        paragraphs++
        return <p {...props} />
      },
    }
    const { rerender } = render(
      <Markdown streaming components={components}>
        {"first\n\nsecond\n\nthird wri"}
      </Markdown>,
    )
    expect(paragraphs).toBe(3)
    rerender(
      <Markdown streaming components={components}>
        {"first\n\nsecond\n\nthird written"}
      </Markdown>,
    )
    expect(paragraphs).toBe(4)
    rerender(
      <Markdown streaming components={components}>
        {"first\n\nsecond\n\nthird written\n\nfourth"}
      </Markdown>,
    )
    expect(paragraphs).toBe(6)
  })

  it("renders a streamed message the same as the finished one", () => {
    const finished = [
      "# Title",
      "",
      "Some **bold** text with a [link](https://example.dev) and `code`.",
      "",
      "- one",
      "- two",
      "  - nested",
      "",
      "1. first",
      "",
      "2. second, a loose item",
      "",
      "```ts",
      "const a = 1",
      "",
      "const b = 2",
      "```",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "> a quote",
      "",
      "Setext",
      "------",
      "",
      "text after",
    ].join("\n")
    const whole = render(<Markdown>{finished}</Markdown>)
    const wholeHtml = html(whole.container)
    cleanup()
    const streamed = render(<Markdown streaming>{finished}</Markdown>)
    expect(html(streamed.container)).toBe(wholeHtml)
  })
})

describe("Markdown: the hooks a consumer keeps", () => {
  it("runs a consumer's remark plugin on the Markdown tree: ops-hub links `#N` to its own page this way", () => {
    // A plugin that has an effect we can see: it uppercases every text node it is given.
    const shout = () => (tree: unknown) => {
      const walk = (node: { type: string; value?: string; children?: unknown[] }) => {
        if (node.type === "text" && node.value) node.value = node.value.toUpperCase()
        for (const child of node.children ?? []) walk(child as typeof node)
      }
      walk(tree as { type: string; children?: unknown[] })
    }
    const { container } = render(<Markdown remarkPlugins={[shout]}>{"quiet ~~gone~~"}</Markdown>)
    expect(container.textContent).toBe("QUIET GONE")
    expect(container.querySelector("del")).not.toBeNull()
  })

  it("lets a consumer rewrite URLs, after the safe-scheme check and never on the pending placeholder", () => {
    const calls: string[] = []
    const urlTransform = (url: string) => {
      calls.push(url)
      return url.replace("github.com", "hub.example.dev")
    }
    const { container } = render(
      <Markdown streaming urlTransform={urlTransform}>
        {"[a](https://github.com/o/r/issues/1) [b](javascript:alert(1)) and [c](https://exa"}
      </Markdown>,
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://hub.example.dev/o/r/issues/1")
    expect(calls).toEqual(["https://github.com/o/r/issues/1"])
    expect(container.querySelectorAll("a")).toHaveLength(1)
  })

  it("lets a consumer override one element and keeps the rest", () => {
    const components = { blockquote: (props: React.ComponentProps<"blockquote">) => <aside data-quote="1">{props.children}</aside> }
    const { container } = render(<Markdown components={components}>{"> said\n\n**bold**"}</Markdown>)
    expect(container.querySelector("aside[data-quote]")?.textContent).toContain("said")
    expect(container.querySelector("strong")?.textContent).toBe("bold")
  })
})

describe("splitMarkdownBlocks", () => {
  it("cuts at a blank line", () => {
    expect(splitMarkdownBlocks("a\n\nb\n\nc")).toEqual(["a\n\n", "b\n\n", "c"])
  })

  it("keeps the text whole when joined", () => {
    const text = "# t\n\npara one\nstill one\n\n- a\n- b\n\nend"
    expect(splitMarkdownBlocks(text)?.join("")).toBe(text)
  })

  it("does not cut inside a fenced block, a tilde fence or a longer fence", () => {
    expect(splitMarkdownBlocks("```\na\n\nb\n```\n\nafter")).toEqual(["```\na\n\nb\n```\n\n", "after"])
    expect(splitMarkdownBlocks("~~~\na\n\nb\n~~~\n\nafter")).toEqual(["~~~\na\n\nb\n~~~\n\n", "after"])
    expect(splitMarkdownBlocks("````\n```\n\n```\n````\n\nafter")).toEqual(["````\n```\n\n```\n````\n\n", "after"])
  })

  it("treats an unclosed fence as running to the end", () => {
    expect(splitMarkdownBlocks("before\n\n```ts\na\n\nb")).toEqual(["before\n\n", "```ts\na\n\nb"])
  })

  it("keeps a loose list and an indented continuation in one block", () => {
    expect(splitMarkdownBlocks("- a\n\n- b\n\n  more of b\n\nafter")).toEqual(["- a\n\n- b\n\n  more of b\n\n", "after"])
    expect(splitMarkdownBlocks("1. a\n\n2. b")).toEqual(["1. a\n\n2. b"])
  })

  it("gives up (null) when blocks can depend on each other: a definition, a footnote, raw HTML", () => {
    expect(splitMarkdownBlocks("[a][r]\n\n[r]: https://example.dev")).toBeNull()
    expect(splitMarkdownBlocks("a[^1]\n\nb\n\n[^1]: note")).toBeNull()
    expect(splitMarkdownBlocks("a\n\n<div>\n\nb\n\n</div>")).toBeNull()
  })

  it("takes Windows line endings", () => {
    expect(splitMarkdownBlocks("a\r\n\r\nb")).toEqual(["a\n\n", "b"])
  })

  it("returns one block for text with no blank line", () => {
    expect(splitMarkdownBlocks("just one line")).toEqual(["just one line"])
    expect(splitMarkdownBlocks("")).toEqual([""])
  })
})
