import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleCheckIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
        success:
          "bg-success/10 text-success *:data-[slot=alert-description]:text-success dark:bg-success/15",
        warning:
          "bg-warning/10 text-warning *:data-[slot=alert-description]:text-warning dark:bg-warning/15",
        critical:
          "bg-critical/10 text-critical *:data-[slot=alert-description]:text-critical dark:bg-critical/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// A status notice is never colour alone: success, warning and critical draw an icon
// unless the caller passes their own or opts out with `icon={null}`.
const statusIcons = {
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  critical: OctagonAlertIcon,
}

function Alert({
  className,
  variant,
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    /** The notice's icon, a direct child. Omit it for the variant's own; `null` for none. */
    icon?: React.ReactNode
  }) {
  const StatusIcon =
    variant === "success" || variant === "warning" || variant === "critical"
      ? statusIcons[variant]
      : null
  const mark =
    icon === undefined ? StatusIcon && <StatusIcon aria-hidden="true" /> : icon

  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "default"}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {mark}
      {children}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
