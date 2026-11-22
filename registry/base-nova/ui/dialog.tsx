"use client"

import {
  Dialog as DialogRoot,
  DialogBackdrop,
  DialogClose as DialogClosePart,
  DialogContent as DialogPopup,
  DialogDescription as DialogDescriptionPart,
  DialogTitle as DialogTitlePart,
  DialogTrigger as DialogTriggerPart,
} from "@ui-sdk/react/dialog"
import { XIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"

function Dialog({ ...props }: React.ComponentProps<typeof DialogRoot>) {
  return <DialogRoot {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogTriggerPart>) {
  return <DialogTriggerPart {...props} />
}

// The SDK renders a dialog in the browser's top layer, so there is nothing to portal to. The
// export stays so existing imports keep working.
function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogClosePart>) {
  return <DialogClosePart {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogBackdrop>) {
  return (
    <DialogBackdrop
      render={<div data-slot="dialog-overlay" />}
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPopup> & {
  showCloseButton?: boolean
}) {
  return (
    <>
      <DialogOverlay />
      <DialogPopup
        data-close-button={showCloseButton ? "" : undefined}
        className={cn(
          "group/dialog-content fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2*max(1rem,var(--safe-l),var(--safe-r)))] max-h-[calc(100dvh-2rem-2*max(var(--safe-t),var(--safe-b)))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClosePart
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClosePart>
        )}
      </DialogPopup>
    </>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 group-data-[close-button]/dialog-content:pr-10", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClosePart render={<Button variant="outline" />}>
          Close
        </DialogClosePart>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogTitlePart>) {
  return (
    <DialogTitlePart
      className={cn(
        "cn-font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescriptionPart>) {
  return (
    <DialogDescriptionPart
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
