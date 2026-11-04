import { Suspense } from "react";
import { LoadingState } from "@/components/ui/States";
import type { Metadata } from "next";
import { AssistanceScreen } from "@/components/admin/AssistanceScreen";

export const metadata: Metadata = { title: "Classroom" };

export default function AssistancePage() {
  return <Suspense fallback={<LoadingState label="Loading classroom…" />}><AssistanceScreen /></Suspense>;
}
