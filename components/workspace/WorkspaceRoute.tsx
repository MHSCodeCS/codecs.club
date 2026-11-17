"use client";

import { use } from "react";
import { Workspace } from "./Workspace";

export function WorkspaceRoute({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  return <Workspace assignmentId={assignmentId} />;
}
