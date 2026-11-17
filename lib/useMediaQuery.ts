"use client";

import { useSyncExternalStore } from "react";

/** Phones: below Tailwind's `md` breakpoint (768px). Matches the `max-md:` variant. */
export const PHONE_QUERY = "(max-width: 767.98px)";

/** Whether a CSS media query matches. False during server rendering. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
