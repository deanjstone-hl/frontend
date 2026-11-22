"use client"

import {
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipPopup,
  TooltipTrigger as TooltipTriggerPart,
} from "@ui-sdk/react/tooltip"
import * as React from "react"

import { cn } from "cn"

// The SDK has no provider: a tooltip that opens soon after another opens at once by itself. The
// provider stays so existing trees keep working, and hands its delay and closeDelay to the
// tooltips under it (Base UI's provider did the same, with delay 0 unless you set it).
const TooltipDelayContext = React.createContext<{ delay?: number; closeDelay?: number }>({})

function TooltipProvider({
  delay = 0,
  closeDelay,
  children,
}: {
  delay?: number
  closeDelay?: number
  children?: React.ReactNode
}) {
  const value = React.useMemo(() => ({ delay, closeDelay }), [delay, closeDelay])
  return <TooltipDelayContext.Provider value={value}>{children}</TooltipDelayContext.Provider>
}

function Tooltip({ delay, closeDelay, ...props }: React.ComponentProps<typeof TooltipRoot>) {
  const provided = React.useContext(TooltipDelayContext)
  return <TooltipRoot delay={delay ?? provided.delay} closeDelay={closeDelay ?? provided.closeDelay} {...props} />
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipTriggerPart>) {
  return <TooltipTriggerPart {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPopup>) {
  return (
    <TooltipPopup
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    >
      {children}
      <TooltipArrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
    </TooltipPopup>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
