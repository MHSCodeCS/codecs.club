import { isSameDay } from "./format";

/** Shapes returned by student.home / student.day. */
export type AssignmentProgress = {
  _id: string;
  title: string;
  type: "guided" | "open";
  summary: string;
  started: boolean;
  savedAt: number | null;
  turnedIn: boolean;
  reviewed?: boolean;
  reviewDecision?: "complete" | "needsWork" | null;
  latestOutcome: "complete" | "partial" | "none" | null;
};

export type TrackDay = {
  _id: string;
  order: number;
  topic: string;
  lessonAt: number | null;
  assignments: AssignmentProgress[];
};

export type DayState =
  | { kind: "unscheduled" }
  | { kind: "upcoming" }
  | { kind: "today" }
  | { kind: "done"; turnedIn: number; total: number }
  | { kind: "open"; turnedIn: number; total: number };

export function dayState(day: TrackDay, now: number, timeZone: string): DayState {
  if (day.lessonAt === null) return { kind: "unscheduled" };
  if (isSameDay(day.lessonAt, now, timeZone)) return { kind: "today" };
  if (day.lessonAt > now) return { kind: "upcoming" };
  const total = day.assignments.length;
  const turnedIn = day.assignments.filter((a) => a.turnedIn).length;
  if (total > 0 && turnedIn === total) return { kind: "done", turnedIn, total };
  // Turn-in never closes, so a past day stays open until everything is in.
  return { kind: "open", turnedIn, total };
}

/** Today's day, else the most recent past day, else the first day. */
export function focusDay(days: TrackDay[], now: number, timeZone: string): TrackDay | null {
  const today = days.find((d) => d.lessonAt !== null && isSameDay(d.lessonAt, now, timeZone));
  if (today) return today;
  const past = days
    .filter((d) => d.lessonAt !== null && d.lessonAt <= now)
    .sort((a, b) => b.lessonAt! - a.lessonAt!);
  return past[0] ?? days[0] ?? null;
}

/** Assignment-level status text and tone. */
export function assignmentStatus(a: AssignmentProgress): {
  label: string;
  tone: "progress" | "turnedIn" | "notStarted";
} {
  if (a.turnedIn) return { label: "Turned in", tone: "turnedIn" };
  if (a.started) return { label: "In progress", tone: "progress" };
  return { label: "Not started", tone: "notStarted" };
}

/** Teacher decisions determine completion; everything pending stays yellow. */
export function assignmentColor(a: AssignmentProgress): "mint" | "amb" | "cor" {
  if (a.reviewed && a.reviewDecision === "needsWork") return "cor";
  if (a.reviewed && a.reviewDecision === "complete") return "mint";
  return "amb";
}

export function assignmentFill(assignments: AssignmentProgress[], soft = false): string | undefined {
  if (!assignments.length) return undefined;
  const stops = assignments.flatMap((a, i) => {
    const tone = assignmentColor(a);
    const color = `var(--${tone}${soft ? "-s" : tone === "cor" ? "-i" : ""})`;
    return [`${color} ${i * 100 / assignments.length}%`, `${color} ${(i + 1) * 100 / assignments.length}%`];
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
