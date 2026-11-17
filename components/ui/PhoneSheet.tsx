"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PHONE_QUERY, useMediaQuery } from "@/lib/useMediaQuery";

/**
 * A side panel that stays where it is from `md` (768px) up and becomes a
 * full-screen sheet on phones while `open`. From `md` up the wrapper is
 * `display: contents`, so its children stay items of the parent grid and the
 * desktop layout doesn't change. On phones it is hidden until opened; Back or
 * Escape closes it and focus returns to what opened it.
 */
export function PhoneSheet({
  open,
  onClose,
  title,
  backLabel = "Back",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the sheet for screen readers and in its top bar. */
  title: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const sheet = phone && open;
  const backRef = useRef<HTMLButtonElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!sheet) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [sheet]);

  return (
    <div
      role={sheet ? "dialog" : undefined}
      aria-modal={sheet || undefined}
      aria-label={sheet ? title : undefined}
      className={cn(
        "md:contents",
        open
          ? "max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:gap-3 max-md:overflow-y-auto max-md:bg-bg max-md:px-4 max-md:pb-8"
          : "max-md:hidden",
      )}
    >
      <div className="sticky top-0 z-10 -mx-4 flex min-h-14 flex-none items-center gap-2 border-b border-ln bg-bg px-2 md:hidden">
        <button
          ref={backRef}
          type="button"
          onClick={onClose}
          className="inline-flex h-11 flex-none cursor-pointer items-center gap-2 rounded-[10px] border-0 bg-transparent px-3 text-[15px] font-bold text-ink2 hover:bg-sf2 hover:text-ink"
        >
          <span aria-hidden="true">←</span> {backLabel}
        </button>
        <b className="min-w-0 truncate text-[15px] font-bold">{title}</b>
      </div>
      {children}
    </div>
  );
}
