import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IssueRow, IssueRowList } from "../registry/base-nova/blocks/issue-row"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const LONG_TITLE =
  "A very long issue title that keeps going well past the width of a 320 pixel phone screen and must wrap, never be cut"

const actions = (onSelect = vi.fn()) => [
  { id: "assign", label: "Assign to me", onSelect },
  { id: "close", label: "Close", onSelect, destructive: true },
]

const cell = (container: HTMLElement, slot: string) => container.querySelector<HTMLElement>(`[data-slot=issue-row-${slot}]`)

// The menu is on @ui-sdk: it opens from a click and shows one microtask later.
const openMore = async () => {
  fireEvent.click(screen.getByRole("button", { name: /more actions/i }))
  return screen.findByRole("menu")
}

describe("IssueRowList", () => {
  it("is a list of rows with no bullets", () => {
    render(
      <IssueRowList>
        <IssueRow title="First" />
        <IssueRow title="Second" />
      </IssueRowList>,
    )

    const list = screen.getByRole("list")
    expect(list.className).toContain("list-none")
    // divide-y alone draws in currentColor (near-black) wherever the app has no base border colour.
    expect(list.className).toContain("divide-border")
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
  })
})

describe("IssueRow: opening the item", () => {
  it("is at least a 44px row, and grows when the title wraps", () => {
    const { container } = render(<IssueRow title="T" />)

    const row = container.querySelector("[data-slot=issue-row]")!
    expect(row.tagName).toBe("LI")
    expect(row.className).toContain("min-h-11")
  })

  it("makes the title a link when given an href, and names the row by its title", () => {
    render(<IssueRow title="Fix the promotion card" href="/issues/12" />)

    const link = screen.getByRole("link", { name: "Fix the promotion card" })
    expect(link.getAttribute("href")).toBe("/issues/12")
  })

  it("makes the title a button that calls onOpen when there is no href", () => {
    const onOpen = vi.fn()
    render(<IssueRow title="Fix the promotion card" onOpen={onOpen} />)

    fireEvent.click(screen.getByRole("button", { name: "Fix the promotion card" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("lets the app's router link stand in for the title control", () => {
    render(<IssueRow title="Routed" render={<a href="/routed" data-router="yes" />} />)

    const link = screen.getByRole("link", { name: "Routed" })
    expect(link.getAttribute("data-router")).toBe("yes")
  })

  it("stretches the title's hit area over the whole row, so a tap anywhere opens the item", () => {
    render(<IssueRow title="T" href="/x" />)

    const link = screen.getByRole("link", { name: "T" })
    expect(link.className).toContain("after:absolute")
    expect(link.className).toContain("after:inset-0")
    // Above a positioned sibling such as an avatar (found in WebKit: the avatar swallowed the tap), below the more button.
    expect(link.className).toContain("after:z-[1]")
    expect(link.closest("[data-slot=issue-row]")!.className).toContain("relative")
  })

  it("keeps a plain title as text when there is nothing to open", () => {
    render(<IssueRow title="Just text" />)

    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("Just text")).toBeTruthy()
  })
})

describe("IssueRow: columns drop away by priority", () => {
  const full = (
    <IssueRow
      title={LONG_TITLE}
      href="/x"
      priority={<span>P1</span>}
      identifier="DS-192"
      status={<span>Working</span>}
      labels={<span>design</span>}
      project="W1"
      dueDate="Due Nov 12"
      assignee={<span>DS</span>}
      actions={actions()}
    />
  )

  it("shows only priority, status and the title below sm", () => {
    const { container } = render(full)

    expect(cell(container, "priority")!.className).not.toMatch(/hidden/)
    expect(cell(container, "status")!.className).not.toMatch(/hidden/)
    expect(cell(container, "title")!.className).not.toMatch(/hidden/)
  })

  it("brings in the id, due date and assignee at sm", () => {
    const { container } = render(full)

    for (const slot of ["identifier", "due-date", "assignee"]) {
      const className = cell(container, slot)!.className
      expect(className, slot).toContain("hidden")
      expect(className, slot).toMatch(/\bsm:(inline-flex|inline-block|flex|inline)\b/)
    }
  })

  it("brings in the labels and project or wave at lg", () => {
    const { container } = render(full)

    for (const slot of ["labels", "project"]) {
      const className = cell(container, slot)!.className
      expect(className, slot).toContain("hidden")
      expect(className, slot).toMatch(/\blg:(inline-flex|inline-block|flex|inline)\b/)
    }
  })

  it("wraps the title in full and never lets it shrink the other columns' room", () => {
    const { container } = render(full)

    const title = cell(container, "title")!
    expect(title.className).toContain("min-w-0")
    expect(title.className).toContain("wrap-anywhere")
    expect(title.className).not.toMatch(/\btruncate\b/)
    expect(title.className).toContain("flex-1")
    expect(title.getAttribute("title")).toBeNull()
  })

  it("keeps every column except the title at its own width", () => {
    const { container } = render(full)

    for (const slot of ["priority", "identifier", "status", "labels", "project", "due-date", "assignee"]) {
      expect(cell(container, slot)!.className, slot).toContain("shrink-0")
    }
  })

  it("renders no empty slot for a column the row does not have", () => {
    const { container } = render(<IssueRow title="Only a title" />)

    for (const slot of ["priority", "identifier", "status", "labels", "project", "due-date", "assignee", "more"]) {
      expect(cell(container, slot), slot).toBeNull()
    }
  })

  it("keeps the columns in circle's order: priority, id, status, title, labels, project, due date, assignee", () => {
    const { container } = render(full)

    const order = ["priority", "identifier", "status", "title", "labels", "project", "due-date", "assignee"].map((slot) => cell(container, slot)!)
    order.forEach((node, index) => {
      if (index === 0) return
      expect(order[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })
})

describe("IssueRow: the actions behind the right-click", () => {
  it("has no more button and no menu when it has no actions", () => {
    render(<IssueRow title="T" href="/x" />)

    expect(screen.queryByRole("button", { name: /more actions/i })).toBeNull()
    fireEvent.contextMenu(screen.getByText("T"))
    expect(screen.queryByRole("menu")).toBeNull()
  })

  describe("the trailing more button", () => {
    it("is a 44px touch target named for the row it acts on", () => {
      render(<IssueRow title="Fix the promotion card" href="/x" actions={actions()} />)

      const more = screen.getByRole("button", { name: "More actions for Fix the promotion card" })
      expect(more.className).toContain("size-11")
      expect(more.className).toContain("touch-manipulation")
    })

    it("sits above the stretched title link, so tapping it does not open the item", () => {
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      const more = screen.getByRole("button", { name: /more actions/i })
      expect(more.className).toContain("relative")
      expect(more.className).toContain("z-10")
    })

    it("takes its own label for an app that is not in English", () => {
      render(<IssueRow title="T" actions={actions()} moreLabel="Weitere Aktionen" />)

      expect(screen.getByRole("button", { name: "Weitere Aktionen" })).toBeTruthy()
    })

    it("opens a menu of the actions", async () => {
      render(<IssueRow title="T" actions={actions()} />)

      const menu = await openMore()

      expect(within(menu).getByRole("menuitem", { name: "Assign to me" })).toBeTruthy()
      expect(within(menu).getByRole("menuitem", { name: "Close" })).toBeTruthy()
    })

    it("runs the action chosen and closes the menu", async () => {
      const onSelect = vi.fn()
      render(<IssueRow title="T" actions={actions(onSelect)} />)

      await openMore()
      fireEvent.click(screen.getByRole("menuitem", { name: "Assign to me" }))

      expect(onSelect).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    })
  })

  describe("right-click", () => {
    it("opens the same menu", async () => {
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      fireEvent.contextMenu(screen.getByRole("link", { name: "T" }))

      const menu = await screen.findByRole("menu")
      expect(within(menu).getAllByRole("menuitem")).toHaveLength(2)
    })

    it("runs the action chosen", async () => {
      const onSelect = vi.fn()
      render(<IssueRow title="T" href="/x" actions={actions(onSelect)} />)

      fireEvent.contextMenu(screen.getByRole("link", { name: "T" }))
      fireEvent.click(await screen.findByRole("menuitem", { name: "Close" }))

      expect(onSelect).toHaveBeenCalledTimes(1)
    })
  })

  describe("long-press", () => {
    const finger = (x: number, y: number) => ({ pointerType: "touch", pointerId: 7, isPrimary: true, button: 0, clientX: x, clientY: y })

    it("opens the same menu once the finger has been down for half a second", async () => {
      vi.useFakeTimers()
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      fireEvent.pointerDown(screen.getByRole("link", { name: "T" }), finger(40, 20))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(499)
      })
      expect(screen.queryByRole("menu")).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(within(screen.getByRole("menu")).getAllByRole("menuitem")).toHaveLength(2)

      // Lifting the finger ends the press, and the browser's click that follows is swallowed, so the link is not followed.
      fireEvent.pointerUp(screen.getByRole("link", { name: "T" }), finger(40, 20))
      expect(fireEvent.click(screen.getByRole("link", { name: "T" }))).toBe(false)
    })

    it("does not open for a tap that ends first, so a tap still opens the item", async () => {
      vi.useFakeTimers()
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      const link = screen.getByRole("link", { name: "T" })
      fireEvent.pointerDown(link, finger(40, 20))
      fireEvent.pointerUp(link, finger(40, 20))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800)
      })

      expect(screen.queryByRole("menu")).toBeNull()
    })

    it("does not open when the finger moves off, which is a scroll", async () => {
      vi.useFakeTimers()
      render(<IssueRow title="T" href="/x" actions={actions()} />)

      const link = screen.getByRole("link", { name: "T" })
      fireEvent.pointerDown(link, finger(40, 20))
      fireEvent.pointerMove(link, finger(40, 80))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800)
      })

      expect(screen.queryByRole("menu")).toBeNull()

      // A browser cancels the pointer when it starts a scroll; until then the SDK swallows the click that would follow it.
      fireEvent.pointerCancel(link, finger(40, 80))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
    })

    it("turns off the iOS link callout and text selection so the press reaches the menu", () => {
      const { container } = render(<IssueRow title="T" href="/x" actions={actions()} />)

      const row = container.querySelector("[data-slot=issue-row]")!
      expect(row.className).toContain("select-none")
      expect(row.className).toContain("[-webkit-touch-callout:none]")
    })
  })

  it("marks a destructive action so it reads as one", async () => {
    render(<IssueRow title="T" actions={actions()} />)

    await openMore()

    expect(screen.getByRole("menuitem", { name: "Close" }).getAttribute("data-variant")).toBe("destructive")
    expect(screen.getByRole("menuitem", { name: "Assign to me" }).getAttribute("data-variant")).toBe("default")
  })

  it("sizes the menu to its labels instead of the 44px more button it opens from", async () => {
    render(<IssueRow title="T" actions={actions()} />)

    const menu = await openMore()

    expect(menu.className).toContain("w-auto")
    expect(menu.className).toContain("min-w-48")
  })

  it("grows the menu items to 44px under a coarse pointer", async () => {
    render(<IssueRow title="T" actions={actions()} />)

    await openMore()

    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.className).toContain("pointer-coarse:min-h-11")
    }
  })
})

describe("IssueRow: accessibility", () => {
  it("has no axe violations in a list of full rows", async () => {
    const { container } = render(
      <IssueRowList aria-label="Open issues">
        <IssueRow
          title="Fix the promotion card"
          href="/issues/12"
          priority={<span aria-label="Priority: urgent">!</span>}
          identifier="DS-12"
          status={<span aria-label="Status: working">W</span>}
          labels={<span>design</span>}
          project="Wave 1"
          dueDate="Due Nov 12"
          assignee={<span aria-label="Assigned to Dean">D</span>}
          actions={actions()}
        />
        <IssueRow title="Plain" onOpen={() => {}} />
      </IssueRowList>,
    )

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([])
  })
})
