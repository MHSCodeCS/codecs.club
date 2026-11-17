import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/ui/States";
import { WorkspaceRoute } from "@/components/workspace/WorkspaceRoute";

export const metadata: Metadata = { title: "Assignment" };

export default function AssignmentPage({ params }: PageProps<"/learn/assignments/[assignmentId]">) {
  return (
    <Suspense fallback={<LoadingState label="Opening your workspace…" />}>
      <WorkspaceRoute params={params} />
    </Suspense>
  );
}
