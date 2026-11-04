import { storedAvatarColorValidator } from "./lib/studentAvatars";
import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Class routing key; the original basic/advanced keys remain valid. */
export const groupValidator = v.string();
export const deskValidator = v.object({ seat: v.number(), x: v.number(), y: v.number(), rotation: v.number() });
export const assignmentTypeValidator = v.union(v.literal("guided"), v.literal("open"));
export const outcomeValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("none"),
);
export const partKindValidator = v.union(
  v.literal("begins"),
  v.literal("containsInOrder"),
  v.literal("ends"),
  v.literal("equals"),
);
export const attendanceStatusValidator = v.union(
  v.literal("present"),
  v.literal("late"),
  v.literal("absent"),
);
export const fileValidator = v.object({ name: v.string(), content: v.string() });
export const reviewDecisionValidator = v.union(v.literal("needsWork"), v.literal("complete"));
export const submissionStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("reviewed"),
  v.literal("superseded"),
);
export const checkRunOutcomeValidator = v.union(
  v.literal("ok"),
  v.literal("error"),
  v.literal("limit"),
  v.literal("timeout"),
);

export default defineSchema({
  ...authTables,

  /** Convex Auth users, extended with the app role. */
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("student"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  /**
   * Website admin accounts: the high school students who run the club.
   * Distinct from Convex developer access. Students see the first word of
   * `displayName` ("Max"), never a title.
   */
  admins: defineTable({
    userId: v.id("users"),
    username: v.string(),
    displayName: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarColor: v.optional(storedAvatarColorValidator),
  })
    .index("by_userId", ["userId"])
    .index("by_username", ["username"]),

  /**
   * Persistent student identity. Work references the student id, never the
   * login code or current group, so reassignment cannot relabel history.
   */
  students: defineTable({
    userId: v.id("users"),
    firstName: v.string(),
    lastName: v.string(),
    loginCode: v.string(),
    group: groupValidator,
    curriculumId: v.id("curricula"),
    sinceYear: v.string(),
    avatarColor: v.optional(storedAvatarColorValidator),
    /** Deprecated: no assigned seating. Retained for stored documents. */
    seatIndex: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_loginCode", ["loginCode"])
    .index("by_firstName_and_lastName", ["firstName", "lastName"])
    .index("by_userId", ["userId"])
    .index("by_group_and_lastName", ["group", "lastName"])
    .index("by_group_and_deletedAt_and_lastName", ["group", "deletedAt", "lastName"])
    .index("by_group_and_seatIndex", ["group", "seatIndex"])
    .index("by_curriculumId", ["curriculumId"])
    .searchIndex("search_firstName", { searchField: "firstName" })
    .searchIndex("search_lastName", { searchField: "lastName" }),

  /** Retry receipt: one atomic roster import, scoped to its acting admin. */
  classroomLayouts: defineTable({
    group: groupValidator,
    revision: v.number(),
    desks: v.array(deskValidator),
  }).index("by_group", ["group"]),

  rosterImports: defineTable({
    actorId: v.id("users"),
    key: v.string(),
    payload: v.string(),
    studentIds: v.array(v.id("students")),
  }).index("by_actorId_and_key", ["actorId", "key"]),

  classes: defineTable({ name: v.string(), year: v.string(), group: v.string(), deletedAt: v.optional(v.number()), status: v.union(v.literal("current"), v.literal("upcoming"), v.literal("archived")) }).index("by_group", ["group"]).index("by_deletedAt", ["deletedAt"]),
  enrollments: defineTable({ studentId: v.id("students"), group: v.string(), year: v.string(), curriculumId: v.id("curricula") }).index("by_group", ["group"]).index("by_studentId", ["studentId"]).index("by_studentId_and_group", ["studentId", "group"]),

  curricula: defineTable({
    name: v.string(),
    group: groupValidator,
  }).index("by_group", ["group"]),

  /** An ordered topic unit. Content is shared by every year. */
  days: defineTable({
    curriculumId: v.id("curricula"),
    importedFromDayId: v.optional(v.id("days")),
    order: v.number(),
    topic: v.string(),
    coverImageId: v.optional(v.id("_storage")),
    slidesUrl: v.optional(v.string()),
  }).index("by_curriculumId_and_order", ["curriculumId", "order"]).index("by_curriculumId_and_importedFromDayId", ["curriculumId", "importedFromDayId"]),

  /** Year-specific lesson date. Turn-in never closes, so this is only the lesson. */
  lessonSchedules: defineTable({
    dayId: v.id("days"),
    year: v.string(),
    lessonAt: v.number(),
    endsAt: v.optional(v.number()),
    /** Deprecated: turn-in never closes. */
    turnInClosesAt: v.optional(v.number()),
  })
    .index("by_dayId_and_year", ["dayId", "year"])
    .index("by_year_and_lessonAt", ["year", "lessonAt"]),

  /** Single document holding admin-editable behavior. */
  settings: defineTable({
    currentYear: v.string(),
    /** Deprecated, unused: the old turn-in window length. Kept so stored documents validate. */
    turnInDays: v.optional(v.number()),
    /** Deprecated, unused: the old turn-in close time. Kept so stored documents validate. */
    closeTime: v.optional(v.string()),
    timeZone: v.string(),
  }),

  assignments: defineTable({
    dayId: v.id("days"),
    order: v.number(),
    type: assignmentTypeValidator,
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    /** Latest edited revision (may be an unpublished draft). */
    currentRevisionId: v.optional(v.id("assignmentRevisions")),
    /** Revision students see; unset until first publish. */
    publishedRevisionId: v.optional(v.id("assignmentRevisions")),
  }).index("by_dayId_and_order", ["dayId", "order"]),

  /** Immutable-once-published task content and evaluation rule. */
  assignmentRevisions: defineTable({
    assignmentId: v.id("assignments"),
    title: v.optional(v.string()),
    type: v.optional(assignmentTypeValidator),
    summary: v.string(),
    instructions: v.string(),
    expectedOutput: v.optional(v.string()),
    starterFiles: v.array(fileValidator),
    parts: v.array(
      v.object({ name: v.string(), kind: partKindValidator, expected: v.string() }),
    ),
    /** Parts needed for partial completion; completion always needs all. */
    partialMin: v.number(),
    loopCheck: v.boolean(),
    /** Lines fed to input() during checks, one per call; empty lines after that. */
    checkInput: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_assignmentId", ["assignmentId"]),

  /** A student's working copy for one assignment, with historical context. */
  workspaces: defineTable({
    studentId: v.id("students"),
    assignmentId: v.id("assignments"),
    year: v.string(),
    group: groupValidator,
    curriculumId: v.id("curricula"),
    latestVersion: v.number(),
    updatedAt: v.number(),
    /** micropip packages this workspace installs before running (e.g. "emoji==2.12.1"). */
    packages: v.optional(v.array(v.string())),
  })
    .index("by_studentId_and_assignmentId", ["studentId", "assignmentId"])
    .index("by_studentId_and_updatedAt", ["studentId", "updatedAt"])
    .index("by_assignmentId", ["assignmentId"]),

  /** The live working copy, one row per file. */
  workFiles: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    content: v.string(),
    updatedAt: v.number(),
    updatedBy: v.id("users"),
    /**
     * Bumped on every write. Editors send the revision their text is based on,
     * so a save over someone else's change can keep that change in history.
     * Unset on rows written before Phase 3; read as 0.
     */
    revision: v.optional(v.number()),
    sharedState: v.optional(v.bytes()),
  }).index("by_workspaceId_and_name", ["workspaceId", "name"]),

  /** Immutable whole-workspace snapshots; restoring adds a version. */
  workVersions: defineTable({
    workspaceId: v.id("workspaces"),
    number: v.number(),
    files: v.array(fileValidator),
    createdBy: v.id("users"),
    createdAt: v.number(),
    reason: v.union(
      v.literal("start"),
      v.literal("autosave"),
      v.literal("restore"),
      // Legacy stored literal for an edit made by an admin; renaming it needs a data migration.
      v.literal("teacher"),
      v.literal("submit"),
      v.literal("check"),
    ),
    /** For reason "restore": the version number that was restored. */
    restoredFrom: v.optional(v.number()),
  }).index("by_workspaceId_and_number", ["workspaceId", "number"]),

  /** Guided check outcome for one code version under one revision's rules. */
  checkResults: defineTable({
    workspaceId: v.id("workspaces"),
    versionId: v.id("workVersions"),
    revisionId: v.id("assignmentRevisions"),
    outcome: outcomeValidator,
    parts: v.array(
      v.object({ name: v.string(), met: v.boolean(), detail: v.optional(v.string()) }),
    ),
    ranBy: v.id("users"),
    ranAt: v.number(),
    /** How the check run ended: finished, error, stopped at the loop limit, or out of time. */
    runOutcome: v.optional(checkRunOutcomeValidator),
    /** The printed output that was checked (start only, if long). */
    output: v.optional(v.string()),
    outputTruncated: v.optional(v.boolean()),
  })
    .index("by_workspaceId_and_ranAt", ["workspaceId", "ranAt"])
    .index("by_versionId", ["versionId"]),

  /** A preserved turned-in snapshot. Later edits never mutate it. */
  submissions: defineTable({
    workspaceId: v.id("workspaces"),
    studentId: v.id("students"),
    assignmentId: v.id("assignments"),
    attempt: v.number(),
    versionId: v.id("workVersions"),
    submittedAt: v.number(),
    checkResultId: v.optional(v.id("checkResults")),
    /**
     * "superseded": a later attempt was turned in before this one was
     * reviewed (D09). It stays visible but leaves the review queue.
     */
    status: submissionStatusValidator,
    reviewDecision: v.optional(reviewDecisionValidator),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    /** Client-generated key so a retried turn-in cannot create two attempts. */
    idempotencyKey: v.string(),
  })
    .index("by_workspaceId_and_attempt", ["workspaceId", "attempt"])
    .index("by_studentId_and_submittedAt", ["studentId", "submittedAt"])
    .index("by_assignmentId_and_status", ["assignmentId", "status"])
    .index("by_status_and_submittedAt", ["status", "submittedAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  /** Admin writing on a submission: student-visible feedback or a private note. */
  feedback: defineTable({
    submissionId: v.id("submissions"),
    studentId: v.id("students"),
    authorId: v.id("users"),
    body: v.string(),
    visibility: v.union(v.literal("student"), v.literal("private")),
    createdAt: v.number(),
  })
    .index("by_submissionId", ["submissionId"])
    .index("by_studentId_and_visibility_and_createdAt", [
      "studentId",
      "visibility",
      "createdAt",
    ]),

  helpRequests: defineTable({
    studentId: v.id("students"),
    workspaceId: v.id("workspaces"),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_workspaceId_and_status", ["workspaceId", "status"])
    .index("by_studentId_and_status", ["studentId", "status"]),

  assistSessions: defineTable({
    workspaceId: v.id("workspaces"),
    adminId: v.id("users"),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  }).index("by_workspaceId_and_joinedAt", ["workspaceId", "joinedAt"])
    .index("by_workspaceId_and_adminId_and_leftAt", ["workspaceId", "adminId", "leftAt"]),

  assistEvents: defineTable({
    workspaceId: v.id("workspaces"),
    actorId: v.id("users"),
    name: v.string(),
    kind: v.union(v.literal("joined"), v.literal("left")),
    at: v.number(),
  }).index("by_workspaceId_and_at", ["workspaceId", "at"]),

  workspacePresence: defineTable({ workspaceId: v.id("workspaces"), token: v.string() })
    .index("by_workspaceId", ["workspaceId"]),

  remoteRuns: defineTable({
    workspaceId: v.id("workspaces"),
    versionId: v.id("workVersions"),
    actorId: v.id("users"),
    actorName: v.string(),
    key: v.string(),
    entry: v.string(),
    packages: v.array(v.string()),
    status: v.union(v.literal("running"), v.literal("finished"), v.literal("error"), v.literal("stopped"), v.literal("interrupted")),
    output: v.string(),
    outputTruncated: v.boolean(),
    stopRequested: v.boolean(),
    startedAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_workspaceId_and_startedAt", ["workspaceId", "startedAt"])
    .index("by_actorId_and_key", ["actorId", "key"]),

  guidanceNotes: defineTable({
    workspaceId: v.id("workspaces"),
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"]),

  attendance: defineTable({
    studentId: v.id("students"),
    scheduleId: v.id("lessonSchedules"),
    status: attendanceStatusValidator,
    markedBy: v.id("users"),
    markedAt: v.number(),
  })
    .index("by_scheduleId_and_studentId", ["scheduleId", "studentId"])
    .index("by_studentId", ["studentId"]),

  /** Who changed managed data, when, and what changed. Never holds secrets. */
  adminChanges: defineTable({
    actorId: v.id("users"),
    actorName: v.optional(v.string()),
    at: v.number(),
    table: v.string(),
    recordId: v.string(),
    summary: v.string(),
    /** JSON-encoded relevant previous/new values. */
    before: v.optional(v.string()),
    after: v.optional(v.string()),
  })
    .index("by_at", ["at"])
    .index("by_recordId_and_at", ["recordId", "at"]),
});
