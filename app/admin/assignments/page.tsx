import type { Metadata } from "next";
import { AssignmentsScreen } from "@/components/admin/AssignmentsScreen";

export const metadata: Metadata = { title: "Assignments" };

export default function AssignmentsPage() {
  return <AssignmentsScreen />;
}
