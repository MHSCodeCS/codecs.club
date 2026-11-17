"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
};

/** Controlled tab list; the caller renders the active panel. */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  idPrefix,
  className,
}: {
  label: string;
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  idPrefix: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1", className)}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              const index = items.findIndex((i) => i.value === value);
              const next =
                items[
                  (index + (event.key === "ArrowRight" ? 1 : items.length - 1)) %
                    items.length
                ]!;
              onChange(next.value);
              document.getElementById(`${idPrefix}-tab-${next.value}`)?.focus();
            }}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border-0 px-3 text-sm font-bold",
              selected ? "bg-mint-s text-mint-i" : "bg-transparent text-ink2 hover:bg-sf2",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  value,
  children,
  className,
}: {
  idPrefix: string;
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      className={className}
    >
      {children}
    </div>
  );
}
