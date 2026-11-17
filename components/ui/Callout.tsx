import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  amber: "bg-amb-s text-ink [&_[data-callout-icon]]:bg-amb [&_[data-callout-icon]]:text-on-amb",
  violet: "bg-vio-s text-ink [&_[data-callout-icon]]:bg-vio [&_[data-callout-icon]]:text-on-vio",
  mint: "bg-mint-s text-ink [&_[data-callout-icon]]:bg-mint [&_[data-callout-icon]]:text-on-mint",
  coral: "bg-cor-s text-ink [&_[data-callout-icon]]:bg-cor-i [&_[data-callout-icon]]:text-bg",
} as const;

export function Callout({
  tone,
  icon,
  title,
  children,
  action,
  className,
  role,
}: {
  tone: keyof typeof tones;
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn("flex items-start gap-3 rounded-[18px] p-4", tones[tone], className)}
    >
      {icon !== undefined && (
        <span
          data-callout-icon
          aria-hidden="true"
          className="grid size-7 flex-none place-items-center rounded-full text-sm font-extrabold"
        >
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <b className="font-bold">{title}</b>
        {children && <div className="text-sm text-ink2">{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
