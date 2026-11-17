"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div role="alert" className="m-6 rounded-2xl bg-cor-s p-5 text-cor-i">
        <b>Backend not configured.</b> Set <code>NEXT_PUBLIC_CONVEX_URL</code>{" "}
        (run <code>npx convex dev</code>) and reload.
      </div>
    );
  }
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
