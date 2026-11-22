import { settle } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../registry/base-nova/ui/tooltip"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

// Opening on focus needs keyboard modality: press Tab first, as a person arriving by keyboard does.
const tabTo = (el: HTMLElement) => {
  void act(() => {
    fireEvent.keyDown(document.body, { key: "Tab" })
    el.focus()
  })
}
// Resting a mouse on an element.
const rest = (el: HTMLElement) => {
  void act(() => {
    fireEvent.pointerEnter(el, { pointerType: "mouse" })
    fireEvent.pointerMove(el, { pointerType: "mouse" })
  })
}

function Save(props: React.ComponentProps<typeof Tooltip> & { side?: "top" | "bottom" | "left" | "right" }) {
  const { side, ...root } = props
  return (
    <Tooltip {...root}>
      <TooltipTrigger aria-label="Save">S</TooltipTrigger>
      <TooltipContent side={side}>Save the file</TooltipContent>
    </Tooltip>
  )
}

// A tooltip opens at once while another one is open or was a moment ago, so a test of the delay lets the
// earlier tests' tooltips go cold first.
const cooldown = () => act(() => vi.advanceTimersByTime(10_000))

const trigger = () => screen.getByRole("button", { name: "Save" })

describe("Tooltip: behaviour (frontend#245, on @ui-sdk)", () => {
  it("stays closed until the pointer rests on the trigger", async () => {
    render(<Save />)
    expect(screen.queryByRole("tooltip")).toBeNull()

    rest(trigger())

    expect((await screen.findByRole("tooltip")).textContent).toContain("Save the file")
  })

  it("opens when keyboard focus reaches the trigger and closes when it leaves", async () => {
    render(
      <div>
        <Save />
        <button type="button">Other</button>
      </div>,
    )

    tabTo(trigger())
    expect(await screen.findByRole("tooltip")).toBeTruthy()

    act(() => screen.getByRole("button", { name: "Other" }).focus())
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
  })

  it("describes a trigger that has its own name, and reports why it opened", async () => {
    const onOpenChange = vi.fn()
    render(<Save onOpenChange={onOpenChange} />)

    tabTo(trigger())
    const tooltip = await screen.findByRole("tooltip")

    expect(trigger().getAttribute("aria-describedby")).toBe(tooltip.id)
    expect(onOpenChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: "trigger-focus" }))
  })

  it("closes on Escape and leaves focus on the trigger", async () => {
    render(<Save />)
    tabTo(trigger())
    await screen.findByRole("tooltip")

    fireEvent.keyDown(trigger(), { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
    expect(document.activeElement).toBe(trigger())
  })

  it("waits for its delay before opening on hover", async () => {
    vi.useFakeTimers()
    try {
      cooldown()
      render(<Save delay={500} />)
      fireEvent.pointerEnter(trigger(), { pointerType: "mouse" })

      act(() => vi.advanceTimersByTime(300))
      expect(screen.queryByRole("tooltip")).toBeNull()

      act(() => vi.advanceTimersByTime(300))
      expect(screen.queryByRole("tooltip")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("never opens when disabled, and the trigger keeps working", async () => {
    const onClick = vi.fn()
    render(
      <Tooltip disabled>
        <TooltipTrigger aria-label="Save" onClick={onClick}>
          S
        </TooltipTrigger>
        <TooltipContent>Save the file</TooltipContent>
      </Tooltip>,
    )

    rest(trigger())
    tabTo(trigger())
    await act(settle)
    fireEvent.click(trigger())

    expect(screen.queryByRole("tooltip")).toBeNull()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("follows a controlled open value", async () => {
    const { rerender } = render(<Save open={false} />)
    expect(screen.queryByRole("tooltip")).toBeNull()

    rerender(<Save open />)

    expect(await screen.findByRole("tooltip")).toBeTruthy()
  })

  it("places the content on the requested side and marks it open", async () => {
    render(<Save side="bottom" defaultOpen />)

    const tooltip = await screen.findByRole("tooltip")

    expect(tooltip.getAttribute("data-side")).toBe("bottom")
    expect(tooltip.hasAttribute("data-open")).toBe(true)
  })

  it("takes its delay from a TooltipProvider unless the tooltip sets one", async () => {
    vi.useFakeTimers()
    try {
      cooldown()
      render(
        <TooltipProvider delay={400}>
          <Save />
        </TooltipProvider>,
      )
      fireEvent.pointerEnter(trigger(), { pointerType: "mouse" })

      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByRole("tooltip")).toBeNull()

      act(() => vi.advanceTimersByTime(300))
      expect(screen.queryByRole("tooltip")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("opens at once with a TooltipProvider that sets no delay", async () => {
    render(
      <TooltipProvider>
        <Save />
      </TooltipProvider>,
    )

    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" })

    expect(screen.queryByRole("tooltip")).toBeTruthy()
  })
})

describe("Tooltip: the same component API for consumers", () => {
  it("keeps className and extra props on the content, and draws the arrow", async () => {
    render(
      <Tooltip defaultOpen>
        <TooltipTrigger aria-label="Save">S</TooltipTrigger>
        <TooltipContent className="custom-content" data-testid="content">
          Save the file
        </TooltipContent>
      </Tooltip>,
    )

    const content = await screen.findByTestId("content")

    expect(content.getAttribute("data-slot")).toBe("tooltip-content")
    expect(content.className).toContain("custom-content")
    expect(content.className).toContain("bg-foreground")
    expect(content.querySelector('[data-slot="tooltip-arrow"]')).toBeTruthy()
  })
})

describe("Tooltip: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/tooltip.tsx"), "utf8")

  it("styles with data-open, data-closed and data-side, which the SDK sets", () => {
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
    expect(source).toContain("data-[side=top]")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/tooltip")
  })
})

describe("Tooltip: accessibility", () => {
  it("has no axe violations with the tooltip open", async () => {
    const { container } = render(<Save defaultOpen />)
    await screen.findByRole("tooltip")

    const results = await axe.run(container.ownerDocument.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
