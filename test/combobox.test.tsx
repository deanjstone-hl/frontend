import { checkPattern } from "@ui-sdk/core/testing"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import axe from "axe-core"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  useComboboxAnchor,
} from "../registry/base-nova/ui/combobox"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

afterEach(cleanup)

const FRUITS = ["Apple", "Banana", "Cherry"]

type Change = (value: string | null, details: { reason: string }) => void

function Fruit({
  onValueChange,
  onOpenChange,
  ...rest
}: {
  onValueChange?: Change
  onOpenChange?: (open: boolean, details: { reason: string }) => void
} & Record<string, unknown>) {
  return (
    <Combobox
      items={FRUITS}
      onValueChange={onValueChange as never}
      onOpenChange={onOpenChange as never}
      {...rest}
    >
      <ComboboxInput placeholder="Search fruit" aria-label="Fruit" />
      <ComboboxContent>
        <ComboboxEmpty>No fruit found.</ComboboxEmpty>
        <ComboboxList>
          {(fruit: string) => (
            <ComboboxItem key={fruit} value={fruit}>
              {fruit}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const input = () => screen.getByRole("combobox", { name: "Fruit" }) as HTMLInputElement
const openList = () => fireEvent.click(screen.getByRole("button"))
const type = (text: string) => fireEvent.change(input(), { target: { value: text } })
const key = (name: string) => fireEvent.keyDown(input(), { key: name })
const options = () => screen.queryAllByRole("option").map((option) => option.textContent)

describe("Combobox: behaviour (frontend#245, on @ui-sdk)", () => {
  it("renders a labelled input and a trigger that opens the list", async () => {
    render(<Fruit />)

    expect(input()).toBeTruthy()
    expect(screen.queryByRole("listbox")).toBeNull()
    openList()

    expect(await screen.findByRole("option", { name: "Banana" })).toBeTruthy()
    expect(options()).toEqual(FRUITS)
  })

  it("reports open and closed on the input and the trigger", async () => {
    render(<Fruit />)

    expect(input().getAttribute("aria-expanded")).toBe("false")
    openList()
    await screen.findByRole("listbox")

    expect(input().getAttribute("aria-expanded")).toBe("true")
    expect(document.querySelector("[data-slot=combobox-content]")!.getAttribute("data-open")).not.toBeNull()
  })

  it("reports the chosen item and why", async () => {
    const onValueChange = vi.fn()
    render(<Fruit onValueChange={onValueChange} />)

    openList()
    fireEvent.click(await screen.findByRole("option", { name: "Cherry" }))

    expect(onValueChange).toHaveBeenLastCalledWith("Cherry", expect.objectContaining({ reason: expect.any(String) }))
  })

  it("shows the chosen item in the input and closes the list", async () => {
    render(<Fruit />)

    openList()
    fireEvent.click(await screen.findByRole("option", { name: "Cherry" }))

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(input().value).toBe("Cherry")
  })

  it("filters the list as the user types and says when nothing matches", async () => {
    render(<Fruit />)

    openList()
    await screen.findByRole("listbox")
    type("an")
    await waitFor(() => expect(options()).toEqual(["Banana"]))

    type("zzz")
    await waitFor(() => expect(options()).toEqual([]))
    expect(screen.getByText("No fruit found.")).toBeTruthy()
  })

  it("moves the highlight with the arrow keys and chooses it with Enter", async () => {
    const onValueChange = vi.fn()
    render(<Fruit onValueChange={onValueChange} />)

    input().focus()
    key("ArrowDown")
    await screen.findByRole("listbox")
    key("ArrowDown")
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Banana" }).getAttribute("data-highlighted")).not.toBeNull(),
    )
    key("Enter")

    expect(onValueChange).toHaveBeenLastCalledWith("Banana", expect.anything())
    await waitFor(() => expect(input().value).toBe("Banana"))
  })

  it("closes on Escape and keeps focus in the input", async () => {
    const onOpenChange = vi.fn()
    render(<Fruit onOpenChange={onOpenChange} />)

    input().focus()
    key("ArrowDown")
    await screen.findByRole("listbox")
    key("Escape")

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(document.activeElement).toBe(input())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: expect.any(String) }))
  })

  it("marks the selected item and carries the slot names the classes key off", async () => {
    render(<Fruit defaultValue="Banana" />)

    openList()
    const banana = await screen.findByRole("option", { name: "Banana" })

    expect(banana.getAttribute("aria-selected")).toBe("true")
    expect(banana.getAttribute("data-selected")).not.toBeNull()
    expect(banana.getAttribute("data-slot")).toBe("combobox-item")
    expect(screen.getByRole("listbox").getAttribute("data-slot")).toBe("combobox-list")
    expect(document.querySelector("[data-slot=combobox-content]")).toBeTruthy()
    expect(document.querySelector("[data-slot=combobox-trigger]")).toBeTruthy()
  })

  it("takes a controlled value", async () => {
    const onValueChange = vi.fn()
    render(<Fruit value="Apple" onValueChange={onValueChange} />)

    expect(input().value).toBe("Apple")
    openList()
    fireEvent.click(await screen.findByRole("option", { name: "Cherry" }))

    expect(onValueChange).toHaveBeenLastCalledWith("Cherry", expect.anything())
  })

  it("lists items given as value and label objects", async () => {
    render(
      <Combobox items={[{ value: "au", label: "Australia" }, { value: "nz", label: "New Zealand" }]}>
        <ComboboxInput aria-label="Country" />
        <ComboboxContent>
          <ComboboxList>
            {(country: { value: string; label: string }) => (
              <ComboboxItem key={country.value} value={country}>
                {country.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>,
    )

    fireEvent.click(screen.getByRole("button"))

    expect(await screen.findByRole("option", { name: "New Zealand" })).toBeTruthy()
  })

  it("is disabled as a whole", () => {
    render(<Fruit disabled />)

    expect(input().disabled).toBe(true)
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true)
  })

  it("submits the chosen value under its name in a form", async () => {
    const { container } = render(
      <form>
        <Fruit name="fruit" />
      </form>,
    )

    openList()
    fireEvent.click(await screen.findByRole("option", { name: "Banana" }))

    await waitFor(() => expect(new FormData(container.querySelector("form")!).get("fruit")).toBe("Banana"))
  })

  it("clears the chosen item with the clear button", async () => {
    const onValueChange = vi.fn()
    render(
      <Combobox items={FRUITS} defaultValue="Apple" onValueChange={onValueChange as never}>
        <ComboboxInput aria-label="Fruit" showClear />
        <ComboboxContent>
          <ComboboxList>
            {(fruit: string) => (
              <ComboboxItem key={fruit} value={fruit}>
                {fruit}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>,
    )

    fireEvent.click(document.querySelector("[data-slot=combobox-clear]")!)

    expect(onValueChange).toHaveBeenLastCalledWith(null, expect.anything())
    await waitFor(() => expect(input().value).toBe(""))
  })

  it("passes the SDK's combobox pattern check, open", async () => {
    const { container } = render(<Fruit />)

    openList()
    await screen.findByRole("listbox")

    await checkPattern(container, "combobox")
  })

  it("has no axe violations open", async () => {
    const { container } = render(<Fruit />)

    openList()
    await screen.findByRole("listbox")
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } })

    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

const GROUPS = [
  { value: "Citrus", items: ["Lemon", "Lime"] },
  { value: "Stone", items: ["Cherry", "Plum"] },
]

describe("Combobox: groups", () => {
  const Grouped = () => (
    <Combobox items={GROUPS}>
      <ComboboxInput aria-label="Fruit" />
      <ComboboxContent>
        <ComboboxEmpty>No fruit found.</ComboboxEmpty>
        <ComboboxList>
          {(group: { value: string; items: string[] }, index: number) => (
            <React.Fragment key={group.value}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(fruit: string) => (
                    <ComboboxItem key={fruit} value={fruit}>
                      {fruit}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            </React.Fragment>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )

  it("names each group by its label and keeps its items inside it", async () => {
    render(<Grouped />)

    fireEvent.click(screen.getByRole("button"))
    const citrus = await screen.findByRole("group", { name: "Citrus" })

    expect(within(citrus).getAllByRole("option").map((option) => option.textContent)).toEqual(["Lemon", "Lime"])
    expect(screen.getByRole("group", { name: "Stone" })).toBeTruthy()
  })

  it("hides a group once none of its items match", async () => {
    render(<Grouped />)

    fireEvent.click(screen.getByRole("button"))
    await screen.findByRole("listbox")
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cher" } })

    await waitFor(() => expect(screen.queryByRole("group", { name: "Citrus" })).toBeNull())
    expect(within(screen.getByRole("group", { name: "Stone" })).getAllByRole("option")).toHaveLength(1)
  })
})

describe("Combobox: several values with chips", () => {
  function Tags({ onValueChange }: { onValueChange?: (value: string[]) => void }) {
    const anchor = useComboboxAnchor()
    return (
      <Combobox
        multiple
        items={FRUITS}
        defaultValue={["Apple"]}
        onValueChange={onValueChange as never}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(values: string[]) => (
              <>
                {values.map((fruit) => (
                  <ComboboxChip key={fruit} value={fruit}>
                    {fruit}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput aria-label="Fruit" />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxList>
            {(fruit: string) => (
              <ComboboxItem key={fruit} value={fruit}>
                {fruit}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  }

  const chips = () => document.querySelectorAll("[data-slot=combobox-chip]")

  it("shows each chosen value as a chip with a remove button", () => {
    render(<Tags />)

    expect(chips()).toHaveLength(1)
    expect(chips()[0]!.textContent).toContain("Apple")
    expect(document.querySelectorAll("[data-slot=combobox-chip-remove]")).toHaveLength(1)
  })

  it("adds a value and keeps the list open", async () => {
    const onValueChange = vi.fn()
    render(<Tags onValueChange={onValueChange} />)

    input().focus()
    fireEvent.keyDown(input(), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: "Cherry" }))

    expect(onValueChange).toHaveBeenLastCalledWith(["Apple", "Cherry"], expect.anything())
    expect(screen.getByRole("listbox")).toBeTruthy()
    await waitFor(() => expect(chips()).toHaveLength(2))
  })

  it("removes a value with its chip button", async () => {
    const onValueChange = vi.fn()
    render(<Tags onValueChange={onValueChange} />)

    fireEvent.click(document.querySelector("[data-slot=combobox-chip-remove]")!)

    expect(onValueChange).toHaveBeenLastCalledWith([], expect.anything())
    await waitFor(() => expect(chips()).toHaveLength(0))
  })

  it("removes the last chip on Backspace in the empty input", async () => {
    render(<Tags />)

    input().focus()
    act(() => {
      fireEvent.keyDown(input(), { key: "Backspace" })
    })

    await waitFor(() => expect(chips()).toHaveLength(0))
  })
})
