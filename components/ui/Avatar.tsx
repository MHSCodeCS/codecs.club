import { cn } from "@/lib/cn";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  tone = "mint",
  size = 34,
  className,
}: {
  name: string;
  tone?: "mint" | "violet" | "neutral";
  size?: number;
  className?: string;
}) {
  const toneClass =
    tone === "violet"
      ? "bg-vio text-on-vio"
      : tone === "neutral"
        ? "bg-sf2 text-ink2"
        : "bg-mint-s2 text-mint-i";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center rounded-full text-[13px] font-extrabold",
        toneClass,
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}
