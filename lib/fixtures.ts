/**
 * Sample data for screens not yet wired to Convex. Shapes mirror what the
 * matching queries will return, so wiring a screen means swapping the source,
 * not rewriting the UI. Values follow the CodeCS design and convex/seed.ts.
 */

const pt = (iso: string) => new Date(iso).getTime();
export const FIXTURE_TIME_ZONE = "America/Los_Angeles";

/* ---------- 4e Student Work History ---------- */

export type WorkStatus =
  | { kind: "inProgress"; savedAt: number }
  | { kind: "notTurnedIn" }
  | { kind: "turnedIn" }
  | { kind: "reviewed"; reviewedAt: number; hasNote: boolean };

export type WorkItem = {
  id: string;
  title: string;
  context: string;
  status: WorkStatus;
  assignmentId: string | null;
  detail?: {
    heading: string;
    attempts: Array<{
      attempt: number;
      submittedAt: number;
      version: number;
      check: "completion" | "partial completion" | "no completion" | null;
      review?: { by: string; at: number; note?: string };
    }>;
  };
};

export type WorkGroup = {
  year: string;
  label: string;
  current: boolean;
  items: WorkItem[];
};

export const myWorkFixture: WorkGroup[] = [
  {
    year: "2026-27",
    label: "2026–27 · basic · Python Fundamentals",
    current: true,
    items: [
      {
        id: "countdown",
        title: "Countdown",
        context: "Day 5 · Loops · guided",
        status: { kind: "inProgress", savedAt: pt("2026-10-15T23:00:00Z") },
        assignmentId: null,
      },
      {
        id: "madlibs",
        title: "Mad libs",
        context: "Day 3 · Input and strings · guided",
        status: { kind: "notTurnedIn" },
        assignmentId: null,
      },
      {
        id: "temperature",
        title: "Temperature check",
        context: "Day 4 · Conditionals · guided",
        status: { kind: "turnedIn" },
        assignmentId: null,
      },
      {
        id: "nametag",
        title: "Name tag",
        context: "Day 2 · Variables · guided",
        status: { kind: "reviewed", reviewedAt: pt("2026-09-28T16:00:00Z"), hasNote: true },
        assignmentId: null,
        detail: {
          heading: "Day 2 · Variables · Python Fundamentals 2026–27",
          attempts: [
            {
              attempt: 1,
              submittedAt: pt("2026-09-25T22:40:00Z"),
              version: 7,
              check: "completion",
              review: {
                by: "Max",
                at: pt("2026-09-28T16:00:00Z"),
                note: "Nice work! Try adding your favorite color too.",
              },
            },
          ],
        },
      },
      {
        id: "hello",
        title: "Hello, world",
        context: "Day 1 · Hello, Python · guided",
        status: { kind: "reviewed", reviewedAt: pt("2026-09-21T16:00:00Z"), hasNote: false },
        assignmentId: null,
      },
    ],
  },
  {
    year: "2025-26",
    label: "2025–26 · basic · Intro to Python",
    current: false,
    items: [
      {
        id: "guessing",
        title: "Guessing game",
        context: "Final project · open-ended",
        status: { kind: "reviewed", reviewedAt: pt("2026-05-22T16:00:00Z"), hasNote: false },
        assignmentId: null,
      },
    ],
  },
];

/* ---------- 4i Admin Assistance ---------- */

export type Presence = "online" | "idle" | "offline";

export type LiveStudent = {
  loginCode: string;
  name: string;
  presence: Presence;
  task: string;
  activity: string;
  /** Minutes waiting for help, if a help request is open. */
  helpWaitMin?: number;
};

export const assistanceLessonFixture = { label: "Day 5: Loops", context: "basic · Day 5 · Loops" };

export const assistanceCodeFixture: Record<string, { code: string; cursorLine: number; output: string }> = {
  Countdown: {
    code: '# Countdown to liftoff\ncount = 10\n\nwhile count > 0:\n    print(count)\n    count = count - 2\n\nprint("Liftoff!")\n',
    cursorLine: 8,
    output: "10\n8\n6\n4\n2\nLiftoff!",
  },
  "Forever greeter": {
    code: 'name = input("Name? ")\nwhile True:\n    print("Hello,", nam)\n',
    cursorLine: 3,
    output: "NameError: name 'nam' is not defined (line 3)",
  },
  "Loop art": {
    code: 'for row in range(5):\n    print("*" * (row + 1))\n',
    cursorLine: 2,
    output: "*\n**\n***\n****\n*****",
  },
};

/** Students in today's lesson. There is no assigned seating; the screen sorts by name. */
export const classFixture: LiveStudent[] = [
  { loginCode: "achen", name: "Ava Chen", presence: "online", task: "Countdown", activity: "ran · no errors" },
  { loginCode: "jsmith", name: "Jordan Smith", presence: "online", task: "Countdown", activity: "editing", helpWaitMin: 3 },
  { loginCode: "jsmith1", name: "Jamie Smith", presence: "online", task: "Forever greeter", activity: "running…" },
  { loginCode: "anguyen", name: "Alex Nguyen", presence: "online", task: "Forever greeter", activity: "error · line 3", helpWaitMin: 1 },
  { loginCode: "ppatel", name: "Priya Patel", presence: "idle", task: "Countdown", activity: "last edit 4 min ago" },
  { loginCode: "mjohnson", name: "Marcus Johnson", presence: "offline", task: "Countdown", activity: "not signed in today" },
  { loginCode: "sgarcia", name: "Sofia Garcia", presence: "online", task: "Loop art", activity: "editing" },
  { loginCode: "lobrien", name: "Liam O’Brien", presence: "offline", task: "Loop art", activity: "signed out 4:20 pm" },
  { loginCode: "nkim", name: "Noah Kim", presence: "online", task: "Countdown", activity: "ran · no errors" },
  { loginCode: "edavis", name: "Emma Davis", presence: "online", task: "Forever greeter", activity: "editing" },
  { loginCode: "mrossi", name: "Mateo Rossi", presence: "online", task: "Countdown", activity: "running…" },
  { loginCode: "zwilliams", name: "Zoe Williams", presence: "online", task: "Loop art", activity: "editing" },
  { loginCode: "ebrooks", name: "Ethan Brooks", presence: "idle", task: "Countdown", activity: "last edit 2 min ago" },
  { loginCode: "msingh", name: "Maya Singh", presence: "online", task: "Countdown", activity: "ran · no errors" },
  { loginCode: "lmartin", name: "Lucas Martin", presence: "online", task: "Forever greeter", activity: "error · line 5" },
  { loginCode: "cpark", name: "Chloe Park", presence: "online", task: "Loop art", activity: "editing" },
  { loginCode: "oclark", name: "Owen Clark", presence: "online", task: "Countdown", activity: "editing" },
  { loginCode: "imoore", name: "Isla Moore", presence: "online", task: "Countdown", activity: "ran · no errors" },
  { loginCode: "bcarter", name: "Ben Carter", presence: "online", task: "Forever greeter", activity: "running…" },
  { loginCode: "glee", name: "Grace Lee", presence: "offline", task: "Forever greeter", activity: "not signed in today" },
  { loginCode: "lramirez", name: "Leo Ramirez", presence: "online", task: "Loop art", activity: "editing" },
  { loginCode: "nhughes", name: "Nora Hughes", presence: "idle", task: "Countdown", activity: "last edit 6 min ago" },
];
