"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { useGroup } from "./GroupContext";
import { errorMessage } from "@/lib/errors";
export function ClassesSettings() {
  const { classes, group, setGroup } = useGroup();
  const router = useRouter();
  const deleteArchived = useMutation(api.classes.deleteArchived);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const create = useMutation(api.classes.create), changeStatus = useMutation(api.classes.setStatus);
  const [name, setName] = useState(""), [year, setYear] = useState(""), [upcoming, setUpcoming] = useState(false);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const classList = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const dismissMenus = (event: PointerEvent) => {
      classList.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      });
    };
    document.addEventListener("pointerdown", dismissMenus);
    return () => document.removeEventListener("pointerdown", dismissMenus);
  }, []);
  useEffect(() => {
    if (createOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [createOpen]);
  const statusOrder = { upcoming: 0, current: 1, archived: 2 };
  const statusColors = { upcoming: "bg-amb text-on-amb", current: "bg-mint text-on-mint", archived: "bg-cor-s text-cor-i" };
  const input = "rounded-xl border border-bd bg-bg p-2 text-ink";
  return <Panel tone="surface" className="flex flex-col gap-4 p-5" aria-label="Classes">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[22px] font-bold">Classes</h2>
      <Button variant="primary" onClick={() => { setError(null); setCreateOpen(true); }}>Create class</Button>
    </div>
    <dialog ref={dialog} aria-labelledby="create-class-title" onCancel={event => { if (busy) { event.preventDefault(); return; } setCreateOpen(false); }}
      onClose={() => setCreateOpen(false)}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(520px,calc(100%-32px))] overflow-auto rounded-[24px] border border-bd bg-bg p-6 text-ink shadow-card backdrop:bg-black/60">
    <h2 id="create-class-title" className="mb-5 text-2xl font-bold">Create class</h2>
    <form className="flex flex-col gap-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(null); try { const id = await create({ name, year, upcoming }); setName(""); setYear(""); setUpcoming(false); setGroup(id); setCreateOpen(false); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }}>
      <label className="flex flex-col gap-1 text-sm font-bold">Class name<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm font-bold">Year<input required placeholder="2027-28" value={year} onChange={e => setYear(e.target.value)} className={input} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={upcoming} onChange={e => setUpcoming(e.target.checked)} />Upcoming</label>
      <Button type="submit" variant="primary" loading={busy}>Create class</Button>
      <Button disabled={busy} onClick={() => setCreateOpen(false)}>Cancel</Button>
    </form>
    {createOpen && error && <p role="alert" className="mt-3 text-sm text-cor-i">{error}</p>}
    </dialog>
    <ul ref={classList} className="flex flex-col gap-2" aria-label="Class list">{[...classes].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]).map(c => { const status = c.status; return <li key={c._id} className="flex items-center gap-3 rounded-xl border border-mint/15 bg-mint-s p-3"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><b className="break-words">{c.name} · {c.year}</b><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusColors[status]}`}>{status}</span></div>
      <details name="class-actions" className="relative shrink-0" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }} onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault(); event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary aria-label={`Actions for ${c.name} · ${c.year}`} title="Class actions" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl text-2xl text-ink hover:bg-mint/15 focus-visible:outline-2 focus-visible:outline-mint [&::-webkit-details-marker]:hidden">⋮</summary>
        <div className="absolute right-0 top-full z-20 mt-2 flex w-72 max-w-[calc(100vw-4rem)] flex-col gap-2 rounded-2xl border border-bd bg-bg p-3 shadow-card [&>button]:justify-start [&>button]:w-full">
        <Button size="sm" onClick={() => { setGroup(c.group); router.push("/admin/curriculum"); }}>Open{status === "archived" ? " archive" : " class"}</Button>{status === "upcoming" && <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await changeStatus({ classId: c._id, status: "current" }); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }}>Start class</Button>}{status !== "archived" && (confirmArchive === c._id ? <><span className="text-sm">Archive permanently?</span><Button size="sm" variant="danger" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await changeStatus({ classId: c._id, status: "archived" }); setConfirmArchive(null); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }}>Confirm archive</Button><Button size="sm" onClick={() => setConfirmArchive(null)}>Cancel</Button></> : <Button size="sm" disabled={busy} onClick={() => setConfirmArchive(c._id)}>Mark as over</Button>)}{status === "archived" && (confirmDelete === c._id ? <div role="group" aria-label={`Confirm deletion of ${c.name}`} className="flex w-full flex-wrap items-center gap-3 rounded-xl bg-cor-s p-3"><p className="flex-1 text-sm">Delete {c.name} · {c.year} from archived classes? Student involvement, attendance and saved work will be retained.</p><Button size="sm" variant="danger" loading={busy} onClick={async () => { setBusy(true); setError(null); try { await deleteArchived({ classId: c._id }); setConfirmDelete(null); if (group === c.group) setGroup(classes.find(other => other._id !== c._id && other.status !== "archived")?.group ?? classes.find(other => other._id !== c._id)?.group ?? ""); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }}>Confirm delete</Button><Button size="sm" disabled={busy} onClick={() => setConfirmDelete(null)}>Cancel</Button></div> : <Button size="sm" variant="danger" disabled={busy} onClick={() => { setConfirmDelete(c._id); setError(null); }}>Delete</Button>)}</div></details></li>; })}</ul>
    {!createOpen && error && <p role="alert" className="text-sm text-cor-i">{error}</p>}
  </Panel>;
}
