"use client";

import { ErrorState } from "@/components/ui/States";
import { errorMessage } from "@/lib/errors";

export default function SectionError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="px-6 pt-6 lg:px-10">
      <ErrorState title="This page couldn’t load." onRetry={reset}>
        {errorMessage(error, "Check your connection, then try again.")}
      </ErrorState>
    </main>
  );
}
