import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "../registry/base-nova/ui/native-select"

afterEach(cleanup)

describe("NativeSelect", () => {
  it("renders a real select with its options and the chevron hidden from assistive tech", () => {
    const { container } = render(
      <NativeSelect aria-label="Currency" defaultValue="aud">
        <NativeSelectOption value="aud">AUD</NativeSelectOption>
        <NativeSelectOptGroup label="Other">
          <NativeSelectOption value="nzd">NZD</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>,
    )

    const select = screen.getByRole("combobox", { name: "Currency" }) as HTMLSelectElement
    expect(select.value).toBe("aud")
    expect(screen.getByRole("option", { name: "NZD" })).toBeTruthy()
    expect(container.querySelector('[data-slot="native-select-icon"]')?.getAttribute("aria-hidden")).toBe("true")
  })

  it("carries the size onto the wrapper and the select", () => {
    const { container } = render(
      <NativeSelect aria-label="Size" size="sm">
        <NativeSelectOption value="a">A</NativeSelectOption>
      </NativeSelect>,
    )

    expect(container.querySelector('[data-slot="native-select-wrapper"]')?.getAttribute("data-size")).toBe("sm")
    expect(container.querySelector('[data-slot="native-select"]')?.getAttribute("data-size")).toBe("sm")
  })
})

describe("NativeSelect on a phone", () => {
  it("is 44px tall with 16px text under a coarse pointer, at both sizes", () => {
    const { container } = render(
      <>
        <NativeSelect aria-label="Default size">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
        <NativeSelect aria-label="Small size" size="sm">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </>,
    )

    const [normal, small] = Array.from(container.querySelectorAll<HTMLSelectElement>('[data-slot="native-select"]'))
    for (const select of [normal, small]) {
      expect(select.className).toContain("pointer-coarse:text-[max(1rem,16px)]")
      expect(select.className).toContain("text-sm")
    }
    expect(normal.className).toContain("pointer-coarse:h-11")
    expect(small.className).toContain("data-[size=sm]:pointer-coarse:h-11")
  })

  it("keeps the 32px and 28px desktop heights and 14px text under a fine pointer", () => {
    const { container } = render(
      <NativeSelect aria-label="Desktop">
        <NativeSelectOption value="a">A</NativeSelectOption>
      </NativeSelect>,
    )

    const select = container.querySelector('[data-slot="native-select"]') as HTMLSelectElement
    expect(select.className).toContain("h-8")
    expect(select.className).toContain("data-[size=sm]:h-7")
  })
})
