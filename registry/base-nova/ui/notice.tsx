import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type NoticeProps = Omit<React.ComponentProps<typeof Alert>, "variant" | "title" | "children"> & {
  /** What is happening or what failed, one short line: "Loading briefings", "Couldn't load jobs". */
  title: React.ReactNode
  /** The detail under the title: for an error, the error's message. */
  description?: React.ReactNode
}

type ErrorNoticeProps = NoticeProps & {
  /** Extra content under the description: a hint or a link. */
  children?: React.ReactNode
  /** Buttons for the way out ("Try again", "Sign out"), in one row that wraps under the words. */
  action?: React.ReactNode
}

// What a screen shows while its data loads: an alert in the default variant with a spinning icon. A
// status, not an alert, so a screen reader reads it politely instead of interrupting.
function LoadingNotice({ title, description, icon, ...props }: Omit<NoticeProps, "children">) {
  return (
    <Alert
      role="status"
      aria-live="polite"
      icon={
        icon === undefined ? (
          <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          icon
        )
      }
      {...props}
    >
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  )
}

// What a screen shows when its data failed to load: the critical alert, with the variant's own icon.
// An alert, so a screen reader announces it.
function ErrorNotice({ title, description, children, action, ...props }: ErrorNoticeProps) {
  return (
    <Alert variant="critical" {...props}>
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
      {children ? (
        <div
          data-slot="notice-body"
          className="text-sm group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground"
        >
          {children}
        </div>
      ) : null}
      {action ? (
        <div
          data-slot="notice-actions"
          className="mt-2 flex flex-wrap gap-2 group-has-[>svg]/alert:col-start-2"
        >
          {action}
        </div>
      ) : null}
    </Alert>
  )
}

export { LoadingNotice, ErrorNotice }
