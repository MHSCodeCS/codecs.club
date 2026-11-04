"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, TextInput } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_TITLE_LENGTH } from "@/convex/lib/assignmentRules";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/**
 * "+ New assignment" for one day: a button that opens a title and type form,
 * creates a draft and opens it in the editor.
 */
export function NewAssignmentForm({
  dayId,
  dayLabel,
  className,
  buttonClassName,
}: {
  dayId: string;
  /** "Day 5", for the form's accessible name. */
  dayLabel: string;
  className?: string;
  buttonClassName?: string;
}) {
  const create = useMutation(api.adminAssignments.create);
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"guided" | "open">("guided");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="md"
        className={cn("justify-start max-md:h-11", buttonClassName)}
        onClick={() => setOpen(true)}
      >
        + New assignment
      </Button>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const assignmentId = await create({ dayId: dayId as Id<"days">, title, type });
      router.push(`/admin/assignments/${assignmentId}`);
    } catch (e) {
      setError(errorMessage(e, "Couldn’t create the assignment. Try again."));
      setBusy(false);
    }
  };

  return (
    <form
      aria-label={`New assignment on ${dayLabel}`}
      className={cn("flex flex-col gap-2 rounded-xl bg-bg p-2.5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={`${id}-title`} className="text-[13px] font-bold">
        Title
      </label>
      <TextInput
        id={`${id}-title`}
        autoFocus
        maxLength={MAX_TITLE_LENGTH}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Skip counter"
        className="max-md:h-11"
        aria-invalid={error !== null || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <SegmentedControl
        label="Type"
        className="self-start [&>button]:h-[30px] max-md:[&>button]:h-11"
        options={[
          { value: "guided", label: "Guided" },
          { value: "open", label: "Open-ended" },
        ]}
        value={type}
        onChange={setType}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      <div className="flex gap-2 max-md:[&>button]:h-11 max-md:[&>button]:flex-1">
        <Button
          type="submit"
          variant="primary"
          disabled={title.trim().length === 0}
          loading={busy}
          loadingLabel="Creating…"
        >
          Create draft
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
