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
  latestOutcome: "complete" | "partial" | "none" | null;
};

export type TrackDay = {
  _id: string;
  order: number;
  topic: string;
  lessonAt: number | null;
  /** The server decides (D04): open from the lesson date, or with earlier work on the day. */
  open: boolean;
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

/**
 * Today's day, else the most recent past day, else the first open day. Days
 * that aren't open yet (D04) are never the focus; null when none is open.
 */
export function focusDay(days: TrackDay[], now: number, timeZone: string): TrackDay | null {
  const open = days.filter((d) => d.open);
  const today = open.find((d) => d.lessonAt !== null && isSameDay(d.lessonAt, now, timeZone));
  if (today) return today;
  const past = open
    .filter((d) => d.lessonAt !== null && d.lessonAt <= now)
    .sort((a, b) => b.lessonAt! - a.lessonAt!);
  return past[0] ?? open[0] ?? null;
}

/** The next day that isn't open yet, by lesson date (for "Day 1 opens Thu Sep 17"). */
export function nextOpening(days: TrackDay[]): TrackDay | null {
  return (
    days
      .filter((d) => !d.open && d.lessonAt !== null)
      .sort((a, b) => a.lessonAt! - b.lessonAt!)[0] ?? null
  );
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
