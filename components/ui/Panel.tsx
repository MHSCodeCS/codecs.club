import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Rounded surface. `tone` picks the background from the design's surfaces. */
export function Panel({
  tone = "surface",
  className,
  children,
  as: Tag = "div",
  ...rest
}: {
  tone?: "surface" | "surface2" | "mint" | "plain" | "card";
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "aside" | "article";
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const toneClass = {
    surface: "bg-sf",
    surface2: "bg-sf2",
    mint: "bg-mint-s",
    plain: "bg-bg",
    card: "bg-bg shadow-card",
  }[tone];
  return (
    <Tag className={cn("rounded-[18px]", toneClass, className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Small uppercase section label used throughout the admin screens. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-xs font-extrabold tracking-[.08em] text-ink3 uppercase", className)}>
      {children}
    </div>
  );
}
