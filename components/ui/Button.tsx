import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "dark"
  | "admin"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-mint text-on-mint hover:bg-mint2",
  secondary: "bg-sf2 text-ink hover:bg-ln",
  ghost: "bg-transparent text-ink2 hover:bg-sf2 hover:text-ink",
  dark: "bg-ink text-bg hover:bg-ink2",
  admin: "bg-vio text-on-vio hover:bg-vio-i",
  danger: "bg-cor-s text-cor-i hover:bg-cor-i hover:text-bg",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-[13px] rounded-[10px]",
  md: "h-9 px-3.5 text-sm rounded-[10px]",
  lg: "h-10 px-[18px] text-sm rounded-[10px]",
  xl: "h-[58px] px-10 text-lg rounded-[14px]",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex flex-none cursor-pointer items-center justify-center gap-2 whitespace-nowrap border-0 font-bold no-underline transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the in-progress label and disables the button. */
  loading?: boolean;
  loadingLabel?: ReactNode;
};

export function Button({
  variant,
  size,
  loading = false,
  loadingLabel,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
}

type ButtonLinkProps = {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  external?: boolean;
};

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
  external = false,
}: ButtonLinkProps) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses(variant, size, className)}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}
