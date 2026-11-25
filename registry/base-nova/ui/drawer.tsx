"use client"

import {
  Drawer as DrawerRoot,
  DrawerBackdrop,
  DrawerClose as DrawerClosePart,
  DrawerContent as DrawerPopup,
  DrawerDescription as DrawerDescriptionPart,
  DrawerTitle as DrawerTitlePart,
  DrawerTrigger as DrawerTriggerPart,
} from "@ui-sdk/react/drawer"
import { XIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"

type SwipeDirection = "down" | "up" | "left" | "right"

// The SDK names the edge a drawer comes from; the registry's API names the direction you swipe to
// dismiss it, which is the opposite way round.
const sideOf = {
  down: "bottom",
  up: "top",
  left: "left",
  right: "right",
} as const

type DrawerContextProps = {
  hasSnapPoints: boolean
  modal: React.ComponentProps<typeof DrawerRoot>["modal"]
  showSwipeHandle: boolean
  swipeDirection: SwipeDirection
}

const DrawerContext = React.createContext<DrawerContextProps | null>(null)

function useDrawer() {
  const context = React.useContext(DrawerContext)

  if (!context) {
    throw new Error("useDrawer must be used within a Drawer.")
  }

  return context
}

function Drawer({
  modal = true,
  showSwipeHandle = false,
  snapPoints,
  swipeDirection = "down",
  ...props
}: Omit<React.ComponentProps<typeof DrawerRoot>, "side"> & {
  showSwipeHandle?: boolean
  swipeDirection?: SwipeDirection
}) {
  const hasSnapPoints = snapPoints != null && snapPoints.length > 0
  const contextValue = React.useMemo(
    () => ({ hasSnapPoints, modal, showSwipeHandle, swipeDirection }),
    [hasSnapPoints, modal, showSwipeHandle, swipeDirection]
  )

  return (
    <DrawerContext.Provider value={contextValue}>
      <DrawerRoot
        modal={modal}
        side={sideOf[swipeDirection]}
        snapPoints={snapPoints}
        {...props}
      />
    </DrawerContext.Provider>
  )
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerTriggerPart>) {
  return <DrawerTriggerPart {...props} />
}

// The SDK renders a drawer in the browser's top layer, so there is nothing to portal to. The
// export stays so existing imports keep working.
function DrawerPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerClosePart>) {
  return <DrawerClosePart {...props} />
}

// The SDK sets the backdrop's opacity from how far the sheet is open, so the overlay only brings
// the colour and the blur.
function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerBackdrop>) {
  return (
    <DrawerBackdrop
      render={<div data-slot="drawer-overlay" />}
      className={cn(
        "fixed inset-0 z-50 bg-black/10 select-none supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function DrawerSwipeHandle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className={cn(
        "relative z-10 flex shrink-0 cursor-grab group-data-[swipe-axis=x]/drawer-content:h-full group-data-[swipe-axis=x]/drawer-content:w-3 group-data-[swipe-axis=x]/drawer-content:items-center group-data-[swipe-axis=y]/drawer-content:h-3 group-data-[swipe-axis=y]/drawer-content:w-full group-data-[swipe-axis=y]/drawer-content:justify-center group-data-[swipe-direction=down]/drawer-content:items-end group-data-[swipe-direction=left]/drawer-content:order-last group-data-[swipe-direction=left]/drawer-content:justify-start group-data-[swipe-direction=right]/drawer-content:justify-end group-data-[swipe-direction=up]/drawer-content:order-last group-data-[swipe-direction=up]/drawer-content:items-start after:block after:shrink-0 after:rounded-full after:bg-muted group-data-[swipe-axis=x]/drawer-content:after:h-24 group-data-[swipe-axis=x]/drawer-content:after:w-1 group-data-[swipe-axis=y]/drawer-content:after:h-1 group-data-[swipe-axis=y]/drawer-content:after:w-24 active:cursor-grabbing",
        className
      )}
      {...props}
    />
  )
}

// The sheet is the SDK's `drawer-content` part: it places and moves it, and handles the swipe, the
// snap points, the nesting and reduced motion, so the classes here only size it, give it a surface
// and corners, and keep it clear of the screen edges. Keep the content a plain block: under the
// scroll-snap driver a swipe moves the sheet by scrolling its host, so an element between the
// finger and the host that is a scroll container (overflow hidden, auto or scroll) swallows the
// swipe (vercel-labs/ui#1010). The wrapper clips its rounded corners with overflow-clip, which is
// not a scroll container. A region that must scroll goes in an element of your own, which the SDK
// lets a swipe hand over once it reaches the top.
function DrawerContent({
  className,
  children,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof DrawerPopup>, "children"> & {
  children?: React.ReactNode
  showCloseButton?: boolean
}) {
  const { hasSnapPoints, modal, showSwipeHandle, swipeDirection } = useDrawer()
  const swipeAxis =
    swipeDirection === "down" || swipeDirection === "up" ? "y" : "x"

  return (
    <>
      {modal === true && <DrawerOverlay />}
      <DrawerPopup
        data-swipe-direction={swipeDirection}
        data-swipe-axis={swipeAxis}
        data-snap-points={hasSnapPoints ? "" : undefined}
        className={cn(
          // Base.
          "group/drawer-content relative flex min-h-0 flex-col bg-popover text-sm text-popover-foreground outline-none select-none data-[swipe-direction=down]:rounded-t-xl data-[swipe-direction=down]:border-t data-[swipe-direction=left]:rounded-r-xl data-[swipe-direction=left]:border-r data-[swipe-direction=right]:rounded-l-xl data-[swipe-direction=right]:border-l data-[swipe-direction=up]:rounded-b-xl data-[swipe-direction=up]:border-b",
          // Bleed: covers the gap a drag past the edge opens.
          "after:pointer-events-none after:absolute after:bg-(--drawer-bleed-background,var(--color-popover)) data-[swipe-axis=x]:after:inset-y-0 data-[swipe-axis=x]:after:w-(--bleed) data-[swipe-axis=y]:after:inset-x-0 data-[swipe-axis=y]:after:h-(--bleed) data-[swipe-direction=down]:after:top-full data-[swipe-direction=left]:after:right-full data-[swipe-direction=right]:after:left-full data-[swipe-direction=up]:after:bottom-full [--bleed:3rem]",
          // Sizing: a snap-point drawer takes the full height its largest point is a fraction of.
          "data-[swipe-axis=x]:w-3/4 data-[swipe-axis=x]:flex-row data-[swipe-axis=x]:sm:w-96 data-[swipe-axis=y]:max-h-[calc(100dvh-6rem)] data-[swipe-axis=y]:data-snap-points:h-[calc(100dvh-6rem)]",
          // Nested: a sheet opened from inside this one steps this one back.
          "origin-bottom data-[swipe-direction=left]:origin-left data-[swipe-direction=right]:origin-right data-[swipe-direction=up]:origin-top [scale:calc(1-var(--drawer-stack,0)*0.05)]",
          // Insets: the sheet is flush with a screen edge, so it clears the status bar,
          // the home indicator and the display curves itself. Only a snap-point drawer
          // can reach the full screen height, so only it takes the top inset.
          "data-[swipe-direction=down]:pb-(--safe-b) data-[swipe-direction=up]:pt-(--safe-t) data-[swipe-axis=y]:pl-(--safe-l) data-[swipe-axis=y]:pr-(--safe-r) data-[swipe-axis=y]:data-snap-points:pt-(--safe-t) data-[swipe-axis=x]:pt-(--safe-t) data-[swipe-axis=x]:pb-(--safe-b) data-[swipe-direction=left]:pl-(--safe-l) data-[swipe-direction=right]:pr-(--safe-r)",
          className
        )}
        {...props}
      >
        {showSwipeHandle && <DrawerSwipeHandle />}
        <div
          data-slot="drawer-body"
          className="flex min-h-0 flex-1 flex-col overflow-clip rounded-[inherit] select-text group-data-dragging/drawer-content:select-none"
        >
          {children}
        </div>
        {showCloseButton && (
          <DrawerClosePart
            render={
              <Button
                data-slot="drawer-close"
                variant="ghost"
                className="absolute top-[calc(var(--safe-t)+0.75rem)] right-[calc(var(--safe-r)+0.75rem)] z-10"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DrawerClosePart>
        )}
      </DrawerPopup>
    </>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex shrink-0 flex-col gap-0.5 p-4 pb-0 group-data-[swipe-axis=y]/drawer-content:text-center md:gap-0.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4 pt-0", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerTitlePart>) {
  return (
    <DrawerTitlePart
      className={cn(
        "cn-font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerDescriptionPart>) {
  return (
    <DrawerDescriptionPart
      className={cn("text-sm text-balance text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerSwipeHandle,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
