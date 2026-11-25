import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../registry/base-nova/ui/drawer"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

type SwipeDirection = "down" | "up" | "left" | "right"

function Example(
  props: React.ComponentProps<typeof Drawer> & { showCloseButton?: boolean; swipeDirection?: SwipeDirection },
) {
  const { showCloseButton, ...root } = props
  return (
    <div>
      <Drawer {...root}>
        <DrawerTrigger>Filters</DrawerTrigger>
        <DrawerContent showCloseButton={showCloseButton}>
          <DrawerHeader>
            <DrawerTitle>Filters</DrawerTitle>
            <DrawerDescription>Narrow down the results.</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <DrawerClose>Done</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <button type="button">Outside</button>
    </div>
  )
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Filters" }))
  return screen.findByRole("dialog", { name: "Filters" })
}

describe("Drawer: behaviour (frontend#248, on @ui-sdk)", () => {
  it("stays closed until its trigger is pressed", () => {
    render(<Example />)

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens a modal dialog named by its title and described by its description", async () => {
    render(<Example />)

    const drawer = await open()

    expect(drawer.getAttribute("aria-modal")).toBe("true")
    expect(document.getElementById(drawer.getAttribute("aria-describedby")!)?.textContent).toBe("Narrow down the results.")
  })

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Example />)
    await open()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Filters" })))
  })

  it("closes from the corner button and from a DrawerClose", async () => {
    render(<Example showCloseButton />)
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await open()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("closes on a press of the overlay", async () => {
    const { baseElement } = render(<Example />)
    await open()
    const overlay = baseElement.querySelector('[data-slot="drawer-overlay"]') as HTMLElement

    fireEvent.pointerDown(overlay)
    fireEvent.mouseDown(overlay)
    fireEvent.pointerUp(overlay)
    fireEvent.mouseUp(overlay)
    fireEvent.click(overlay)

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("reports why it opened and closed through onOpenChange(open, details)", async () => {
    const onOpenChange = vi.fn()
    render(<Example onOpenChange={onOpenChange} />)

    await open()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "close-press" })),
    )
  })

  it("follows a controlled open value", async () => {
    const { rerender } = render(<Example open={false} />)
    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(<Example open />)

    expect(await screen.findByRole("dialog")).toBeTruthy()
  })

  it("has no close button by default and a labelled one when asked", async () => {
    const { rerender } = render(<Example open />)
    await screen.findByRole("dialog")
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()

    rerender(<Example open showCloseButton />)

    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy()
  })

  it("leaves the page usable behind a modal={false} drawer, with no overlay", async () => {
    const { baseElement } = render(<Example open modal={false} />)

    const drawer = await screen.findByRole("dialog")

    expect(drawer.getAttribute("aria-modal")).not.toBe("true")
    expect(baseElement.querySelector('[data-slot="drawer-overlay"]')).toBeNull()
  })
})

describe("Drawer: the same component API for consumers", () => {
  it.each([
    ["down", "bottom", "y"],
    ["up", "top", "y"],
    ["left", "left", "x"],
    ["right", "right", "x"],
  ] as const)("swipeDirection %s comes from the %s edge, on the %s axis", async (swipeDirection, side, axis) => {
    render(<Example open swipeDirection={swipeDirection} />)
    const drawer = await screen.findByRole("dialog")

    expect(drawer.getAttribute("data-side")).toBe(side)
    expect(drawer.getAttribute("data-swipe-direction")).toBe(swipeDirection)
    expect(drawer.getAttribute("data-swipe-axis")).toBe(axis)
  })

  it("defaults to a bottom drawer you swipe down", async () => {
    render(<Example open />)
    const drawer = await screen.findByRole("dialog")

    expect(drawer.getAttribute("data-side")).toBe("bottom")
    expect(drawer.getAttribute("data-swipe-direction")).toBe("down")
  })

  it("marks a drawer with snap points, and rests it on the first", async () => {
    render(<Example open snapPoints={[0.5, 1]} />)
    const drawer = await screen.findByRole("dialog")

    expect(drawer.hasAttribute("data-snap-points")).toBe(true)
    expect(drawer.getAttribute("data-snap-point")).toBe("0.5")
  })

  it("marks no snap points when there are none", async () => {
    render(<Example open />)

    expect((await screen.findByRole("dialog")).hasAttribute("data-snap-points")).toBe(false)
  })

  it("draws the swipe handle only when asked, as a decorative bar", async () => {
    const { baseElement, rerender } = render(<Example open />)
    await screen.findByRole("dialog")
    expect(baseElement.querySelector('[data-slot="drawer-swipe-handle"]')).toBeNull()

    rerender(<Example open showSwipeHandle />)

    const handle = baseElement.querySelector('[data-slot="drawer-swipe-handle"]')
    expect(handle?.getAttribute("aria-hidden")).toBe("true")
  })

  it("keeps the sheet on the SDK's drawer-content slot and the rest on theirs", async () => {
    const { baseElement } = render(<Example open showCloseButton />)
    const drawer = await screen.findByRole("dialog")

    expect(drawer.getAttribute("data-slot")).toBe("drawer-content")
    for (const slot of [
      "drawer-overlay",
      "drawer-header",
      "drawer-footer",
      "drawer-title",
      "drawer-description",
      "drawer-close",
    ]) {
      expect(baseElement.querySelector(`[data-slot="${slot}"]`), slot).toBeTruthy()
    }
  })

  it("passes className and extra props to the sheet", async () => {
    render(
      <Drawer open>
        <DrawerContent className="custom-drawer" data-testid="drawer">
          <DrawerTitle>T</DrawerTitle>
          <DrawerDescription>D</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    )

    const drawer = await screen.findByTestId("drawer")

    expect(drawer.className).toContain("custom-drawer")
    expect(drawer.className).toContain("bg-popover")
  })
})

// ui#1010: under the scroll-snap driver a swipe moves the sheet by scrolling its host, so a sheet
// or any wrapper inside it that is a scroll container (overflow hidden, auto or scroll) traps every
// swipe that starts in it, and the SDK writes overscroll-behavior: contain on the sheet itself.
// The handle half is fixed upstream (beta.16); the sheet half is not, so the drawer clips its
// rounded corners with overflow-clip, which is not a scroll container. Drop this when
// vercel-labs/ui#1010 closes and a pinned release carries the fix.
describe("Drawer: no scroll container around a swipe (ui#1010 workaround)", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/drawer.tsx"), "utf8")
  const scrollContainer = /(?<![-\w:])(?:[\w-]+:)*overflow(?:-[xy])?-(?:hidden|auto|scroll)\b/

  it("clips with overflow-clip", () => {
    expect(source).toContain("overflow-clip")
  })

  it("has no overflow-hidden, overflow-auto or overflow-scroll class in the drawer", () => {
    expect(source.match(scrollContainer)).toBeNull()
  })

  it("does not set overscroll-contain, which only makes sense on a scroll container", () => {
    expect(source).not.toContain("overscroll-contain")
  })

  it("wraps the content in an element that clips and is not a scroll container", async () => {
    const { baseElement } = render(<Example open />)
    await screen.findByRole("dialog")

    const body = baseElement.querySelector('[data-slot="drawer-body"]')

    expect(body?.className).toContain("overflow-clip")
    expect(body?.className).not.toMatch(/overflow-(hidden|auto|scroll)/)
  })
})

describe("Drawer: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/drawer.tsx"), "utf8")

  it("leaves the slide, the swipe and the stack to the SDK", () => {
    for (const own of ["--drawer-swipe-movement", "--closed-transform", "--stack-", "will-change-transform"]) {
      expect(source, own).not.toContain(own)
    }
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/drawer")
  })
})

describe("Drawer: accessibility", () => {
  it("passes the SDK's dialog pattern check", async () => {
    const checkVisibility = Element.prototype.checkVisibility
    // jsdom has no layout, so the focus trap sees no visible tab stop: tell it everything is visible.
    Element.prototype.checkVisibility = () => true
    try {
      render(<Example />)
      const drawer = await open()
      await act(async () => {})

      await checkPattern(drawer, "dialog")
    } finally {
      Element.prototype.checkVisibility = checkVisibility
    }
  })

  it("has no axe violations while open", async () => {
    render(<Example />)
    await open()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
