import type { Metadata } from "next";
import { AssignmentEditor } from "@/components/admin/AssignmentEditor";

export const metadata: Metadata = { title: "Assignment · Curriculum" };

export default function AssignmentEditorPage() {
  return <AssignmentEditor />;
}
