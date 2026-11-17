"use client";

import { cn } from "@/lib/cn";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

/**
 * Single-choice segmented control (basic/advanced, Present/Late/Absent,
 * Guided/Open-ended). Rendered as a radio group for keyboard and screen readers.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className,
  disabled,
}: {
  label: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex gap-0.5 rounded-xl bg-sf2 p-[3px]", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-[9px] border-0 font-bold",
              size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-[30px] px-3.5 text-sm",
              selected
                ? "bg-pill text-ink shadow-[0_1px_2px_rgba(14,23,20,.14)]"
                : "bg-transparent text-ink2 hover:text-ink",
              "disabled:cursor-not-allowed disabled:opacity-55",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
