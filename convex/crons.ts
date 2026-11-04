import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Lesson days open on their lesson date (D04); this moves the school's "today"
// forward shortly after midnight in the school time zone.
crons.interval("advance the school day", { minutes: 10 }, internal.schoolClock.advance, {});

export default crons;
