import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "neutral"
  | "lime"
  | "warm"
  | "violet"
  | "rose";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
  withDot?: boolean;
}

const DOT_CLASS: Record<BadgeVariant, string> = {
  default: "bg-accent-primary",
  secondary: "bg-text-muted",
  outline: "bg-text-muted",
  neutral: "bg-tone-neutral",
  lime: "bg-tone-lime",
  warm: "bg-tone-warm",
  violet: "bg-tone-violet",
  rose: "bg-tone-rose",
};

export function Badge({
  className,
  variant = "default",
  withDot = false,
  children,
  ...props
}: Readonly<BadgeProps>) {
  return (
    <div
      className={cn(
        "focus:ring-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none",
        {
          "bg-accent-primary hover:bg-accent-hover border-transparent text-white":
            variant === "default",
          "bg-surface-secondary text-text-primary hover:bg-surface-raised border-transparent":
            variant === "secondary",
          "text-foreground": variant === "outline",
          "border-transparent bg-neutral-200 text-neutral-700 hover:bg-neutral-300":
            variant === "neutral",
          "border-transparent bg-lime-100 text-lime-700 hover:bg-lime-200":
            variant === "lime",
          "bg-warm-100 text-warm-700 hover:bg-warm-200 border-transparent":
            variant === "warm",
          "border-transparent bg-violet-100 text-violet-700 hover:bg-violet-200":
            variant === "violet",
          "border-transparent bg-rose-100 text-rose-700 hover:bg-rose-200":
            variant === "rose",
        },
        className,
      )}
      {...props}
    >
      {withDot && (
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            DOT_CLASS[variant],
          )}
        />
      )}
      {children}
    </div>
  );
}
