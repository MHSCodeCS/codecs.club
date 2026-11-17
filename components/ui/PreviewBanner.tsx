import { cn } from "@/lib/cn";

/**
 * Marks a screen that still renders sample data from lib/fixtures.ts, so no one
 * mistakes it for live data. Remove it when the screen is wired to Convex.
 */
export function PreviewBanner({ phase, className }: { phase: string; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-center gap-2 rounded-xl bg-vio-s px-3.5 py-2 text-[13px] text-vio-i",
        className,
      )}
    >
      <b className="font-bold">Preview</b>
      <span>Sample data. This screen is connected in {phase}; nothing here is saved.</span>
    </div>
  );
}
