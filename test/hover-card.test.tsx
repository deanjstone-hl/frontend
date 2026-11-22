import { settle } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HoverCard, HoverCardContent, HoverCardTrigger } from "../registry/base-nova/ui/hover-card"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

// Opening on focus needs keyboard modality: press Tab first, as a person arriving by keyboard does.
const tabTo = (el: HTMLElement) =>
  act(() => {
    fireEvent.keyDown(document.body, { key: "Tab" })
    el.focus()
  })
// Resting a mouse on an element.
const rest = (el: HTMLElement) =>
  act(() => {
    fireEvent.pointerEnter(el, { pointerType: "mouse" })
    fireEvent.pointerMove(el, { pointerType: "mouse" })
  })

function Profile(props: React.ComponentProps<typeof HoverCard>) {
  return (
    <HoverCard delay={0} closeDelay={0} {...props}>
      <HoverCardTrigger render={<a href="/profile" />}>@dean</HoverCardTrigger>
      <HoverCardContent>Profile preview</HoverCardContent>
    </HoverCard>
  )
}

const link = () => screen.getByRole("link", { name: "@dean" })

describe("HoverCard: behaviour (frontend#245, on @ui-sdk)", () => {
  it("shows its content when open and keeps the trigger a link", async () => {
    render(<Profile open />)

    expect(await screen.findByText("Profile preview")).toBeTruthy()
    expect(link().getAttribute("href")).toBe("/profile")
  })

  it("stays closed until the pointer rests on the link", async () => {
    render(<Profile />)
    expect(screen.queryByText("Profile preview")).toBeNull()

    rest(link())

    expect(await screen.findByText("Profile preview")).toBeTruthy()
  })

  it("opens on keyboard focus and closes with Escape", async () => {
    render(<Profile />)

    tabTo(link())
    expect(await screen.findByText("Profile preview")).toBeTruthy()

    fireEvent.keyDown(link(), { key: "Escape" })
    await waitFor(() => expect(screen.queryByText("Profile preview")).toBeNull())
  })

  it("waits for its delay before opening", () => {
    vi.useFakeTimers()
    try {
      render(<Profile delay={400} />)
      fireEvent.pointerEnter(link(), { pointerType: "mouse" })

      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByText("Profile preview")).toBeNull()

      act(() => vi.advanceTimersByTime(300))
      expect(screen.queryByText("Profile preview")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports why it opened", async () => {
    const onOpenChange = vi.fn()
    render(<Profile onOpenChange={onOpenChange} />)

    rest(link())
    await screen.findByText("Profile preview")

    expect(onOpenChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: expect.any(String) }))
  })

  it("never opens when disabled, and the link still works", async () => {
    render(<Profile disabled />)

    rest(link())
    tabTo(link())
    await act(settle)

    expect(screen.queryByText("Profile preview")).toBeNull()
    expect(link().getAttribute("href")).toBe("/profile")
  })

  it("follows a controlled open value", async () => {
    const { rerender } = render(<Profile open={false} />)
    expect(screen.queryByText("Profile preview")).toBeNull()

    rerender(<Profile open />)

    expect(await screen.findByText("Profile preview")).toBeTruthy()
  })
})

describe("HoverCard: the same component API for consumers", () => {
  it("places the content below by default and keeps className and extra props", async () => {
    render(
      <HoverCard open>
        <HoverCardTrigger render={<a href="/profile" />}>@dean</HoverCardTrigger>
        <HoverCardContent className="custom-content" data-testid="content">
          Profile preview
        </HoverCardContent>
      </HoverCard>,
    )

    const content = await screen.findByTestId("content")

    expect(content.getAttribute("data-slot")).toBe("hover-card-content")
    expect(content.getAttribute("data-side")).toBe("bottom")
    expect(content.className).toContain("custom-content")
    expect(content.className).toContain("bg-popover")
  })
})

describe("HoverCard: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/hover-card.tsx"), "utf8")

  it("styles with data-open and data-closed, which the SDK sets", async () => {
    render(<Profile open />)

    expect((await screen.findByText("Profile preview")).hasAttribute("data-open")).toBe(true)
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/hover-card")
  })
})

describe("HoverCard: accessibility", () => {
  it("has no axe violations with the card open", async () => {
    const { container } = render(<Profile open />)
    await screen.findByText("Profile preview")

    const results = await axe.run(container.ownerDocument.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
