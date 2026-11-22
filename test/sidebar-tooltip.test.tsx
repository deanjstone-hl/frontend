import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "../registry/base-nova/ui/tooltip"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "../registry/base-nova/ui/sidebar"
import { installUiSdkStubs } from "./setup/ui-sdk"

installUiSdkStubs()

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const Nav = ({ defaultOpen }: { defaultOpen: boolean }) => (
  <TooltipProvider delay={0}>
    <SidebarProvider defaultOpen={defaultOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Home">Home page</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarProvider>
  </TooltipProvider>
)

const rest = (el: HTMLElement) => {
  void act(() => {
    fireEvent.pointerEnter(el, { pointerType: "mouse" })
    fireEvent.pointerMove(el, { pointerType: "mouse" })
  })
}

describe("SidebarMenuButton tooltip (frontend#245, tooltip on @ui-sdk)", () => {
  it("shows the tooltip while the sidebar is collapsed to icons", async () => {
    render(<Nav defaultOpen={false} />)

    rest(screen.getByRole("button", { name: /Home page/ }))

    expect(await screen.findByRole("tooltip")).toBeTruthy()
  })

  it("shows no tooltip while the sidebar is expanded", async () => {
    render(<Nav defaultOpen />)

    rest(screen.getByRole("button", { name: /Home page/ }))
    await act(async () => {})

    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})
