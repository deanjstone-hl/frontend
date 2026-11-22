"use client"

import * as React from "react"
import {
  Combobox as ComboboxRoot,
  ComboboxChip as ComboboxChipPart,
  ComboboxChipRemove,
  ComboboxChips as ComboboxChipsPart,
  ComboboxClear as ComboboxClearPart,
  ComboboxContent as ComboboxPopup,
  ComboboxEmpty as ComboboxEmptyPart,
  ComboboxGroup as ComboboxGroupPart,
  ComboboxGroupLabel,
  ComboboxInput as ComboboxInputPart,
  ComboboxItem as ComboboxItemPart,
  ComboboxItemIndicator,
  ComboboxList as ComboboxListPart,
  ComboboxSeparator as ComboboxSeparatorPart,
  ComboboxTrigger as ComboboxTriggerPart,
  ComboboxValue as ComboboxValuePart,
} from "@ui-sdk/react/combobox"
import { cn } from "cn"

import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

// Base UI shaped a group as { value, items }; the SDK shapes it { type: "group", label, items }.
// Consumers keep writing the first and reading the first: it is converted on the way in and back
// on the way out of the list.
type GroupEntry = { value: string; items: readonly unknown[] }

const isGroupEntry = (entry: unknown): entry is GroupEntry =>
  typeof entry === "object" &&
  entry !== null &&
  !("type" in entry) &&
  "items" in entry &&
  Array.isArray((entry as { items: unknown }).items)

const toSdkItems = (items: readonly unknown[]) =>
  items.map((entry) =>
    isGroupEntry(entry)
      ? { type: "group", label: String(entry.value), items: entry.items }
      : entry
  )

const fromSdkEntry = (entry: unknown) =>
  typeof entry === "object" &&
  entry !== null &&
  (entry as { type?: string }).type === "group"
    ? {
        value: (entry as { label: string }).label,
        items: (entry as { items: unknown[] }).items,
      }
    : entry

type ComboboxRootProps = React.ComponentProps<typeof ComboboxRoot>

// Base UI named the text of the input `inputValue`; the SDK calls it `query`.
type BaseUiNames = {
  inputValue?: string
  defaultInputValue?: string
  onInputValueChange?: (value: string, details: { reason: string }) => void
  itemToStringLabel?: (item: never) => string
  itemToStringValue?: (item: never) => string
}

function Combobox({
  items,
  inputValue,
  defaultInputValue,
  onInputValueChange,
  itemToStringLabel,
  itemToStringValue,
  ...props
}: Omit<ComboboxRootProps, "items"> &
  BaseUiNames & { items?: readonly unknown[] }) {
  const sdkItems = React.useMemo(
    () => (items ? toSdkItems(items) : undefined),
    [items]
  )
  const renamed = {
    query: inputValue,
    defaultQuery: defaultInputValue,
    onQueryChange: onInputValueChange,
    itemToLabel: itemToStringLabel,
    itemToValue: itemToStringValue,
  }
  const defined = Object.fromEntries(
    Object.entries(renamed).filter(([, value]) => value !== undefined)
  )
  return (
    <ComboboxRoot
      {...({ ...props, ...defined, items: sdkItems } as ComboboxRootProps)}
    />
  )
}

function ComboboxValue({
  children,
  ...props
}: Omit<React.ComponentProps<typeof ComboboxValuePart>, "children"> & {
  children?: React.ReactNode | ((value: never) => React.ReactNode)
}) {
  return (
    <ComboboxValuePart {...props}>
      {typeof children === "function"
        ? (state) => children(state.value as never)
        : children}
    </ComboboxValuePart>
  )
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxTriggerPart>) {
  return (
    <ComboboxTriggerPart
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </ComboboxTriggerPart>
  )
}

function ComboboxClear({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxClearPart>) {
  return (
    <ComboboxClearPart
      data-slot="combobox-clear"
      aria-label="Clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon className="pointer-events-none" />
    </ComboboxClearPart>
  )
}

function ComboboxInput({
  className,
  children,
  disabled,
  showTrigger = true,
  showClear = false,
  ...props
}: Omit<React.ComponentProps<typeof ComboboxInputPart>, "children"> & {
  children?: React.ReactNode
  showTrigger?: boolean
  showClear?: boolean
}) {
  return (
    <InputGroup className={cn("w-auto", className)}>
      <ComboboxInputPart
        render={<InputGroupInput disabled={disabled} />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<ComboboxTrigger aria-label="Show options" />}
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-open:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

type Anchor =
  | React.RefObject<Element | null>
  | Element
  | { getBoundingClientRect: () => DOMRect }
  | string
  | null

// useComboboxAnchor() hands back a ref, which Base UI accepted as an anchor; the SDK wants the
// element or anything with getBoundingClientRect(), read on every check, so the ref is read lazily.
const isRef = (anchor: Anchor): anchor is React.RefObject<Element | null> =>
  typeof anchor === "object" && anchor !== null && "current" in anchor

const useSdkAnchor = (anchor: Anchor | undefined) =>
  React.useMemo(() => {
    if (anchor === undefined || !isRef(anchor)) return anchor
    return {
      getBoundingClientRect: () =>
        anchor.current?.getBoundingClientRect() ?? new DOMRect(),
    }
  }, [anchor])

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: Omit<React.ComponentProps<typeof ComboboxPopup>, "anchor"> & {
  anchor?: Anchor
}) {
  const sdkAnchor = useSdkAnchor(anchor)
  return (
    <ComboboxPopup
      data-slot="combobox-content"
      data-chips={!!anchor}
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      anchor={sdkAnchor}
      className={cn(
        "group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 [--list-height:var(--available-height)] data-[chips=true]:min-w-(--anchor-width) data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...(props as object)}
    />
  )
}

function ComboboxList({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof ComboboxListPart>, "children"> & {
  children?: React.ReactNode | ((item: never, index: number) => React.ReactNode)
}) {
  return (
    <ComboboxListPart
      data-slot="combobox-list"
      className={cn(
        "no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--list-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 empty:p-0",
        className
      )}
      {...props}
    >
      {typeof children === "function"
        ? (state) =>
            (state.items as unknown[]).map((entry, index) =>
              children(fromSdkEntry(entry) as never, index)
            )
        : children}
    </ComboboxListPart>
  )
}

function ComboboxItem({
  className,
  children,
  label,
  value,
  ...props
}: React.ComponentProps<typeof ComboboxItemPart>) {
  // A string item is its own label, and so is plain text content; the SDK cannot read a label out
  // of content that also holds the check.
  const text =
    label ??
    (typeof children === "string"
      ? children
      : typeof value === "string"
        ? value
        : undefined)
  return (
    <ComboboxItemPart
      data-slot="combobox-item"
      value={value}
      label={text}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="pointer-events-none" />
      </ComboboxItemIndicator>
    </ComboboxItemPart>
  )
}

const GroupItemsContext = React.createContext<readonly unknown[]>([])

function ComboboxGroup({
  className,
  items = [],
  ...props
}: React.ComponentProps<typeof ComboboxGroupPart> & {
  items?: readonly unknown[]
}) {
  return (
    <GroupItemsContext.Provider value={items}>
      <ComboboxGroupPart
        data-slot="combobox-group"
        className={cn(className)}
        {...props}
      />
    </GroupItemsContext.Provider>
  )
}

function ComboboxLabel({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxGroupLabel>) {
  return (
    <ComboboxGroupLabel
      data-slot="combobox-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxCollection({
  children,
}: {
  children?: React.ReactNode | ((item: never, index: number) => React.ReactNode)
}) {
  const items = React.useContext(GroupItemsContext)
  return (
    <>
      {typeof children === "function"
        ? items.map((item, index) => children(item as never, index))
        : children}
    </>
  )
}

function ComboboxEmpty({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxEmptyPart>) {
  return (
    <ComboboxEmptyPart
      data-slot="combobox-empty"
      className={cn(
        "flex w-full justify-center py-2 text-center text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function ComboboxSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxSeparatorPart>) {
  return (
    <ComboboxSeparatorPart
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxChipsPart>) {
  return (
    <ComboboxChipsPart
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent bg-clip-padding px-2.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: React.ComponentProps<typeof ComboboxChipPart> & {
  showRemove?: boolean
}) {
  return (
    <ComboboxChipPart
      data-slot="combobox-chip"
      className={cn(
        "flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          aria-label="Remove"
          className="-ml-1 opacity-50 hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <XIcon className="pointer-events-none" />
        </ComboboxChipRemove>
      )}
    </ComboboxChipPart>
  )
}

function ComboboxChipsInput({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxInputPart>) {
  return (
    <ComboboxInputPart
      data-slot="combobox-chip-input"
      className={cn("min-w-16 flex-1 outline-none", className)}
      {...props}
    />
  )
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
}
