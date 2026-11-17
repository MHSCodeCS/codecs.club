import type { Metadata } from "next";
import { CurriculumScreen } from "@/components/admin/CurriculumScreen";

export const metadata: Metadata = { title: "Curriculum" };

export default function CurriculumPage() {
  return <CurriculumScreen />;
}
