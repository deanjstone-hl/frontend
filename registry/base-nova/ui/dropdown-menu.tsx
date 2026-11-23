"use client"

import * as React from "react"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent as MenuPopup,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "cn"

// The SDK sets data-slot on every part itself and ignores a data-slot prop, so a part keeps its slot
// (and takes one from a caller such as menubar) through the element it renders.
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

function DropdownMenu({ ...props }: React.ComponentProps<typeof Menu>) {
  return <Menu {...props} />
}

// The SDK renders a menu in the browser's top layer, so there is nothing to portal to. The export
// stays so existing imports keep working.
function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DropdownMenuTrigger({
  "data-slot": slot = "dropdown-menu-trigger",
  render,
  ...props
}: React.ComponentProps<typeof MenuTrigger> & SlotProp) {
  return (
    <MenuTrigger
      render={slotted(slot, <button />, render) as typeof render}
      {...props}
    />
  )
}

function DropdownMenuContent({
  "data-slot": slot = "dropdown-menu-content",
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  render,
  ...props
}: React.ComponentProps<typeof MenuPopup> & SlotProp) {
  return (
    <MenuPopup
      render={slotted(slot, <div />, render) as typeof render}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "cn-menu-target cn-menu-translucent max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuGroup({
  "data-slot": slot = "dropdown-menu-group",
  render,
  ...props
}: React.ComponentProps<typeof MenuGroup> & SlotProp) {
  return (
    <MenuGroup
      render={slotted(slot, <div />, render) as typeof render}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  "data-slot": slot = "dropdown-menu-label",
  className,
  inset,
  render,
  ...props
}: React.ComponentProps<typeof MenuGroupLabel> &
  SlotProp & {
    inset?: boolean
  }) {
  return (
    <MenuGroupLabel
      render={slotted(slot, <div />, render) as typeof render}
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className
      )}
      {...props}
    />
  )
}

// A press already reaches onClick as a click. The SDK's own selection event also covers Enter and Space,
// which Base UI turned into a click, so onClick is called for those too.
function DropdownMenuItem({
  "data-slot": slot = "dropdown-menu-item",
  className,
  inset,
  variant = "default",
  render,
  onClick,
  onSelect,
  ...props
}: React.ComponentProps<typeof MenuItem> &
  SlotProp & {
    inset?: boolean
    variant?: "default" | "destructive"
  }) {
  return (
    <MenuItem
      render={slotted(slot, <div />, render) as typeof render}
      data-inset={inset}
      data-variant={variant}
      onClick={onClick}
      onSelect={(event) => {
        const result = onSelect?.(event)
        if (event.type !== "click") onClick?.(event as never)
        return result
      }}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof MenuSub>) {
  return <MenuSub {...props} />
}

function DropdownMenuSubTrigger({
  "data-slot": slot = "dropdown-menu-sub-trigger",
  className,
  inset,
  children,
  render,
  ...props
}: React.ComponentProps<typeof MenuSubTrigger> &
  SlotProp & {
    inset?: boolean
  }) {
  return (
    <MenuSubTrigger
      render={slotted(slot, <div />, render) as typeof render}
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="cn-rtl-flip ml-auto" />
    </MenuSubTrigger>
  )
}

function DropdownMenuSubContent({
  "data-slot": slot = "dropdown-menu-sub-content",
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  render,
  ...props
}: React.ComponentProps<typeof MenuSubContent> & SlotProp) {
  return (
    <MenuSubContent
      render={slotted(slot, <div />, render) as typeof render}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "cn-menu-target cn-menu-translucent max-h-(--available-height) w-auto min-w-[96px] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

// The SDK identifies a checkbox item by its value; Base UI did not need one, so an item without
// one gets a generated one.
function DropdownMenuCheckboxItem({
  "data-slot": slot = "dropdown-menu-checkbox-item",
  className,
  children,
  value,
  inset,
  render,
  ...props
}: Omit<React.ComponentProps<typeof MenuCheckboxItem>, "value"> &
  SlotProp & {
    value?: string
    inset?: boolean
  }) {
  const generatedValue = React.useId()
  return (
    <MenuCheckboxItem
      render={slotted(slot, <div />, render) as typeof render}
      value={value ?? generatedValue}
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuItemIndicator>
          <CheckIcon />
        </MenuItemIndicator>
      </span>
      {children}
    </MenuCheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  "data-slot": slot = "dropdown-menu-radio-group",
  render,
  ...props
}: React.ComponentProps<typeof MenuRadioGroup> & SlotProp) {
  return (
    <MenuRadioGroup
      render={slotted(slot, <div />, render) as typeof render}
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  "data-slot": slot = "dropdown-menu-radio-item",
  className,
  children,
  inset,
  render,
  ...props
}: React.ComponentProps<typeof MenuRadioItem> &
  SlotProp & {
    inset?: boolean
  }) {
  return (
    <MenuRadioItem
      render={slotted(slot, <div />, render) as typeof render}
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuItemIndicator>
          <CheckIcon />
        </MenuItemIndicator>
      </span>
      {children}
    </MenuRadioItem>
  )
}

function DropdownMenuSeparator({
  "data-slot": slot = "dropdown-menu-separator",
  className,
  render,
  ...props
}: React.ComponentProps<typeof MenuSeparator> & SlotProp) {
  return (
    <MenuSeparator
      render={slotted(slot, <div />, render) as typeof render}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
