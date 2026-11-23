import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../registry/base-nova/ui/navigation-menu"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

function SiteNav(props: React.ComponentProps<typeof NavigationMenu>) {
  return (
    <div>
      <NavigationMenu aria-label="Site" {...props}>
        <NavigationMenuList>
          <NavigationMenuItem value="products">
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#argus">Argus</NavigationMenuLink>
              <NavigationMenuLink href="#atto1">Atto1</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem value="docs">
            <NavigationMenuTrigger>Docs</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#guides">Guides</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem value="about">
            <NavigationMenuLink href="#about" active>
              About
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuIndicator />
      </NavigationMenu>
      <button type="button">Outside</button>
    </div>
  )
}

const products = () => screen.getByRole("button", { name: "Products" })
const docs = () => screen.getByRole("button", { name: "Docs" })
const key = (name: string, target: Element = document.activeElement as Element) =>
  fireEvent.keyDown(target, { key: name })

describe("NavigationMenu: behaviour (frontend#247, on @ui-sdk)", () => {
  it("is a named navigation landmark with a list of triggers and links, its panels closed", () => {
    render(<SiteNav />)

    const nav = screen.getByRole("navigation", { name: "Site" })
    expect(within(nav).getByRole("list")).toBeTruthy()
    expect(products().getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("link", { name: "Argus" })).toBeNull()
    expect(screen.getByRole("link", { name: "About" }).getAttribute("href")).toBe("#about")
  })

  it("opens a trigger's panel when it is clicked and closes it on a second click", async () => {
    render(<SiteNav />)

    fireEvent.click(products())

    expect((await screen.findByRole("link", { name: "Argus" })).getAttribute("href")).toBe("#argus")
    expect(products().getAttribute("aria-expanded")).toBe("true")
    expect(products().hasAttribute("data-open")).toBe(true)
    fireEvent.click(products())
    await waitFor(() => expect(screen.queryByRole("link", { name: "Argus" })).toBeNull())
    expect(products().getAttribute("aria-expanded")).toBe("false")
  })

  it("opens a panel with Enter from the keyboard and leaves focus on the trigger", async () => {
    render(<SiteNav />)
    products().focus()

    // A browser turns Enter on a button into a click with no pointer; jsdom does not.
    key("Enter")
    fireEvent.click(products(), { detail: 0 })

    expect(await screen.findByRole("link", { name: "Argus" })).toBeTruthy()
    expect(document.activeElement).toBe(products())
  })

  it("opens a panel with ArrowDown and moves focus into it", async () => {
    // jsdom has no layout, so the SDK sees no focusable link: tell it everything is visible.
    const checkVisibility = Element.prototype.checkVisibility
    Element.prototype.checkVisibility = () => true
    try {
      render(<SiteNav />)
      products().focus()

      key("ArrowDown")

      const link = await screen.findByRole("link", { name: "Argus" })
      await waitFor(() => expect(document.activeElement).toBe(link))
    } finally {
      Element.prototype.checkVisibility = checkVisibility
    }
  })

  it("closes on Escape and keeps focus on the trigger", async () => {
    render(<SiteNav />)
    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })
    products().focus()

    key("Escape")

    await waitFor(() => expect(screen.queryByRole("link", { name: "Argus" })).toBeNull())
    expect(document.activeElement).toBe(products())
  })

  it("closes on a press outside it", async () => {
    render(<SiteNav />)
    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }))
    fireEvent.pointerUp(screen.getByRole("button", { name: "Outside" }))
    fireEvent.click(screen.getByRole("button", { name: "Outside" }))

    await waitFor(() => expect(screen.queryByRole("link", { name: "Argus" })).toBeNull())
  })

  it("switches to another trigger's panel when it is clicked while one is open", async () => {
    render(<SiteNav />)
    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })

    fireEvent.click(docs())

    expect(await screen.findByRole("link", { name: "Guides" })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole("link", { name: "Argus" })).toBeNull())
  })

  it("moves between the top-level items with the arrow keys", () => {
    render(<SiteNav />)
    products().focus()

    key("ArrowRight")
    expect(document.activeElement).toBe(docs())
    key("ArrowRight")
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "About" }))
    key("ArrowLeft")
    expect(document.activeElement).toBe(docs())
  })

  it("opens a panel when the pointer rests on its trigger", async () => {
    render(<SiteNav delay={0} />)

    fireEvent.pointerEnter(products(), { pointerType: "mouse" })
    fireEvent.pointerMove(products(), { pointerType: "mouse" })

    expect(await screen.findByRole("link", { name: "Argus" })).toBeTruthy()
  })

  it("does not open on hover when openOnHover is off, only on a press", async () => {
    render(<SiteNav delay={0} openOnHover={false} />)

    fireEvent.pointerEnter(products(), { pointerType: "mouse" })
    fireEvent.pointerMove(products(), { pointerType: "mouse" })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole("link", { name: "Argus" })).toBeNull()

    fireEvent.click(products())
    expect(await screen.findByRole("link", { name: "Argus" })).toBeTruthy()
  })

  it("reports why a panel opened and closed through onValueChange(value, details)", async () => {
    const onValueChange = vi.fn()
    render(<SiteNav onValueChange={onValueChange} />)

    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })
    expect(onValueChange).toHaveBeenLastCalledWith("products", expect.objectContaining({ reason: "trigger-press" }))

    products().focus()
    key("Escape")
    await waitFor(() => expect(screen.queryByRole("link", { name: "Argus" })).toBeNull())
    expect(onValueChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ reason: "escape-key" }))
  })

  it("can be controlled with value and onValueChange", async () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<SiteNav value={null} onValueChange={onValueChange} />)

    fireEvent.click(docs())
    expect(onValueChange).toHaveBeenCalledWith("docs", expect.anything())
    expect(screen.queryByRole("link", { name: "Guides" })).toBeNull()

    rerender(<SiteNav value="docs" onValueChange={onValueChange} />)
    expect(await screen.findByRole("link", { name: "Guides" })).toBeTruthy()
  })

  it("follows a link in a panel and closes the menu", async () => {
    render(<SiteNav />)
    fireEvent.click(products())

    fireEvent.click(await screen.findByRole("link", { name: "Argus" }))

    await waitFor(() => expect(screen.queryByRole("link", { name: "Argus" })).toBeNull())
  })

  it("marks the link for the current page, as active did on Base UI", () => {
    render(<SiteNav />)

    expect(screen.getByRole("link", { name: "About" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "About" }).hasAttribute("data-current")).toBe(true)
  })
})

describe("NavigationMenu: viewport and slots", () => {
  it("places the open panel below its trigger, aligned to its start by default", async () => {
    render(<SiteNav />)

    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })

    const viewport = document.querySelector('[data-slot="navigation-menu-viewport"]')
    expect(viewport?.getAttribute("data-side")).toBe("bottom")
    expect(viewport?.getAttribute("data-align")).toBe("start")
  })

  it("takes the align prop for the panel", async () => {
    render(<SiteNav align="end" />)

    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })

    expect(document.querySelector('[data-slot="navigation-menu-viewport"]')?.getAttribute("data-align")).toBe("end")
  })

  it("keeps the data-slot values the classes target", async () => {
    render(<SiteNav />)
    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })

    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)
    expect(slot("navigation-menu")).toBe(screen.getByRole("navigation"))
    expect(slot("navigation-menu-list")).toBe(screen.getByRole("list"))
    expect(slot("navigation-menu-item")).not.toBeNull()
    expect(slot("navigation-menu-trigger")).toBe(products())
    expect(slot("navigation-menu-content")).not.toBeNull()
    expect(slot("navigation-menu-link")).not.toBeNull()
    expect(slot("navigation-menu-indicator")).not.toBeNull()
  })

  it("draws a chevron in each trigger", () => {
    render(<SiteNav />)

    const icon = products().querySelector("svg.lucide-chevron-down")
    expect(icon?.getAttribute("aria-hidden")).toBe("true")
  })

  it("exports the trigger style for a plain link that should look like a trigger", () => {
    expect(navigationMenuTriggerStyle()).toContain("h-9")
    expect(navigationMenuTriggerStyle()).toContain("data-open:")
  })
})

describe("NavigationMenu: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/navigation-menu.tsx"), "utf8")

  it("styles with data-open, data-current and the motion attributes the SDK sets", () => {
    expect(source).toContain("data-open:")
    expect(source).toContain("data-current:")
    expect(source).toContain("data-[motion=")
    expect(source).not.toContain("data-popup-open")
    expect(source).not.toContain("data-active:")
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/navigation-menu")
  })
})

describe("NavigationMenu: accessibility", () => {
  it("has no axe violations while a panel is open", async () => {
    render(<SiteNav />)
    fireEvent.click(products())
    await screen.findByRole("link", { name: "Argus" })

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
