import type { Metadata } from "next";
import { LearningHome } from "@/components/student/LearningHome";

export const metadata: Metadata = { title: "Learning home" };

export default function LearnPage() {
  return <LearningHome />;
}
