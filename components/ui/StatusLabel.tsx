import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatusKind =
  | "done"
  | "partial"
  | "warning"
  | "error"
  | "idle"
  | "online"
  | "admin";

const symbols: Record<StatusKind, string> = {
  done: "✓",
  partial: "◐",
  warning: "!",
  error: "✕",
  idle: "○",
  online: "●",
  admin: "●",
};

const colors: Record<StatusKind, string> = {
  done: "text-mint-i",
  partial: "text-amb-i",
  warning: "text-amb-i",
  error: "text-cor-i",
  idle: "text-ink3",
  online: "text-mint-i",
  admin: "text-vio-i",
};

/**
 * Status text with a leading symbol. The symbol is decorative; the text always
 * carries the meaning so status never depends on color alone.
 */
export function StatusLabel({
  kind,
  children,
  className,
}: {
  kind: StatusKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] font-semibold",
        colors[kind],
        className,
      )}
    >
      <span aria-hidden="true">{symbols[kind]}</span>
      {children}
    </span>
  );
}
