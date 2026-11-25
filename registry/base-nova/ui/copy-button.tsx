import * as React from "react"
import { CheckIcon, CircleAlertIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type CopyState = "idle" | "copied" | "failed"

type CopyButtonProps = Omit<React.ComponentProps<typeof Button>, "value"> & {
  /** The text that goes on the clipboard. */
  value: string
  /** The accessible name of an icon-only button, and of the idle state when there are no children: "Copy full SHA 9f8e7d6". */
  label?: string
  /** What a screen reader hears, and what `children` swap to, after a copy. */
  copiedLabel?: string
  /** What a screen reader hears, and what `children` swap to, when the clipboard refuses. */
  failedLabel?: string
  /** Milliseconds the copied or failed state stays before the button goes back to idle. */
  resetAfter?: number
  /** Called with the value once it is on the clipboard. */
  onCopy?: (value: string) => void
  /** Called with the error when the clipboard refuses, or when the page has no clipboard (a page not served over https). */
  onCopyError?: (error: unknown) => void
}

// A button that copies one value. The state lives in `data-state` (idle, copied, failed) and the words go to a
// polite status region beside the button, which is in the page before the click: a live region added at the
// moment it speaks is often not read. The button's own name stays put for an icon-only button, so the region
// is the one announcer. It is a Button underneath, so the 44px coarse-pointer floor on `[data-slot="button"]`
// applies to it as to every button.
function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  failedLabel = "Couldn't copy",
  resetAfter = 2000,
  onCopy,
  onCopyError,
  variant = "ghost",
  size,
  className,
  children,
  onClick,
  ...props
}: CopyButtonProps) {
  const [state, setState] = React.useState<CopyState>("idle")
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = React.useRef(true)
  const hasLabel = children !== undefined && children !== null && children !== false

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
    }
  }, [])

  const settle = (next: CopyState) => {
    if (!mounted.current) return
    clearTimeout(timer.current)
    setState(next)
    timer.current = setTimeout(() => setState("idle"), resetAfter)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch (error) {
      settle("failed")
      onCopyError?.(error)
      return
    }
    settle("copied")
    onCopy?.(value)
  }

  const Icon = state === "copied" ? CheckIcon : state === "failed" ? CircleAlertIcon : CopyIcon
  const result = state === "copied" ? copiedLabel : state === "failed" ? failedLabel : ""
  const iconTone = state === "copied" ? "text-success" : state === "failed" ? "text-destructive" : undefined

  return (
    <>
      <Button
        type="button"
        data-state={state}
        variant={variant}
        size={size ?? (hasLabel ? "sm" : "icon-sm")}
        aria-label={hasLabel ? undefined : label}
        className={className}
        onClick={(event) => {
          onClick?.(event)
          if (event.defaultPrevented) return
          void copy()
        }}
        {...props}
      >
        <Icon aria-hidden="true" className={iconTone} data-icon={hasLabel ? "inline-start" : undefined} />
        {hasLabel ? (state === "idle" ? children : result) : null}
      </Button>
      <span data-slot="copy-button-status" role="status" aria-live="polite" className="sr-only">
        {result}
      </span>
    </>
  )
}

export { CopyButton }
export type { CopyButtonProps }
