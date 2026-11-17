"use client";

import { use } from "react";
import { LessonDay } from "./LessonDay";

export function LessonDayRoute({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = use(params);
  return <LessonDay dayId={dayId} />;
}
