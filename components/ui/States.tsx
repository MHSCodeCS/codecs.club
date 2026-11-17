import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-3 p-6 text-ink3", className)}
    >
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-ln border-t-mint-i"
      />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-[18px] bg-sf p-6 text-center", className)}>
      <b className="font-bold">{title}</b>
      {children && <div className="text-sm text-ink3">{children}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong.",
  children,
  onRetry,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-start gap-2 rounded-[18px] bg-cor-s p-5", className)}
    >
      <b className="font-bold text-cor-i">{title}</b>
      {children && <div className="text-sm text-ink2">{children}</div>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-9 cursor-pointer rounded-[10px] border-0 bg-bg px-3.5 text-sm font-bold text-ink"
        >
          Try again
        </button>
      )}
    </div>
  );
}
