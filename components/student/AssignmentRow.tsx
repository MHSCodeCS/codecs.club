import { ButtonLink } from "@/components/ui/Button";
import { AssignmentTypeTag, Pill } from "@/components/ui/Pill";
import { assignmentStatus, type AssignmentProgress } from "@/lib/progress";

/** One assignment with type tag, status and the consistent open/resume action. */
export function AssignmentRow({ assignment }: { assignment: AssignmentProgress }) {
  const status = assignmentStatus(assignment);
  const href = `/learn/assignments/${assignment._id}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_104px] [&>span]:self-center items-center gap-3.5 rounded-[14px] bg-bg py-2.5 pr-2.5 pl-4">
      <div className="flex min-w-0 items-center gap-2.5 [&>span]:self-center">
        <b className="truncate text-base font-bold">{assignment.title}</b>
        <AssignmentTypeTag type={assignment.type} />
      </div>
      {assignment.reviewed && assignment.reviewDecision === "needsWork" ? (
        <Pill tone="coral" className="h-[26px] px-2.5 text-[13px] font-semibold">Incomplete</Pill>
      ) : status.tone === "progress" ? (
        <Pill tone="amber" className="h-[26px] px-2.5 text-[13px] font-semibold">
          <span aria-hidden="true">◐</span> In progress
        </Pill>
      ) : status.tone === "turnedIn" ? (
        <Pill tone="mint" className="h-[26px] px-2.5 text-[13px] font-semibold">
          <span aria-hidden="true">✓</span> Turned in
        </Pill>
      ) : (
        <span className="text-sm text-ink3">Not started</span>
      )}
      <ButtonLink
        href={href}
        variant={status.tone === "progress" ? "primary" : "secondary"}
        size="lg"
        className="h-[38px] w-full"
      >
        {status.tone === "progress" ? "Resume" : "Open"}
      </ButtonLink>
    </div>
  );
}
