import { checkPattern } from "@ui-sdk/core/testing"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from "../registry/base-nova/ui/tabs"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const getTab = (name: string) => screen.getByRole("tab", { name })

function Settings(props: React.ComponentProps<typeof Tabs>) {
  return (
    <Tabs {...("value" in props ? {} : { defaultValue: "account" })} {...props}>
      <TabsList aria-label="Settings">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="billing" disabled>
          Billing
        </TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="account">Manage your profile.</TabsContent>
      <TabsContent value="password">Choose a new password.</TabsContent>
      <TabsContent value="billing">Invoices are monthly.</TabsContent>
      <TabsContent value="team">Invite people.</TabsContent>
    </Tabs>
  )
}

describe("Tabs: behaviour (frontend#245, on @ui-sdk)", () => {
  it("selects the default tab and shows only its panel", () => {
    render(<Settings />)

    expect(getTab("Account").getAttribute("aria-selected")).toBe("true")
    expect(getTab("Password").getAttribute("aria-selected")).toBe("false")
    expect(screen.getByText("Manage your profile.")).toBeTruthy()
    expect(screen.queryByText("Choose a new password.")).toBeNull()
  })

  it("selects the first enabled tab when there is no default", () => {
    render(
      <Tabs>
        <TabsList aria-label="Settings">
          <TabsTrigger value="a" disabled>
            A
          </TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    )

    expect(getTab("B").getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("Panel B")).toBeTruthy()
  })

  it("selects a tab on click and reports the value first, then the reason", () => {
    const onValueChange = vi.fn()
    render(<Settings onValueChange={onValueChange} />)

    fireEvent.click(getTab("Password"))

    expect(getTab("Password").getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("Choose a new password.")).toBeTruthy()
    expect(screen.queryByText("Manage your profile.")).toBeNull()
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith("password", expect.objectContaining({ reason: expect.any(String) }))
  })

  it("links a tab to its panel both ways", () => {
    render(<Settings />)

    const panel = screen.getByRole("tabpanel")
    expect(getTab("Account").getAttribute("aria-controls")).toBe(panel.id)
    expect(panel.getAttribute("aria-labelledby")).toBe(getTab("Account").id)
  })

  it("moves and selects with the arrow keys, skipping nothing but never selecting a disabled tab", () => {
    render(<Settings />)
    const account = getTab("Account")
    account.focus()

    fireEvent.keyDown(account, { key: "ArrowRight" })
    expect(document.activeElement).toBe(getTab("Password"))
    expect(getTab("Password").getAttribute("aria-selected")).toBe("true")

    // The disabled tab can be focused so people find it, but stays unselected.
    fireEvent.keyDown(getTab("Password"), { key: "ArrowRight" })
    expect(getTab("Billing").getAttribute("aria-selected")).toBe("false")
    expect(getTab("Password").getAttribute("aria-selected")).toBe("true")
  })

  it("wraps at either end and jumps with Home and End", () => {
    render(<Settings />)
    const account = getTab("Account")
    account.focus()

    fireEvent.keyDown(account, { key: "ArrowLeft" })
    expect(document.activeElement).toBe(getTab("Team"))
    expect(getTab("Team").getAttribute("aria-selected")).toBe("true")

    fireEvent.keyDown(getTab("Team"), { key: "Home" })
    expect(document.activeElement).toBe(getTab("Account"))

    fireEvent.keyDown(getTab("Account"), { key: "End" })
    expect(document.activeElement).toBe(getTab("Team"))
  })

  it("stops at the ends with loop off", () => {
    render(<Settings loop={false} />)
    const account = getTab("Account")
    account.focus()

    fireEvent.keyDown(account, { key: "ArrowLeft" })

    expect(document.activeElement).toBe(account)
  })

  it("gives the list one tab stop, on the selected tab", () => {
    render(<Settings defaultValue="password" />)

    expect(getTab("Password").tabIndex).toBe(0)
    expect(getTab("Account").tabIndex).toBe(-1)
    expect(getTab("Team").tabIndex).toBe(-1)
  })

  it("follows a controlled value and lets the owner refuse a change", () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Settings value="account" onValueChange={onValueChange} />)

    fireEvent.click(getTab("Password"))
    expect(onValueChange).toHaveBeenCalledWith("password", expect.anything())
    expect(getTab("Account").getAttribute("aria-selected")).toBe("true")

    rerender(<Settings value="password" onValueChange={onValueChange} />)
    expect(getTab("Password").getAttribute("aria-selected")).toBe("true")
  })

  it("ignores a click on a disabled tab", () => {
    const onValueChange = vi.fn()
    render(<Settings onValueChange={onValueChange} />)

    fireEvent.click(getTab("Billing"))

    expect(onValueChange).not.toHaveBeenCalled()
    expect(getTab("Account").getAttribute("aria-selected")).toBe("true")
  })

  it("uses Up and Down in a vertical list and says so", () => {
    render(<Settings orientation="vertical" />)
    const account = getTab("Account")
    account.focus()

    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical")

    fireEvent.keyDown(account, { key: "ArrowDown" })
    expect(getTab("Password").getAttribute("aria-selected")).toBe("true")

    fireEvent.keyDown(getTab("Password"), { key: "ArrowUp" })
    expect(getTab("Account").getAttribute("aria-selected")).toBe("true")
  })

  it("waits for Enter or Space with manual activation", () => {
    render(<Settings activation="manual" />)
    const account = getTab("Account")
    account.focus()

    fireEvent.keyDown(account, { key: "ArrowRight" })
    expect(document.activeElement).toBe(getTab("Password"))
    expect(getTab("Password").getAttribute("aria-selected")).toBe("false")

    // A tab is a native button: the browser turns Enter or Space into this click (jsdom does not).
    fireEvent.click(getTab("Password"))
    expect(getTab("Password").getAttribute("aria-selected")).toBe("true")
  })

  it("keeps hidden panels mounted with keepMounted", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Keep">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b" keepMounted>
          Panel B
        </TabsContent>
      </Tabs>,
    )

    expect(screen.getByText("Panel B").closest("[hidden]")).toBeTruthy()
  })
})

describe("Tabs: the same component API for consumers", () => {
  it("keeps its slots, variant and orientation, and passes className and extra props through", () => {
    render(
      <Tabs defaultValue="a" className="custom-root" data-testid="root">
        <TabsList aria-label="Plan" variant="line" className="custom-list">
          <TabsTrigger value="a" className="custom-tab" id="tab-a">
            A
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="custom-panel">
          Panel A
        </TabsContent>
      </Tabs>,
    )

    const root = screen.getByTestId("root")
    expect(root.getAttribute("data-slot")).toBe("tabs")
    expect(root.getAttribute("data-orientation")).toBe("horizontal")
    expect(root.className).toContain("custom-root")
    expect(root.className).toContain("flex")

    const list = screen.getByRole("tablist")
    expect(list.getAttribute("data-slot")).toBe("tabs-list")
    expect(list.getAttribute("data-variant")).toBe("line")
    expect(list.className).toContain("custom-list")
    expect(list.className).toContain("bg-transparent")

    // The SDK names these two parts tabs-tab and tabs-panel; the design contract (theme, DESIGN.md,
    // the geometry gate) keeps the old slots, so the wrapper gives each part its own through `render`.
    const tab = getTab("A")
    expect(tab.getAttribute("data-slot")).toBe("tabs-trigger")
    expect(tab.id).toBe("tab-a")
    expect(tab.className).toContain("custom-tab")

    const panel = screen.getByRole("tabpanel")
    expect(panel.getAttribute("data-slot")).toBe("tabs-content")
    expect(panel.className).toContain("custom-panel")
  })

  it("defaults the list to the filled variant and exports the variants helper", () => {
    render(<Settings />)

    expect(screen.getByRole("tablist").getAttribute("data-variant")).toBe("default")
    expect(tabsListVariants({ variant: "line" })).toContain("gap-1")
  })
})

describe("Tabs: state-attribute styling parity", () => {
  // The classes key off the selected state, so the SDK's attribute name has to be what they use.
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/tabs.tsx"), "utf8")

  it("marks the selected tab and panel data-selected, and the classes key off it", () => {
    render(<Settings />)

    expect(getTab("Account").hasAttribute("data-selected")).toBe(true)
    expect(getTab("Password").hasAttribute("data-selected")).toBe(false)
    expect(screen.getByRole("tabpanel").hasAttribute("data-selected")).toBe(true)
    expect(source).toContain("data-selected:")
    expect(source).not.toContain("data-active")
  })

  it("marks a disabled tab data-disabled", () => {
    render(<Settings />)

    expect(getTab("Billing").hasAttribute("data-disabled")).toBe(true)
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/tabs")
  })
})

describe("Tabs: accessibility", () => {
  it("passes the SDK's tabs pattern check", async () => {
    const { container } = render(<Settings />)

    await checkPattern(container, "tabs")
  })

  it("has no axe violations", async () => {
    const { container } = render(<Settings />)

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
