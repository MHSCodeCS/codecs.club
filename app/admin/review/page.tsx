import type { Metadata } from "next";
import { ReviewScreen } from "@/components/admin/ReviewScreen";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ assignmentId?: string; studentId?: string }> }) {
  const { assignmentId, studentId } = await searchParams;
  return <ReviewScreen assignmentId={assignmentId} studentId={studentId} />;
}
