import { checkPattern } from "@ui-sdk/core/testing"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import axe from "axe-core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../registry/base-nova/ui/select"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const items = [
  { value: "idea", label: "Idea" },
  { value: "task", label: "Task" },
  { value: "bug", label: "Bug" },
]

function TypeSelect({
  size,
  disabledValue,
  ...root
}: Partial<React.ComponentProps<typeof Select>> & { size?: "sm" | "default"; disabledValue?: string }) {
  return (
    <Select items={items} {...(root as object)}>
      <SelectTrigger aria-label="Type" size={size}>
        <SelectValue placeholder="Pick a type" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} disabled={item.value === disabledValue}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const trigger = () => screen.getByRole("combobox", { name: "Type" })
const key = (name: string, target: Element = document.activeElement as Element) =>
  fireEvent.keyDown(target, { key: name })
const openList = async () => {
  fireEvent.click(trigger())
  return screen.findByRole("listbox")
}

describe("SelectTrigger", () => {
  // Base UI's Select.Icon defaults its children to "▼", and `render` swaps
  // only the element, so the glyph used to land inside the lucide svg (#50).
  it("has the selected label as its text content, with no default ▼ glyph", () => {
    render(<TypeSelect defaultValue="idea" />)

    expect(trigger().textContent).toBe("Idea")
  })

  it("still renders the chevron icon", () => {
    render(<TypeSelect defaultValue="idea" />)

    const icon = trigger().querySelector("svg.lucide-chevron-down")

    expect(icon).not.toBeNull()
    expect(icon?.getAttribute("aria-hidden")).toBe("true")
    expect(icon?.textContent).toBe("")
  })

  it("shows the placeholder, marked data-placeholder, while nothing is selected", () => {
    render(<TypeSelect />)

    expect(trigger().textContent).toBe("Pick a type")
    expect(trigger().hasAttribute("data-placeholder")).toBe(true)
  })

  it("takes size, defaulting to default", () => {
    const { unmount } = render(<TypeSelect />)
    expect(trigger().getAttribute("data-size")).toBe("default")
    unmount()

    render(<TypeSelect size="sm" />)
    expect(trigger().getAttribute("data-size")).toBe("sm")
  })

  it("is named by a label that points at it", () => {
    render(
      <div>
        <label htmlFor="type-trigger">Item type</label>
        <Select items={items}>
          <SelectTrigger id="type-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="idea">Idea</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    )

    expect(screen.getByRole("combobox", { name: "Item type" })).toBeTruthy()
  })
})

describe("Select: behaviour (frontend#247, on @ui-sdk)", () => {
  it("stays closed until its trigger is pressed", () => {
    render(<TypeSelect />)

    expect(screen.queryByRole("listbox")).toBeNull()
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(trigger().hasAttribute("data-closed")).toBe(true)
  })

  it("opens a listbox of options on a click and marks the trigger open", async () => {
    render(<TypeSelect defaultValue="task" />)

    const list = await openList()

    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    expect(trigger().hasAttribute("data-open")).toBe(true)
    expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual(["Idea", "Task", "Bug"])
  })

  it("marks the selected option and draws the check only there", async () => {
    render(<TypeSelect defaultValue="task" />)
    const list = await openList()

    const selected = within(list).getByRole("option", { name: "Task" })
    expect(selected.getAttribute("aria-selected")).toBe("true")
    expect(selected.hasAttribute("data-selected")).toBe(true)
    expect(selected.querySelector("svg")).not.toBeNull()
    expect(within(list).getByRole("option", { name: "Idea" }).querySelector("svg")).toBeNull()
  })

  it("opens from the keyboard with ArrowDown and focuses the first option", async () => {
    render(<TypeSelect />)
    trigger().focus()

    key("ArrowDown")

    await screen.findByRole("listbox")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("option", { name: "Idea" })))
  })

  it("moves through the options with the arrow keys, skipping a disabled one", async () => {
    render(<TypeSelect disabledValue="task" />)
    trigger().focus()
    key("ArrowDown")
    await screen.findByRole("listbox")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("option", { name: "Idea" })))

    key("ArrowDown")

    expect(document.activeElement).toBe(screen.getByRole("option", { name: "Bug" }))
    key("Home")
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "Idea" }))
    key("End")
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "Bug" }))
  })

  it("chooses the focused option with Enter, closes, and returns focus to the trigger", async () => {
    const onValueChange = vi.fn()
    render(<TypeSelect onValueChange={onValueChange} />)
    trigger().focus()
    key("ArrowDown")
    await screen.findByRole("listbox")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("option", { name: "Idea" })))
    key("ArrowDown")

    key("Enter")

    expect(onValueChange).toHaveBeenCalledWith("task", expect.objectContaining({ reason: "item-press" }))
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(document.activeElement).toBe(trigger())
    expect(trigger().textContent).toBe("Task")
  })

  it("chooses an option with a click, closes, and shows its label", async () => {
    const onValueChange = vi.fn()
    render(<TypeSelect onValueChange={onValueChange} />)
    await openList()

    fireEvent.click(screen.getByRole("option", { name: "Bug" }))

    expect(onValueChange).toHaveBeenCalledWith("bug", expect.anything())
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(trigger().textContent).toBe("Bug")
    expect(trigger().hasAttribute("data-placeholder")).toBe(false)
  })

  it("does not choose a disabled option", async () => {
    const onValueChange = vi.fn()
    render(<TypeSelect disabledValue="task" onValueChange={onValueChange} />)
    await openList()
    const task = screen.getByRole("option", { name: "Task" })

    fireEvent.click(task)

    expect(task.getAttribute("aria-disabled")).toBe("true")
    expect(task.hasAttribute("data-disabled")).toBe(true)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.queryByRole("listbox")).not.toBeNull()
  })

  it("closes on Escape without choosing and returns focus to the trigger", async () => {
    const onValueChange = vi.fn()
    render(<TypeSelect defaultValue="idea" onValueChange={onValueChange} />)
    await openList()
    screen.getByRole("option", { name: "Task" }).focus()

    key("Escape")

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(onValueChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger())
  })

  it("selects the next option that starts with the typed text while closed, like a native select", () => {
    const onValueChange = vi.fn()
    render(<TypeSelect onValueChange={onValueChange} />)
    trigger().focus()

    fireEvent.keyDown(trigger(), { key: "b" })

    expect(onValueChange).toHaveBeenCalledWith("bug", expect.anything())
    expect(trigger().textContent).toBe("Bug")
  })

  it("can be controlled with value and onValueChange", async () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<TypeSelect value="idea" onValueChange={onValueChange} />)
    await openList()

    fireEvent.click(screen.getByRole("option", { name: "Bug" }))

    expect(onValueChange).toHaveBeenCalledWith("bug", expect.anything())
    expect(trigger().textContent).toBe("Idea")
    rerender(<TypeSelect value="bug" onValueChange={onValueChange} />)
    expect(trigger().textContent).toBe("Bug")
  })

  it("reports why it opened and closed through onOpenChange(open, details)", async () => {
    const onOpenChange = vi.fn()
    render(<TypeSelect onOpenChange={onOpenChange} />)

    await openList()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "trigger-press" }))

    screen.getByRole("option", { name: "Idea" }).focus()
    key("Escape")
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" }))
  })

  it("closes on a press outside it", async () => {
    render(
      <div>
        <TypeSelect />
        <button type="button">Outside</button>
      </div>,
    )
    await openList()

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }))
    fireEvent.pointerUp(screen.getByRole("button", { name: "Outside" }))
    fireEvent.click(screen.getByRole("button", { name: "Outside" }))

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
  })

  it("cannot be opened when disabled", () => {
    render(<TypeSelect disabled />)

    fireEvent.click(trigger())

    expect(screen.queryByRole("listbox")).toBeNull()
    expect(trigger().hasAttribute("data-disabled")).toBe(true)
  })

  it("keeps the old Base UI prop names working: itemToStringLabel and itemToStringValue", async () => {
    const people = [
      { id: "1", name: "Ada" },
      { id: "2", name: "Lin" },
    ]
    render(
      <Select
        items={people as never}
        defaultValue={people[1] as never}
        itemToStringLabel={(person: { name: string }) => person.name}
        itemToStringValue={(person: { id: string }) => person.id}
        isItemEqualToValue={(a: { id: string }, b: { id: string }) => a.id === b.id}
      >
        <SelectTrigger aria-label="Person">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {people.map((person) => (
            <SelectItem key={person.id} value={person as never}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    )

    expect(screen.getByRole("combobox", { name: "Person" }).textContent).toBe("Lin")
  })

  it("takes items as a record of value to label, as Base UI did", () => {
    render(
      <Select items={{ idea: "Idea", task: "Task" } as never} defaultValue="task">
        <SelectTrigger aria-label="Type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="idea">Idea</SelectItem>
          <SelectItem value="task">Task</SelectItem>
        </SelectContent>
      </Select>,
    )

    expect(trigger().textContent).toBe("Task")
  })
})

describe("Select: groups, forms and slots", () => {
  it("names a group by its label and draws a separator between groups", async () => {
    render(
      <Select>
        <SelectTrigger aria-label="Type">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Work</SelectLabel>
            <SelectItem value="task">Task</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Ideas</SelectLabel>
            <SelectItem value="idea">Idea</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    )

    fireEvent.click(trigger())
    await screen.findByRole("listbox")

    expect(screen.getByRole("group", { name: "Work" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "Ideas" })).toBeTruthy()
    expect(document.querySelector('[data-slot="select-separator"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="select-label"]')?.textContent).toBe("Work")
  })

  it("submits its value under its name with a form", () => {
    const { container } = render(
      <form>
        <TypeSelect name="type" defaultValue="bug" />
      </form>,
    )

    expect(new FormData(container.querySelector("form")!).get("type")).toBe("bug")
  })

  it("keeps the data-slot values the classes and the theme target", async () => {
    render(<TypeSelect defaultValue="idea" />)
    await openList()

    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`)
    expect(slot("select-trigger")).toBe(trigger())
    expect(slot("select-value")).not.toBeNull()
    expect(slot("select-content")).toBe(screen.getByRole("listbox"))
    expect(slot("select-item")).not.toBeNull()
  })

  it("opens aligned with its selected item by default, and says so on the content", async () => {
    render(<TypeSelect defaultValue="idea" />)
    await openList()

    expect(screen.getByRole("listbox").getAttribute("data-align-trigger")).toBe("true")
  })

  it("takes alignItemWithTrigger={false}, side and className on the content", async () => {
    render(
      <Select items={items}>
        <SelectTrigger aria-label="Type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} side="top" className="w-72">
          <SelectItem value="idea">Idea</SelectItem>
        </SelectContent>
      </Select>,
    )

    fireEvent.click(trigger())
    const list = await screen.findByRole("listbox")

    expect(list.getAttribute("data-align-trigger")).toBe("false")
    expect(list.className).toContain("w-72")
  })

  it("keeps the scroll buttons importable, though the SDK scrolls natively", () => {
    expect(typeof SelectScrollUpButton).toBe("function")
    expect(typeof SelectScrollDownButton).toBe("function")
  })
})

describe("Select: state-attribute styling parity", () => {
  const source = readFileSync(join(process.cwd(), "registry/base-nova/ui/select.tsx"), "utf8")

  it("styles the highlighted item, the selected one and open and closed with the attributes the SDK sets", () => {
    expect(source).toContain("data-highlighted:")
    expect(source).toContain("data-open:")
    expect(source).toContain("data-closed:")
    expect(source).not.toMatch(/(?<![-\w])focus:bg-accent/)
  })

  it("no longer imports Base UI", () => {
    expect(source).not.toContain("@base-ui/react")
    expect(source).toContain("@ui-sdk/react/select")
  })
})

describe("Select: accessibility", () => {
  it("passes the SDK's listbox pattern check", async () => {
    render(<TypeSelect defaultValue="idea" />)
    const list = await openList()

    await checkPattern(list, "listbox")
  })

  it("has no axe violations while open", async () => {
    render(<TypeSelect defaultValue="idea" />)
    await openList()

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
