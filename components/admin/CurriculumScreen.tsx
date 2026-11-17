"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, TextInput } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { COVER_ACCEPT, coverProblem } from "@/convex/lib/covers";
import { errorMessage } from "@/lib/errors";
import {
  adjacentYears,
  dateKey,
  formatNumericDate,
  formatTime,
  formatYear,
  timeKey,
  timeZoneLabel,
} from "@/lib/format";
import { slidesProvider } from "@/lib/slides";
import { useNow } from "@/lib/useNow";
import { AssignmentStatusPill } from "./AssignmentsScreen";
import { useGroup } from "./GroupContext";
import { NewAssignmentForm } from "./NewAssignmentForm";
import { YearTimeline } from "./YearTimeline";

type Overview = NonNullable<typeof api.adminCurriculum.overview._returnType>;
type OverviewDay = Overview["days"][number];

const selectClass =
  "h-10 rounded-[10px] border-[1.5px] border-bd bg-bg px-3 text-[15px] font-bold text-ink max-md:h-11 max-md:min-w-0";

/** 4g. Curriculum days and the year's lesson dates. */
export function CurriculumScreen() {
  const { group } = useGroup();
  const now = useNow();
  const [curriculumId, setCurriculumId] = useState<string | undefined>(undefined);
  const [year, setYear] = useState<string | undefined>(undefined);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const data = useQuery(api.adminCurriculum.overview, { group, curriculumId, year });

  if (data === undefined) return <LoadingState label="Loading curriculum…" />;

  const tz = data.timeZone;
  const unscheduled = data.days.filter((d) => d.schedule === null);
  const todayDay = data.days.find(
    (d) => d.schedule && dateKey(d.schedule.lessonAt, tz) === dateKey(now, tz),
  );
  const selected =
    data.days.find((d) => d._id === selectedDayId) ?? todayDay ?? data.days[0] ?? null;

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-3 px-4 pt-4 md:px-7">
        <h1 className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-.035em] md:text-[46px]">
          Curriculum
        </h1>
        {data.curricula.length > 0 && (
          <select
            aria-label="Curriculum"
            className={`${selectClass} mb-0.5 max-md:w-full`}
            value={data.curriculum?._id ?? ""}
            onChange={(event) => {
              setCurriculumId(event.target.value);
              setSelectedDayId(null);
            }}
          >
            {data.curricula.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <label htmlFor="schedule-year" className="mb-[11px] text-sm text-ink3 md:ml-auto">
          Schedule year
        </label>
        <select
          id="schedule-year"
          className={`${selectClass} mb-0.5 border-ink`}
          value={data.year}
          onChange={(event) => setYear(event.target.value)}
        >
          {adjacentYears(data.currentYear).map((y) => (
            <option key={y} value={y}>
              {formatYear(y)}
              {y === data.currentYear ? " (current)" : ""}
            </option>
          ))}
        </select>
        <span className="mb-[11px] text-[13px] text-ink3">{timeZoneLabel(tz)}</span>
      </div>
      <p className="mx-4 mt-2 mb-0 text-sm text-ink2 md:mx-7">
        Days, cover images, slide links and assignments are shared by every year. The dates below
        apply to {formatYear(data.year)} only.
      </p>

      {data.curriculum === null ? (
        <EmptyState title={`No ${group} curriculum yet`} className="mx-4 mt-4 md:mx-7" />
      ) : (
        <>
          <section
            aria-label={`${formatYear(data.year)} schedule`}
            className="mx-4 mt-3 grid overflow-hidden rounded-[22px] bg-sf md:mx-7 lg:grid-cols-[minmax(0,1fr)_270px]"
          >
            <div className="min-w-0">
              <YearTimeline
                days={data.days}
                now={now}
                timeZone={tz}
                selectedId={selected?._id ?? null}
                onSelect={setSelectedDayId}
              />
            </div>
            <div className="flex flex-col gap-2 bg-sf2 px-[18px] py-4">
              <b className="text-[13px] font-bold">Not scheduled</b>
              {unscheduled.length === 0 && (
                <span className="text-sm text-ink3">Every day has a date this year.</span>
              )}
              {unscheduled.map((day) => (
                <div
                  key={day._id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-bg py-1.5 pr-1.5 pl-3 text-sm"
                >
                  <span>
                    <b className="font-bold">D{day.order}</b> {day.topic}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-[30px] rounded-lg max-md:h-11"
                    onClick={() => {
                      setSelectedDayId(day._id);
                      requestAnimationFrame(() => document.getElementById("lesson-date")?.focus());
                    }}
                  >
                    Set date
                  </Button>
                </div>
              ))}
              <span className="text-xs text-ink3">
                Students see “Not scheduled” and can’t open the day until a date is set. A day opens
                on its lesson date.
              </span>
              <AddDayForm
                curriculumId={data.curriculum._id}
                onAdded={(dayId) => setSelectedDayId(dayId)}
              />
            </div>
          </section>

          {selected && (
            <label className="mx-4 mt-3.5 flex flex-col gap-1.5 md:hidden">
              <span className="text-sm font-bold">Day</span>
              <select
                className={`${selectClass} w-full`}
                value={selected._id}
                onChange={(event) => setSelectedDayId(event.target.value)}
              >
                {data.days.map((day) => (
                  <option key={day._id} value={day._id}>
                    Day {day.order}: {day.topic}
                    {day.schedule ? ` · ${formatNumericDate(day.schedule.lessonAt, tz)}` : " · not scheduled"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selected && (
            <div className="grid gap-3.5 px-4 pt-3.5 md:px-7 lg:grid-cols-[1.1fr_1.2fr_1fr]">
              <DayContentPanel
                key={`content-${selected._id}`}
                day={selected}
                isFirst={selected._id === data.days[0]?._id}
                isLast={selected._id === data.days.at(-1)?._id}
                onRemoved={() => setSelectedDayId(null)}
              />
              <DayAssignmentsPanel day={selected} />
              <DaySchedulePanel
                key={`schedule-${selected._id}-${data.year}-${selected.schedule?.lessonAt ?? "none"}`}
                day={selected}
                year={data.year}
                timeZone={tz}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}

function PanelLabel({ children, mint }: { children: React.ReactNode; mint?: boolean }) {
  return (
    <b className={`text-xs font-bold tracking-[.05em] ${mint ? "text-mint-i" : "text-ink3"}`}>
      {children}
    </b>
  );
}

function DayContentPanel({
  day,
  isFirst,
  isLast,
  onRemoved,
}: {
  day: OverviewDay;
  isFirst: boolean;
  isLast: boolean;
  onRemoved: () => void;
}) {
  const update = useMutation(api.adminCurriculum.updateDayContent);
  const [topic, setTopic] = useState(day.topic);
  const [slidesUrl, setSlidesUrl] = useState(day.slidesUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = topic !== day.topic || slidesUrl !== (day.slidesUrl ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await update({ dayId: day._id as Id<"days">, topic, slidesUrl });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={`Day ${day.order} content`} className="flex flex-col gap-3 rounded-[22px] bg-sf px-[18px] py-4">
      <PanelLabel>DAY {day.order} · CONTENT · ALL YEARS</PanelLabel>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="day-topic" className="text-sm font-bold">
          Topic
        </label>
        <TextInput id="day-topic" value={topic} onChange={(e) => { setTopic(e.target.value); setSaved(false); }} />
      </div>
      <CoverImage day={day} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="day-slides" className="text-sm font-bold">
          Slides link
        </label>
        <div className="flex items-center gap-2">
          <TextInput
            id="day-slides"
            mono
            type="url"
            placeholder="https://www.canva.com/design/…"
            value={slidesUrl}
            onChange={(e) => { setSlidesUrl(e.target.value); setSaved(false); }}
            className="min-w-0 flex-1 text-[13px]"
          />
          {slidesUrl && (
            <Pill tone="violet" className="h-[26px] px-2.5 text-[13px]">
              {slidesProvider(slidesUrl) === "a new tab" ? "Link" : slidesProvider(slidesUrl)}
            </Pill>
          )}
        </div>
        <span className="text-[12.5px] text-ink3">Paste a Canva or Figma Slides link.</span>
      </div>
      {error && <FieldError id="day-content-error">{error}</FieldError>}
      <div className="flex items-center gap-2.5">
        <Button variant="primary" size="lg" disabled={!dirty} loading={saving} loadingLabel="Saving…" onClick={() => void save()}>
          Save content
        </Button>
        {saved && !dirty && <span role="status" className="text-[13px] text-ink3">Saved</span>}
      </div>
      <DayActions day={day} isFirst={isFirst} isLast={isLast} onRemoved={onRemoved} />
    </section>
  );
}

/**
 * The day's cover: upload to Convex file storage, replace or remove. The
 * picker refuses a wrong type or size first; the server checks the stored
 * file again and deletes refused uploads and replaced covers.
 */
function CoverImage({ day }: { day: OverviewDay }) {
  const generateUploadUrl = useMutation(api.adminCurriculum.generateCoverUploadUrl);
  const setCover = useMutation(api.adminCurriculum.setCover);
  const removeCover = useMutation(api.adminCurriculum.removeCover);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const problem = coverProblem(file.type, file.size);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy("upload");
    try {
      const url = await generateUploadUrl();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const result = await setCover({ dayId: day._id as Id<"days">, storageId });
      if (!result.ok) setError(result.message);
    } catch (e) {
      setError(errorMessage(e, "The upload didn’t finish. Check your connection and try again."));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm(`Remove the cover image of Day ${day.order}?`)) return;
    setBusy("remove");
    setError(null);
    try {
      await removeCover({ dayId: day._id as Id<"days"> });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id="cover-label" className="text-sm font-bold">
        Cover image
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative h-[81px] w-36 flex-none overflow-hidden rounded-[10px] bg-bg">
          {day.coverUrl ? (
            // Convex storage URLs are signed and short-lived; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={day.coverUrl} alt={`Day ${day.order} cover`} className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-xs text-ink3">No cover</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[12.5px] text-ink3">
            Shown on the lesson page. 16:9 works best. PNG, JPEG, WebP or GIF, up to 5 MB.
          </span>
          <div className="flex flex-wrap gap-1.5 max-md:[&>button]:h-11">
            <input
              ref={input}
              type="file"
              accept={COVER_ACCEPT}
              aria-labelledby="cover-label"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              className="bg-bg"
              disabled={busy !== null}
              loading={busy === "upload"}
              loadingLabel="Uploading…"
              onClick={() => input.current?.click()}
            >
              {day.coverUrl ? "Replace" : "Upload image"}
            </Button>
            {day.coverUrl && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                loading={busy === "remove"}
                loadingLabel="Removing…"
                onClick={() => void remove()}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && <FieldError id="cover-error">{error}</FieldError>}
    </div>
  );
}

/** Move the day earlier or later, or remove it when it has no assignments. */
function DayActions({
  day,
  isFirst,
  isLast,
  onRemoved,
}: {
  day: OverviewDay;
  isFirst: boolean;
  isLast: boolean;
  onRemoved: () => void;
}) {
  const moveDay = useMutation(api.adminCurriculum.moveDay);
  const removeDay = useMutation(api.adminCurriculum.removeDay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = day.assignments.length === 0;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-ln pt-3">
      <div className="flex flex-wrap gap-1.5 max-md:[&>button]:h-11">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || isFirst}
          onClick={() => void run(() => moveDay({ dayId: day._id as Id<"days">, direction: "up" }))}
        >
          ← Earlier
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || isLast}
          onClick={() => void run(() => moveDay({ dayId: day._id as Id<"days">, direction: "down" }))}
        >
          Later →
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="hover:text-cor-i md:ml-auto"
          disabled={busy || !empty}
          title={empty ? undefined : "Only days without assignments can be removed."}
          onClick={() => {
            if (!window.confirm(`Remove Day ${day.order}: ${day.topic}? Later days move up one.`)) return;
            void run(async () => {
              await removeDay({ dayId: day._id as Id<"days"> });
              onRemoved();
            });
          }}
        >
          Remove day
        </Button>
      </div>
      <span className="text-xs text-ink3">
        Moving a day renumbers the days after it.{" "}
        {empty ? "This day has no assignments, so it can be removed." : "Days with assignments can’t be removed."}
      </span>
      {error && <FieldError id="day-actions-error">{error}</FieldError>}
    </div>
  );
}

/** Adds an unscheduled day at the end of the curriculum. */
function AddDayForm({
  curriculumId,
  onAdded,
}: {
  curriculumId: string;
  onAdded: (dayId: string) => void;
}) {
  const addDay = useMutation(api.adminCurriculum.addDay);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      aria-label="Add a day"
      className="mt-1 flex flex-col gap-1.5 border-t border-ln pt-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        addDay({ curriculumId: curriculumId as Id<"curricula">, topic })
          .then((dayId) => {
            setTopic("");
            onAdded(dayId);
          })
          .catch((err: unknown) => setError(errorMessage(err)))
          .finally(() => setBusy(false));
      }}
    >
      <label htmlFor="new-day-topic" className="text-[13px] font-bold">
        Add a day
      </label>
      <div className="flex gap-1.5">
        <TextInput
          id="new-day-topic"
          placeholder="Topic, e.g. Final project"
          value={topic}
          maxLength={80}
          onChange={(e) => setTopic(e.target.value)}
          className="h-9 min-w-0 flex-1 text-sm max-md:h-11"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="h-9 bg-bg max-md:h-11"
          disabled={topic.trim().length === 0}
          loading={busy}
          loadingLabel="Adding…"
        >
          Add
        </Button>
      </div>
      {error && <FieldError id="new-day-error">{error}</FieldError>}
    </form>
  );
}

function DayAssignmentsPanel({ day }: { day: OverviewDay }) {
  return (
    <section
      aria-label={`Day ${day.order} assignments`}
      // Phones show the assignments first: finding one is the usual reason to open this screen there.
      className="flex flex-col gap-1.5 rounded-[22px] bg-sf px-[18px] py-4 max-lg:order-first max-md:px-3.5"
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>DAY {day.order} · ASSIGNMENTS</PanelLabel>
      </div>
      {day.assignments.length === 0 && (
        <span className="text-sm text-ink3">No assignments on this day yet.</span>
      )}
      {day.assignments.map((a) => (
        <Link
          key={a._id}
          href={`/admin/assignments/${a._id}`}
          className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-xl bg-bg px-3 py-[9px] text-sm text-ink no-underline hover:bg-sf2 md:grid-cols-[minmax(0,1fr)_88px_auto]"
        >
          <b className="truncate font-bold">{a.title}</b>
          <span className="text-ink3 max-md:order-last max-md:col-span-2 max-md:text-[13px]">
            {a.type === "guided" ? "guided" : "open-ended"}
          </span>
          <AssignmentStatusPill assignment={a} />
        </Link>
      ))}
      <NewAssignmentForm key={day._id} dayId={day._id} dayLabel={`Day ${day.order}`} buttonClassName="self-start" />
      <span className="mt-1 text-xs text-ink3">Drafts stay hidden from students until published.</span>
    </section>
  );
}

function DaySchedulePanel({
  day,
  year,
  timeZone,
}: {
  day: OverviewDay;
  year: string;
  timeZone: string;
}) {
  const setSchedule = useMutation(api.adminCurriculum.setSchedule);
  const [date, setDate] = useState(day.schedule ? dateKey(day.schedule.lessonAt, timeZone) : "");
  const [time, setTime] = useState(day.schedule ? timeKey(day.schedule.lessonAt, timeZone) : "16:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty =
    !day.schedule ||
    date !== dateKey(day.schedule.lessonAt, timeZone) ||
    time !== timeKey(day.schedule.lessonAt, timeZone);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setSchedule({ dayId: day._id as Id<"days">, year, date, time });
      setSavedAt(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={`Day ${day.order} schedule`} className="flex flex-col gap-3 rounded-[22px] bg-mint-s px-[18px] py-4">
      <PanelLabel mint>
        DAY {day.order} · SCHEDULE · {formatYear(year)}
      </PanelLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lesson-date" className="text-sm font-bold">
            Lesson date
          </label>
          <TextInput id="lesson-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lesson-time" className="text-sm font-bold">
            Time
          </label>
          <TextInput id="lesson-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <p className="m-0 text-sm text-ink2">
        {day.schedule ? (
          <>
            Students see this date on Day {day.order}. Changing it moves only the lesson; turn-in
            never closes.
          </>
        ) : (
          <>Not scheduled for {formatYear(year)}. Students see “Not scheduled” until you save a date.</>
        )}
      </p>
      {error && <FieldError id="schedule-error">{error}</FieldError>}
      <div className="mt-auto flex items-center gap-2.5">
        <Button
          variant="primary"
          size="lg"
          disabled={!dirty || !date || !time}
          loading={saving}
          loadingLabel="Saving…"
          onClick={() => void save()}
        >
          Save schedule
        </Button>
        {savedAt && !dirty && (
          <span role="status" className="text-[13px] text-ink3">
            Saved {formatTime(savedAt, timeZone)}
          </span>
        )}
      </div>
    </section>
  );
}
