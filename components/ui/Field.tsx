import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Label({
  htmlFor,
  children,
  className,
}: {
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("text-sm font-bold", className)}>
      {children}
    </label>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-center gap-2.5 font-semibold text-cor-i"
    >
      <span
        aria-hidden="true"
        className="grid size-[22px] flex-none place-items-center rounded-full bg-cor-i text-[13px] font-extrabold text-bg"
      >
        !
      </span>
      {children}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  mono?: boolean;
};

export function TextInput({ invalid, mono, className, ...rest }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-[10px] border-[1.5px] border-bd bg-bg px-3.5 text-[15px] text-ink outline-none",
        "focus-visible:border-vio",
        invalid && "border-2 border-cor-i shadow-[0_0_0_4px_var(--cor-s)]",
        mono && "font-mono",
        className,
      )}
      {...rest}
    />
  );
}

/** Label + control + optional hint/error, stacked. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : hint ? (
        <span className="text-[13px] text-ink3">{hint}</span>
      ) : null}
    </div>
  );
}
