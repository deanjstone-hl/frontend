"use client"

import * as React from "react"
import {
  Select as SelectRoot,
  SelectContent as SelectPopup,
  SelectGroup as SelectGroupPart,
  SelectGroupLabel,
  SelectItem as SelectItemPart,
  SelectItemIndicator,
  SelectItemText,
  SelectSeparator as SelectSeparatorPart,
  SelectTrigger as SelectTriggerPart,
  SelectValue as SelectValuePart,
  type SelectProps,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "cn"

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

// Base UI took `items` as an array, a record of value to label, or groups shaped { value, items }.
// The SDK takes an array whose groups are { type: "group", label, items }: a record and the groups are
// converted on the way in.
type GroupEntry = { value: string; items: readonly unknown[] }

const isGroupEntry = (entry: unknown): entry is GroupEntry =>
  typeof entry === "object" &&
  entry !== null &&
  !("type" in entry) &&
  "items" in entry &&
  Array.isArray((entry as { items: unknown }).items)

const toSdkItems = (items: unknown): unknown => {
  if (Array.isArray(items)) {
    return items.map((entry) =>
      isGroupEntry(entry)
        ? { type: "group", label: String(entry.value), items: entry.items }
        : entry
    )
  }
  if (typeof items === "object" && items !== null) {
    return Object.entries(items).map(([value, label]) => ({
      value,
      label: String(label),
    }))
  }
  return items
}

// With `items` on the root, the SDK reads each option's disabled flag from that data, not from the
// SelectItem. Base UI used `items` for labels only and read `disabled` off the item, so an item
// reports its disabled state to the root, which adds it to the data it hands the SDK.
const DisabledValues = React.createContext<
  ((value: string, disabled: boolean) => void) | null
>(null)

const withDisabled = (items: unknown, disabledValues: ReadonlySet<string>): unknown => {
  if (!Array.isArray(items) || disabledValues.size === 0) return items
  return items.map((entry) => {
    if (typeof entry === "string") {
      return disabledValues.has(entry)
        ? { value: entry, label: entry, disabled: true }
        : entry
    }
    if (typeof entry !== "object" || entry === null) return entry
    const { type, value, items: nested } = entry as {
      type?: string
      value?: unknown
      items?: unknown
    }
    if (type === "group") {
      return { ...entry, items: withDisabled(nested, disabledValues) }
    }
    return typeof value === "string" && disabledValues.has(value)
      ? { ...entry, disabled: true }
      : entry
  })
}

// Base UI named the label and value functions itemToStringLabel and itemToStringValue; the SDK calls
// them itemToLabel and itemToValue.
type BaseUiNames<T> = {
  itemToStringLabel?: (item: T) => string
  itemToStringValue?: (item: T) => string
}

function Select<T = string, Multiple extends boolean | undefined = false>({
  items,
  itemToStringLabel,
  itemToStringValue,
  ...props
}: Omit<SelectProps<T, Multiple>, "items"> &
  BaseUiNames<T> & { items?: unknown }) {
  const [disabledValues, setDisabledValues] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const registerDisabled = React.useCallback(
    (value: string, disabled: boolean) =>
      setDisabledValues((previous) => {
        if (previous.has(value) === disabled) return previous
        const next = new Set(previous)
        if (disabled) next.add(value)
        else next.delete(value)
        return next
      }),
    []
  )
  const sdkItems = React.useMemo(
    () => withDisabled(toSdkItems(items), disabledValues),
    [items, disabledValues]
  )
  const renamed = {
    itemToLabel: itemToStringLabel,
    itemToValue: itemToStringValue,
  }
  const defined = Object.fromEntries(
    Object.entries(renamed).filter(([, value]) => value !== undefined)
  )
  return (
    <DisabledValues.Provider value={registerDisabled}>
      <SelectRoot
        {...({ ...props, ...defined, items: sdkItems } as SelectProps<T, Multiple>)}
      />
    </DisabledValues.Provider>
  )
}

function SelectGroup({
  "data-slot": slot = "select-group",
  className,
  render,
  ...props
}: React.ComponentProps<typeof SelectGroupPart> & SlotProp) {
  return (
    <SelectGroupPart
      render={slotted(slot, <div />, render) as typeof render}
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  "data-slot": slot = "select-value",
  className,
  children,
  render,
  ...props
}: Omit<React.ComponentProps<typeof SelectValuePart>, "children"> &
  SlotProp & {
    children?: React.ReactNode | ((value: never) => React.ReactNode)
  }) {
  return (
    <SelectValuePart
      render={slotted(slot, <span />, render) as typeof render}
      className={cn("flex flex-1 text-left", className)}
      {...props}
    >
      {typeof children === "function"
        ? (state) => children(state.value as never)
        : children}
    </SelectValuePart>
  )
}

function SelectTrigger({
  "data-slot": slot = "select-trigger",
  className,
  size = "default",
  children,
  render,
  ...props
}: React.ComponentProps<typeof SelectTriggerPart> &
  SlotProp & {
    size?: "sm" | "default"
  }) {
  return (
    <SelectTriggerPart
      render={slotted(slot, <button />, render) as typeof render}
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </SelectTriggerPart>
  )
}

function SelectContent({
  "data-slot": slot = "select-content",
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  render,
  ...props
}: React.ComponentProps<typeof SelectPopup> & SlotProp) {
  return (
    <SelectPopup
      render={slotted(slot, <div />, render) as typeof render}
      data-align-trigger={alignItemWithTrigger}
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      alignItemWithTrigger={alignItemWithTrigger}
      className={cn(
        "cn-menu-target cn-menu-translucent relative max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    >
      {children}
    </SelectPopup>
  )
}

function SelectLabel({
  "data-slot": slot = "select-label",
  className,
  render,
  ...props
}: React.ComponentProps<typeof SelectGroupLabel> & SlotProp) {
  return (
    <SelectGroupLabel
      render={slotted(slot, <div />, render) as typeof render}
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  "data-slot": slot = "select-item",
  className,
  children,
  render,
  ...props
}: React.ComponentProps<typeof SelectItemPart> & SlotProp) {
  const registerDisabled = React.useContext(DisabledValues)
  const { value, disabled } = props as { value?: unknown; disabled?: boolean }
  React.useLayoutEffect(() => {
    if (typeof value === "string") registerDisabled?.(value, !!disabled)
  }, [registerDisabled, value, disabled])
  return (
    <SelectItemPart
      render={slotted(slot, <div />, render) as typeof render}
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectItemText>
      <SelectItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="pointer-events-none" />
      </SelectItemIndicator>
    </SelectItemPart>
  )
}

function SelectSeparator({
  "data-slot": slot = "select-separator",
  className,
  render,
  ...props
}: React.ComponentProps<typeof SelectSeparatorPart> & SlotProp) {
  return (
    <SelectSeparatorPart
      render={slotted(slot, <div />, render) as typeof render}
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

// The SDK's list scrolls natively inside its available height, with no scroll arrows to draw. The
// two exports stay so existing imports keep working, and draw nothing.
function SelectScrollUpButton(_props: React.ComponentProps<"div">) {
  return null
}

function SelectScrollDownButton(_props: React.ComponentProps<"div">) {
  return null
}

export {
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
}
