"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FieldError, TextInput } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { formatYear } from "@/lib/format";
import type { Group } from "./GroupContext";

export type RosterStudent = {
  _id: Id<"students">;
  firstName: string;
  lastName: string;
  loginCode: string;
  group: Group;
  curriculumId: Id<"curricula">;
  sinceYear: string;
};

export type CurriculumOption = { _id: Id<"curricula">; name: string; group: Group };

/**
 * Edits one student's login code, group and curriculum. Identity and all past
 * work stay attached to the same student. Remount with a `key` per student.
 */
export function StudentDrawer({
  student,
  curricula,
  onClose,
}: {
  student: RosterStudent;
  curricula: CurriculumOption[];
  onClose: () => void;
}) {
  const updateStudent = useMutation(api.adminStudents.updateStudent);
  const [loginCode, setLoginCode] = useState(student.loginCode);
  const [group, setGroup] = useState<Group>(student.group);
  const [curriculumId, setCurriculumId] = useState<Id<"curricula">>(student.curriculumId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const name = `${student.firstName} ${student.lastName}`;
  const groupCurricula = curricula.filter((c) => c.group === group);
  const dirty =
    loginCode.trim() !== student.loginCode ||
    group !== student.group ||
    curriculumId !== student.curriculumId;
  const from = curricula.find((c) => c._id === student.curriculumId);
  const to = curricula.find((c) => c._id === curriculumId);
  const moving = group !== student.group || curriculumId !== student.curriculumId;

  function changeGroup(next: Group) {
    setGroup(next);
    setError(null);
    // Keep the current curriculum if it fits; otherwise pick the newest one in the group.
    if (curricula.find((c) => c._id === curriculumId)?.group !== next) {
      const options = curricula.filter((c) => c.group === next);
      const fallback = options[options.length - 1];
      if (fallback) setCurriculumId(fallback._id);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateStudent({
        studentId: student._id,
        loginCode: loginCode.trim(),
        group,
        curriculumId,
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      aria-label={`Edit ${name}`}
      className="flex flex-col gap-3.5 self-start rounded-[24px] bg-sf p-5 max-md:p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} size={40} className="text-[15px]" />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-2xl leading-[1.1] font-extrabold tracking-[-.03em]">{name}</h2>
          <div className="text-[12.5px] text-ink3">Student since {formatYear(student.sinceYear)}</div>
        </div>
        {dirty ? (
          <Pill tone="amber" className="h-6 px-2.5">
            ● Unsaved
          </Pill>
        ) : savedAt ? (
          <Pill tone="mint" className="h-6 px-2.5">
            ✓ Saved
          </Pill>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="student-login-code" className="text-sm font-bold">
          Login code
        </label>
        <div className="flex flex-wrap gap-2">
          <TextInput
            id="student-login-code"
            mono
            value={loginCode}
            onChange={(event) => setLoginCode(event.target.value)}
            className="h-11 min-w-0 flex-1 text-sm font-medium"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button
            variant="secondary"
            className="h-11 bg-bg px-[18px]"
            disabled
            title="Ticket printing arrives with roster tools (Phase 8)."
          >
            Reprint ticket
          </Button>
        </div>
        <span className="text-[12.5px] text-ink3">
          Must be unique across all students, past and present.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="student-group-label" className="text-sm font-bold">
          Group
        </span>
        <SegmentedControl
          label="Group"
          className="flex [&>button]:h-9 [&>button]:flex-1 max-md:[&>button]:h-11"
          options={[
            { value: "basic", label: "basic" },
            { value: "advanced", label: "advanced" },
          ]}
          value={group}
          onChange={changeGroup}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="student-curriculum" className="text-sm font-bold">
          Curriculum
        </label>
        <select
          id="student-curriculum"
          value={curriculumId}
          onChange={(event) => setCurriculumId(event.target.value as Id<"curricula">)}
          className="h-11 rounded-[10px] border-[1.5px] border-bd bg-bg px-3 text-[15px] text-ink"
        >
          {groupCurricula.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {moving && from && to && (
        <p className="m-0 rounded-[14px] bg-amb-s px-3.5 py-3 text-sm">
          Moves {student.firstName} from{" "}
          <b className="font-bold">
            {student.group} · {from.name}
          </b>{" "}
          to{" "}
          <b className="font-bold">
            {group} · {to.name}
          </b>
          . Their login code, saved work and submissions stay.
        </p>
      )}

      {error && <FieldError id="student-drawer-error">{error}</FieldError>}

      <div className="flex flex-wrap items-center gap-2 max-md:[&>button]:h-11">
        <Button
          variant="primary"
          className="h-[42px] px-[18px]"
          disabled={!dirty}
          loading={saving}
          loadingLabel="Saving…"
          onClick={() => void save()}
        >
          Save change
        </Button>
        <Button variant="secondary" className="h-[42px] bg-bg px-[18px]" onClick={onClose}>
          {dirty ? "Cancel" : "Close"}
        </Button>
        <Link href="/admin/history" className="ml-auto text-sm font-semibold">
          Change history
        </Link>
      </div>
    </aside>
  );
}
