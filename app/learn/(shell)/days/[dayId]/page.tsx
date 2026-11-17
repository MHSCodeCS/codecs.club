import type { Metadata } from "next";
import { Suspense } from "react";
import { LessonDayRoute } from "@/components/student/LessonDayRoute";
import { LoadingState } from "@/components/ui/States";

export const metadata: Metadata = { title: "Lesson" };

export default function DayPage({ params }: PageProps<"/learn/days/[dayId]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading the lesson…" />}>
      <LessonDayRoute params={params} />
    </Suspense>
  );
}
