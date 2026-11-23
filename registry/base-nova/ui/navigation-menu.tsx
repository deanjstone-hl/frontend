"use client"

import * as React from "react"
import {
  NavigationMenu as NavigationMenuRoot,
  NavigationMenuContent as NavigationMenuPanel,
  NavigationMenuIndicator as NavigationMenuIndicatorPart,
  NavigationMenuItem as NavigationMenuItemPart,
  NavigationMenuLink as NavigationMenuLinkPart,
  NavigationMenuList as NavigationMenuListPart,
  NavigationMenuTrigger as NavigationMenuTriggerPart,
  NavigationMenuViewport,
} from "@ui-sdk/react/navigation-menu"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"

// The SDK sets data-slot on every part itself and ignores a data-slot prop, so a part keeps its slot
// (and takes one from a caller) through the element it renders.
type SlotProp = { "data-slot"?: string }

function slotted<Render>(
  slot: string,
  fallback: React.ReactElement,
  render: Render | undefined
): Render | React.ReactElement {
  if (typeof render === "function") return render
  const element = (React.isValidElement(render) ? render : fallback) as React.ReactElement<SlotProp>
  return React.cloneElement(element, {
    "data-slot": element.props["data-slot"] ?? slot,
  })
}

type ViewportProps = React.ComponentProps<typeof NavigationMenuViewport>

function NavigationMenu({
  "data-slot": slot = "navigation-menu",
  align = "start",
  className,
  children,
  render,
  ...props
}: React.ComponentProps<typeof NavigationMenuRoot> &
  SlotProp &
  Pick<ViewportProps, "align">) {
  return (
    <NavigationMenuRoot
      render={slotted(slot, <nav />, render) as typeof render}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
      <NavigationMenuPositioner align={align} />
    </NavigationMenuRoot>
  )
}

function NavigationMenuList({
  "data-slot": slot = "navigation-menu-list",
  className,
  render,
  ...props
}: React.ComponentProps<typeof NavigationMenuListPart> & SlotProp) {
  return (
    <NavigationMenuListPart
      render={slotted(slot, <ul />, render) as typeof render}
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-0",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuItem({
  "data-slot": slot = "navigation-menu-item",
  className,
  render,
  ...props
}: React.ComponentProps<typeof NavigationMenuItemPart> & SlotProp) {
  return (
    <NavigationMenuItemPart
      render={slotted(slot, <li />, render) as typeof render}
      className={cn("relative", className)}
      {...props}
    />
  )
}

const navigationMenuTriggerStyle = cva(
  "group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-open:bg-muted/50 data-open:hover:bg-muted data-open:focus:bg-muted"
)

function NavigationMenuTrigger({
  "data-slot": slot = "navigation-menu-trigger",
  className,
  children,
  render,
  ...props
}: React.ComponentProps<typeof NavigationMenuTriggerPart> & SlotProp) {
  return (
    <NavigationMenuTriggerPart
      render={slotted(slot, <button />, render) as typeof render}
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="relative top-px ml-1 size-3 transition duration-300 group-data-open/navigation-menu-trigger:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuTriggerPart>
  )
}

// The SDK moves an open panel into the viewport and sizes the viewport to it, so a panel sits at the
// viewport's corner with its own width and takes the SDK's motion attributes for the slide between panels.
function NavigationMenuContent({
  "data-slot": slot = "navigation-menu-content",
  className,
  render,
  ...props
}: React.ComponentProps<typeof NavigationMenuPanel> & SlotProp) {
  return (
    <NavigationMenuPanel
      render={slotted(slot, <div />, render) as typeof render}
      className={cn(
        "absolute start-0 top-0 max-h-(--available-height,var(--panel-height)) w-max overflow-y-auto p-1 transition-[opacity,translate] duration-[0.35s] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 data-[motion=from-end]:data-starting-style:translate-x-12 data-[motion=from-start]:data-starting-style:-translate-x-12 data-[motion=to-end]:data-ending-style:translate-x-12 data-[motion=to-start]:data-ending-style:-translate-x-12 rtl:data-[motion=from-end]:data-starting-style:-translate-x-12 rtl:data-[motion=from-start]:data-starting-style:translate-x-12 rtl:data-[motion=to-end]:data-ending-style:-translate-x-12 rtl:data-[motion=to-start]:data-ending-style:translate-x-12",
        className
      )}
      {...props}
    />
  )
}

// The SDK's viewport is the positioned popup that holds whichever panel is open, where Base UI used a
// positioner, a popup and a viewport. The name stays for existing imports.
function NavigationMenuPositioner({
  "data-slot": slot = "navigation-menu-viewport",
  className,
  side = "bottom",
  sideOffset = 8,
  align = "start",
  alignOffset = 0,
  render,
  ...props
}: ViewportProps & SlotProp) {
  return (
    <NavigationMenuViewport
      render={slotted(slot, <div />, render) as typeof render}
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      className={cn(
        "relative h-(--viewport-height) w-(--viewport-width) origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow ring-1 ring-foreground/10 transition-[width,height,left,top,opacity,scale] duration-[0.35s] ease-[cubic-bezier(0.22,1,0.36,1)] outline-none [--panel-height:var(--available-height)] motion-reduce:transition-none data-ending-style:scale-90 data-ending-style:opacity-0 data-ending-style:duration-150 data-starting-style:scale-90 data-starting-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

// Base UI marked the link for the current page with `active`; the SDK calls it `current`.
function NavigationMenuLink({
  "data-slot": slot = "navigation-menu-link",
  className,
  active,
  current,
  render,
  ...props
}: React.ComponentProps<typeof NavigationMenuLinkPart> &
  SlotProp & {
    active?: boolean
  }) {
  return (
    <NavigationMenuLinkPart
      render={slotted(slot, <a />, render) as typeof render}
      current={current ?? active}
      className={cn(
        "flex items-center gap-2 rounded-lg p-2 text-sm transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 in-data-[slot=navigation-menu-content]:rounded-md data-current:bg-muted/50 data-current:hover:bg-muted data-current:focus:bg-muted [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuIndicator({
  "data-slot": slot = "navigation-menu-indicator",
  className,
  render,
  ...props
}: React.ComponentProps<typeof NavigationMenuIndicatorPart> & SlotProp) {
  return (
    <NavigationMenuIndicatorPart
      render={slotted(slot, <div />, render) as typeof render}
      className={cn(
        "absolute top-full left-(--active-item-left) z-1 flex h-1.5 w-(--active-item-width) items-end justify-center overflow-hidden data-closed:animate-out data-closed:fade-out data-open:animate-in data-open:fade-in not-data-visible:hidden",
        className
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </NavigationMenuIndicatorPart>
  )
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuPositioner,
}
