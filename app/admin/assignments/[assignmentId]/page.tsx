import type { Metadata } from "next";
import { Suspense } from "react";
import { AssignmentEditorRoute } from "@/components/admin/AssignmentEditorRoute";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = { title: "Assignment" };

export default function AssignmentEditorPage({
  params,
}: PageProps<"/admin/assignments/[assignmentId]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading the assignment…" />}>
      <AssignmentEditorRoute params={params} />
    </Suspense>
  );
}
