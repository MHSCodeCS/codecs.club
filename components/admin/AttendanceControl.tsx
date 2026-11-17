"use client";

import { cn } from "@/lib/cn";

export type AttendanceStatus = "present" | "late" | "absent";

const options: Array<{ value: AttendanceStatus; label: string; selected: string }> = [
  { value: "present", label: "Present", selected: "bg-mint text-on-mint" },
  { value: "late", label: "Late", selected: "bg-amb text-on-amb" },
  { value: "absent", label: "Absent", selected: "bg-cor-s text-cor-i" },
];

/** Present / Late / Absent for one student and lesson. */
export function AttendanceControl({
  studentName,
  value,
  onChange,
  disabled,
  highlightUnmarked,
}: {
  studentName: string;
  value: AttendanceStatus | null;
  onChange: (value: AttendanceStatus) => void;
  disabled?: boolean;
  highlightUnmarked?: boolean;
}) {
  return (
    <span
      role="radiogroup"
      aria-label={`Attendance for ${studentName}`}
      className={cn(
        "inline-flex gap-0.5 rounded-full bg-sf p-[3px]",
        highlightUnmarked && value === null && "shadow-[inset_0_0_0_1.5px_var(--amb)]",
      )}
    >
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-[26px] cursor-pointer items-center rounded-full border-0 px-[11px] text-[13px] max-md:h-10 max-md:px-3.5 max-md:text-sm",
              checked ? cn("font-bold", option.selected) : "bg-transparent font-semibold text-ink2 hover:text-ink",
              "disabled:cursor-not-allowed",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </span>
  );
}
