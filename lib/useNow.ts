"use client";

import { useEffect, useState } from "react";

/**
 * Current time, refreshed every `intervalMs`, rounded down to the interval so
 * values passed to Convex queries stay stable between ticks.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / intervalMs) * intervalMs);
  useEffect(() => {
    const id = setInterval(
      () => setNow(Math.floor(Date.now() / intervalMs) * intervalMs),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
