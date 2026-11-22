import { checkPattern } from "@ui-sdk/core/testing"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../registry/base-nova/ui/collapsible"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const getTrigger = (name = "Order details") => screen.getByRole("button", { name })

function Details(props: React.ComponentProps<typeof Collapsible> & { keepMounted?: boolean; hiddenUntilFound?: boolean }) {
  const { keepMounted, hiddenUntilFound, ...root } = props
  return (
    <Collapsible {...root}>
      <CollapsibleTrigger>Order details</CollapsibleTrigger>
      <CollapsibleContent keepMounted={keepMounted} hiddenUntilFound={hiddenUntilFound}>
        2 × Linen shirt
      </CollapsibleContent>
    </Collapsible>
  )
}

describe("Collapsible: behaviour (frontend#245, on @ui-sdk)", () => {
  it("starts closed: the trigger says so and the panel is not on the page", () => {
    render(<Details />)

    expect(getTrigger().getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("2 × Linen shirt")).toBeNull()
  })

  it("starts open with defaultOpen", () => {
    render(<Details defaultOpen />)

    expect(getTrigger().getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("2 × Linen shirt")).toBeTruthy()
  })

  it("opens and closes on click and reports the new value first, then the reason", () => {
    const onOpenChange = vi.fn()
    render(<Details onOpenChange={onOpenChange} />)

    fireEvent.click(getTrigger())
    expect(getTrigger().getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("2 × Linen shirt")).toBeTruthy()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    fireEvent.click(getTrigger())
    expect(getTrigger().getAttribute("aria-expanded")).toBe("false")
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "trigger-press" }))
  })

  it("points the trigger at its panel", () => {
    render(<Details defaultOpen />)

    const panel = screen.getByText("2 × Linen shirt")
    expect(getTrigger().getAttribute("aria-controls")).toBe(panel.id)
  })

  it("follows the controlled value and lets the owner refuse a change", () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Details open={false} onOpenChange={onOpenChange} />)

    fireEvent.click(getTrigger())
    expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything())
    expect(screen.queryByText("2 × Linen shirt")).toBeNull()

    rerender(<Details open onOpenChange={onOpenChange} />)
    expect(screen.getByText("2 × Linen shirt")).toBeTruthy()
  })

  it("ignores clicks while disabled", () => {
    const onOpenChange = vi.fn()
    render(<Details disabled onOpenChange={onOpenChange} />)

    fireEvent.click(getTrigger())

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByText("2 × Linen shirt")).toBeNull()
  })

  it("keeps a closed panel mounted and hidden with keepMounted", () => {
    render(<Details keepMounted />)

    const panel = screen.getByText("2 × Linen shirt")
    expect(panel.hasAttribute("hidden")).toBe(true)

    fireEvent.click(getTrigger())
    expect(screen.getByText("2 × Linen shirt").hasAttribute("hidden")).toBe(false)
  })

  it("keeps a closed panel findable in the page with hiddenUntilFound", () => {
    render(<Details hiddenUntilFound />)

    expect(screen.getByText("2 × Linen shirt").getAttribute("hidden")).toBe("until-found")
  })
})

describe("Collapsible: the same component API for consumers", () => {
  it("passes className and extra props through to the root, trigger and panel", () => {
    const { container } = render(
      <Collapsible className="root" data-testid="root" defaultOpen>
        <CollapsibleTrigger className="trigger">Order details</CollapsibleTrigger>
        <CollapsibleContent className="panel" data-testid="panel">
          2 × Linen shirt
        </CollapsibleContent>
      </Collapsible>,
    )

    expect(container.querySelector(".root")?.getAttribute("data-testid")).toBe("root")
    expect(getTrigger().className).toContain("trigger")
    expect(screen.getByTestId("panel").className).toContain("panel")
  })

  it("exposes the open state as data-open on every part, where Base UI used data-panel-open", () => {
    const { container } = render(<Details defaultOpen />)

    for (const element of [container.firstElementChild!, getTrigger(), screen.getByText("2 × Linen shirt")]) {
      expect(element.hasAttribute("data-open")).toBe(true)
      expect(element.hasAttribute("data-panel-open")).toBe(false)
    }
  })

  it("names its slots as the SDK does (the panel was collapsible-content on Base UI)", () => {
    const { container } = render(<Details defaultOpen />)

    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("collapsible")
    expect(getTrigger().getAttribute("data-slot")).toBe("collapsible-trigger")
    expect(screen.getByText("2 × Linen shirt").getAttribute("data-slot")).toBe("collapsible-panel")
  })

  it("lets a render element give a part its own slot, since a data-slot prop is ignored", () => {
    const { container } = render(
      <Collapsible defaultOpen data-slot="ignored" render={<section data-slot="mine" />}>
        <CollapsibleTrigger render={<button data-slot="my-trigger" />}>Order details</CollapsibleTrigger>
        <CollapsibleContent render={<div data-slot="my-panel" />}>2 × Linen shirt</CollapsibleContent>
      </Collapsible>,
    )

    expect(container.firstElementChild!.tagName).toBe("SECTION")
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("mine")
    expect(getTrigger().getAttribute("data-slot")).toBe("my-trigger")
    expect(screen.getByText("2 × Linen shirt").getAttribute("data-slot")).toBe("my-panel")
  })

  it("measures the panel height into --collapsible-panel-height for animation", () => {
    render(<Details defaultOpen />)

    expect(screen.getByText("2 × Linen shirt").style.getPropertyValue("--collapsible-panel-height")).not.toBe("")
  })
})

describe("Collapsible: no Base UI left", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
  const source = read("registry/base-nova/ui/collapsible.tsx")

  it("leaves no block or item keying off Base UI's data-panel-open", () => {
    for (const path of ["blocks/file-diff.tsx", "blocks/grouped-list.tsx", "ui/trace.tsx"]) {
      expect(read(`registry/base-nova/${path}`)).not.toContain("data-panel-open")
    }
  })

  it("imports the SDK, not Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/collapsible")
  })
})

describe("Collapsible: accessibility", () => {
  it("passes the SDK's disclosure pattern check", async () => {
    const { container } = render(<Details />)

    await checkPattern(container, "disclosure")
  })

  it("has no axe violations, open or closed", async () => {
    const { container } = render(
      <div>
        <Details defaultOpen />
        <Details />
      </div>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, "duplicate-id-aria": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
