import type { Metadata } from "next";
import { ReviewScreen } from "@/components/admin/ReviewScreen";

export const metadata: Metadata = { title: "Review" };

export default function ReviewPage() {
  return <ReviewScreen />;
}
