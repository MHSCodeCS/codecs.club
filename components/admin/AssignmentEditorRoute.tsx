"use client";

import { use } from "react";
import { AssignmentEditor } from "./AssignmentEditor";

export function AssignmentEditorRoute({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  return <AssignmentEditor assignmentId={assignmentId} />;
}
