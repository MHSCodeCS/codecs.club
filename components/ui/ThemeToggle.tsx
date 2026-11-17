"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";
import { SegmentedControl } from "./SegmentedControl";

const listeners = new Set<() => void>();

function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function writeTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked; the choice still applies to this page view.
  }
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const options = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);
  return (
    <SegmentedControl
      label="Theme"
      size="sm"
      options={options}
      value={theme}
      onChange={writeTheme}
      className={className}
    />
  );
}
