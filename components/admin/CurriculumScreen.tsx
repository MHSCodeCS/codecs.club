"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FieldError, TextInput } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import {
  dateKey,
  formatNumericDate,
  formatTime,
  formatYear,
  timeKey,
  timeZoneLabel,
} from "@/lib/format";
import { slidesProvider } from "@/lib/slides";
import { useNow } from "@/lib/useNow";
import { useGroup } from "./GroupContext";
import { ImportLessons } from "./ImportLessons";
import { AddLessonForm } from "./AddLessonForm";
import { YearTimeline } from "./YearTimeline";

type Overview = NonNullable<typeof api.adminCurriculum.overview._returnType>;
type OverviewDay = Overview["days"][number];

/** 4g. Curriculum days, the year's schedule and turn-in windows. */
export function CurriculumScreen() {
  const { group, selectedClass } = useGroup();
  const now = useNow();
  const [importingLessons, setImportingLessons] = useState(false);
  const [addingLesson, setAddingLesson] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const data = useQuery(api.adminCurriculum.overview, { group });

  if (data === undefined) return <LoadingState label="Loading class lessons…" />;

  const tz = data.timeZone;
  const unscheduled = data.days.filter((d) => d.schedule === null);
  const todayDay = data.days.find(
    (d) => d.schedule && dateKey(d.schedule.lessonAt, tz) === dateKey(now, tz),
  );
  const selected =
    data.days.find((d) => d._id === selectedDayId) ?? todayDay ?? data.days[0] ?? null;

  return (
    <main className="flex flex-col pb-10">
      <div className="flex flex-wrap items-end gap-3 px-4 md:px-7 pt-4">
        <h1 className="m-0 text-[34px] md:text-[46px] leading-[1.04] font-extrabold tracking-[-.035em]">Curriculum</h1>
        <span className="mb-[11px] ml-auto text-sm text-ink3">{formatYear(selectedClass?.year ?? data.year)}</span>
        <Button variant="primary" disabled={!data.curriculum} onClick={() => setAddingLesson(v => !v)}>Add lesson</Button>
        <Button disabled={!data.curriculum} onClick={() => setImportingLessons(v => !v)}>Import lessons</Button>
        <span className="mb-[11px] text-[13px] text-ink3">{timeZoneLabel(tz)}</span>
      </div>
      <p className="mx-7 mt-2 mb-0 text-sm text-ink2">
        Manage lessons, cover images, slide links and assignments for {selectedClass?.name ?? "this class"} · {formatYear(data.year)}.
      </p>

      {importingLessons && <ImportLessons onClose={() => setImportingLessons(false)} />}
      {addingLesson && data.curriculum && <AddLessonForm key={data.curriculum._id} curricula={[{ ...data.curriculum, group }]} timeZone={tz} onClose={() => setAddingLesson(false)} onSaved={() => setAddingLesson(false)} />}
      {data.curriculum === null ? (
        <EmptyState title={`No lessons for ${selectedClass?.name ?? group} yet`} className="mx-7 mt-4" />
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
              <span className="text-xs text-ink3">Students see “Not scheduled” until a date is set.</span>
            </div>
          </section>

          {selected && <DayActions key={selected._id} day={selected} />}
          {selected && (
            <label className="mx-4 mt-3.5 flex flex-col gap-1.5 md:hidden">
              <span className="text-sm font-bold">Day</span>
              <select
                className={"h-11 w-full rounded-xl border border-bd bg-bg px-3 text-sm"}
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
              <DayContentPanel key={`content-${selected._id}`} day={selected} />
              <DayAssignmentsPanel day={selected} />
              <DaySchedulePanel
                key={`schedule-${selected._id}-${data.year}-${selected.schedule?.lessonAt ?? "none"}-${selected.schedule?.endsAt ?? "none"}`}
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

function DayActions({ day }: { day: OverviewDay }) {
  const remove = useMutation(api.adminCurriculum.deleteDay);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirming) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirming]);
  return <div className="mx-7 mt-4 flex flex-wrap items-center gap-2">
    <h2 className="mr-auto text-lg font-bold">Day {day.order} · {day.topic}</h2>
    <Button onClick={() => {
      const input = document.getElementById("day-topic");
      input?.scrollIntoView({ behavior: "smooth", block: "center" }); input?.focus({ preventScroll: true });
    }}>Edit day</Button>
    <Button variant="danger" onClick={() => { setError(null); setConfirming(true); }}>Delete day</Button>
    <dialog ref={dialog} aria-labelledby="delete-day-title" aria-describedby="delete-day-description"
      onCancel={event => { event.preventDefault(); if (!busy) setConfirming(false); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(520px,calc(100%-32px))] overflow-auto rounded-[24px] border border-bd bg-bg p-6 text-ink shadow-card backdrop:bg-black/60">
      <h2 id="delete-day-title" className="text-2xl font-bold">Delete day?</h2>
      <p id="delete-day-description" className="mt-3 text-sm">Permanently delete Day {day.order} · {day.topic}, its {day.assignments.length} assignments and all scheduled dates? Days with saved student work or attendance cannot be deleted. Audit logs are kept.</p>
      {error && <p role="alert" className="mt-3 text-sm text-cor-i">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
        <Button variant="danger" loading={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { await remove({ dayId: day._id }); setConfirming(false); }
          catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
        }}>Delete day</Button>
      </div>
    </dialog>
  </div>;
}

function PanelLabel({ children, mint }: { children: React.ReactNode; mint?: boolean }) {
  return (
    <b className={`text-xs font-bold tracking-[.05em] ${mint ? "text-mint-i" : "text-ink3"}`}>
      {children}
    </b>
  );
}

function DayContentPanel({ day }: { day: OverviewDay }) {
  const update = useMutation(api.adminCurriculum.updateDayContent);
  const uploadUrl = useMutation(api.adminCurriculum.coverUploadUrl);
  const setCover = useMutation(api.adminCurriculum.setCover);
  const [uploading, setUploading] = useState(false);
  const [coverMessage, setCoverMessage] = useState("");
  async function uploadCover(file: File) {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 5_000_000) { setError("Use a PNG, JPEG, WebP or GIF image up to 5 MB."); return; }
    setUploading(true); setError(null); setCoverMessage("");
    try {
      const url = await uploadUrl({});
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Image upload failed. Try again.");
      const result = await response.json() as { storageId: Id<"_storage"> };
      await setCover({ dayId: day._id, storageId: result.storageId });
      setCoverMessage("Cover saved");
    } catch (err) { setError(errorMessage(err)); } finally { setUploading(false); }
  }
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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Cover image</span>
        <div className="flex items-center gap-3">
          <div className="relative h-[81px] w-36 flex-none overflow-hidden rounded-[10px] bg-bg">
            {day.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={day.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-xs text-ink3">No cover</span>
            )}
          </div>
          <span className="text-[12.5px] text-ink3">
            Shown on the lesson page. 16:9 works best. PNG, JPEG, WebP or GIF; up to 5 MB.
          </span>
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{uploading ? "Uploading cover…" : "Upload or replace cover"}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploadCover(file); }} />
      </label>
      {day.coverUrl && <Button disabled={uploading} variant="secondary" onClick={async () => { setUploading(true); setError(null); try { await setCover({ dayId: day._id, storageId: null }); setCoverMessage("Cover removed"); } catch(err) { setError(errorMessage(err)); } finally { setUploading(false); } }}>Remove cover</Button>}
      {coverMessage && <span role="status" className="text-sm text-ink3">{coverMessage}</span>}
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
    </section>
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
        <ButtonLink href={`/admin/assignments?dayId=${day._id}`} size="sm" variant="secondary" className="h-[30px] rounded-lg bg-bg">
          + New assignment
        </ButtonLink>
      </div>
      {day.assignments.length === 0 && (
        <span className="text-sm text-ink3">No assignments on this day yet.</span>
      )}
      {day.assignments.map((a) => (
        <Link
          key={a._id}
          href={`/admin/assignments/${a._id}`}
          className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-xl bg-bg px-3 py-[9px] text-sm text-ink no-underline hover:bg-sf2 md:grid-cols-[minmax(0,1fr)_88px_80px]"
        >
          <b className="truncate font-bold">{a.title}</b>
          <span className="text-ink3 max-md:order-last max-md:col-span-2 max-md:text-[13px]">
            {a.type === "guided" ? "guided" : "open-ended"}
          </span>
          {a.status === "published" ? (
            <Pill tone="mint" className="px-2.5 font-semibold">Published</Pill>
          ) : (
            <Pill tone="amber" className="px-2.5 font-semibold">Draft</Pill>
          )}
        </Link>
      ))}
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
  const [endTime, setEndTime] = useState(day.schedule?.endsAt ? timeKey(day.schedule.endsAt, timeZone) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty =
    !day.schedule ||
    date !== dateKey(day.schedule.lessonAt, timeZone) ||
    time !== timeKey(day.schedule.lessonAt, timeZone) ||
    endTime !== (day.schedule.endsAt ? timeKey(day.schedule.endsAt, timeZone) : "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setSchedule({ dayId: day._id as Id<"days">, year, date, time, endTime });
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
            Start time
          </label>
          <TextInput id="lesson-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="lesson-end-time">End time
        <TextInput id="lesson-end-time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
      </label>
      <p className="m-0 text-xs text-ink3">Start and end times use {timeZone}, on the lesson date.</p>
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
          disabled={!dirty || !date || !time || !endTime}
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
