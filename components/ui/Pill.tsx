import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PillTone =
  | "neutral"
  | "mint"
  | "brand"
  | "amber"
  | "amberSolid"
  | "violet"
  | "coral"
  | "ink";

const tones: Record<PillTone, string> = {
  neutral: "bg-sf2 text-ink2",
  mint: "bg-mint-s text-mint-i",
  brand: "bg-mint text-on-mint",
  amber: "bg-amb-s text-amb-i",
  amberSolid: "bg-amb text-on-amb",
  violet: "bg-vio-s text-vio-i",
  coral: "bg-cor-s text-cor-i",
  ink: "bg-ink text-bg tracking-[.05em]",
};

/**
 * Small label. `shape="tag"` is the squared type tag (Guided, Open-ended);
 * `shape="round"` is the rounded status pill.
 */
export function Pill({
  tone = "neutral",
  shape = "round",
  className,
  children,
}: {
  tone?: PillTone;
  shape?: "round" | "tag";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] flex-none items-center gap-1.5 self-start whitespace-nowrap px-2 text-xs font-bold",
        shape === "tag" ? "rounded-md" : "rounded-full",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Type tag for assignments; always text, never color alone. */
export function AssignmentTypeTag({ type }: { type: "guided" | "open" }) {
  return <Pill shape="tag">{type === "guided" ? "Guided" : "Open-ended"}</Pill>;
}
