import type { Metadata } from "next";
import { StudentsScreen } from "@/components/admin/StudentsScreen";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage() {
  return <StudentsScreen />;
}
