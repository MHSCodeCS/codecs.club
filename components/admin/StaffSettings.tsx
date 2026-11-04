"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { errorMessage } from "@/lib/errors";

type Staff = FunctionReturnType<typeof api.admins.list>["page"][number];
type StaffDialog = { mode: "create" } | { mode: "edit" | "delete"; staff: Staff };

export function StaffSettings() {
  const { results, status, loadMore } = usePaginatedQuery(api.admins.list, {}, { initialNumItems: 25 });
  const [dialog, setDialog] = useState<StaffDialog | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      list.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      });
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <Panel tone="surface" className="flex flex-col gap-4 p-5" aria-label="Admin accounts">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[22px] font-bold">Admin Accounts</h2>
      <Button variant="primary" onClick={() => setDialog({ mode: "create" })}>Add admin account</Button>
    </div>
    {status === "LoadingFirstPage" ? <p role="status" className="text-sm text-ink3">Loading admin accounts…</p> :
      <div ref={list} role="table" aria-label="Admin accounts list">
        <div role="row" className="grid h-[34px] grid-cols-[minmax(0,1fr)_36px] items-center gap-3 border-b border-ln px-3.5 text-[13px] font-semibold text-ink3">
          <span role="columnheader">Admin</span><span role="columnheader" className="sr-only">Actions</span>
        </div>
        {results.map(staff => <div role="row" key={staff._id} className="grid min-h-12 grid-cols-[minmax(0,1fr)_36px] items-center gap-3 border-b border-ln px-3.5 py-1.5 hover:bg-sf">
          <div role="cell" className="flex min-w-0 items-center gap-3">
            <Avatar name={staff.displayName} color={staff.avatarColor} />
            <div className="flex min-w-0 flex-wrap items-center gap-2"><button type="button" className="cursor-pointer break-words border-0 bg-transparent p-0 text-left font-bold text-ink hover:underline" onClick={() => setDialog({ mode: "edit", staff })}>{staff.displayName}</button></div>
          </div>
          <div role="cell">
          <details name="staff-actions" className="relative shrink-0" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
          }} onKeyDown={event => {
            if (event.key === "Escape") {
              event.preventDefault(); event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary aria-label={`Actions for ${staff.displayName}`} title="Admin actions" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl text-2xl text-ink hover:bg-mint/15 focus-visible:outline-2 focus-visible:outline-mint [&::-webkit-details-marker]:hidden">⋮</summary>
            <div className="absolute right-0 top-full z-20 mt-2 flex w-48 flex-col gap-1 rounded-2xl border border-bd bg-bg p-2 shadow-card">
              <Button variant="ghost" className="justify-start" onClick={event => {
                event.currentTarget.closest("details")?.removeAttribute("open"); setDialog({ mode: "edit", staff });
              }}>Edit account</Button>
              <Button variant="danger" className="justify-start" disabled={staff.isSelf} title={staff.isSelf ? "You cannot delete your own account" : undefined} onClick={event => {
                event.currentTarget.closest("details")?.removeAttribute("open"); setDialog({ mode: "delete", staff });
              }}>Delete account</Button>
            </div>
          </details>
          </div>
        </div>)}
      </div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <Button className="self-start" loading={status === "LoadingMore"} onClick={() => loadMore(25)}>Load more admins</Button>}
    {dialog && <StaffAccountDialog dialog={dialog} onClose={() => setDialog(null)} />}
  </Panel>;
}

function StaffAccountDialog({ dialog, onClose }: { dialog: StaffDialog; onClose: () => void }) {
  const element = useRef<HTMLDialogElement>(null);
  const create = useMutation(api.admins.createStaff);
  const update = useMutation(api.admins.updateStaff);
  const remove = useMutation(api.admins.deleteStaff);
  const [firstName, setFirstName] = useState(dialog.mode === "create" ? "" : dialog.staff.firstName);
  const [lastName, setLastName] = useState(dialog.mode === "create" ? "" : dialog.staff.lastName);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const modal = element.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);
  const deleting = dialog.mode === "delete";
  const title = deleting ? "Delete admin account" : dialog.mode === "create" ? "Add admin account" : "Edit admin account";
  const input = "w-full rounded-xl border border-bd bg-bg p-2 font-normal text-ink";
  return <dialog ref={element} aria-labelledby="staff-dialog-title" aria-describedby={deleting ? "staff-delete-description" : undefined}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(520px,calc(100%-32px))] overflow-auto rounded-[24px] border border-bd bg-bg p-6 text-ink shadow-card backdrop:bg-black/60">
    <h2 id="staff-dialog-title" className="mb-5 text-2xl font-bold">{title}</h2>
    <form className="flex flex-col gap-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(null);
      try {
        if (dialog.mode === "delete") await remove({ adminId: dialog.staff._id });
        else if (dialog.mode === "create") await create({ firstName, lastName, password });
        else await update({ adminId: dialog.staff._id, firstName, lastName, ...(password ? { password } : {}) });
        onClose();
      } catch (err) { setError(errorMessage(err)); }
      finally { setBusy(false); }
    }}>
      {deleting ? <p id="staff-delete-description" className="text-sm">Delete <b>{dialog.staff.displayName}</b> (@{dialog.staff.username})? This permanently removes their account and sign-in access. All audit logs and their recorded work will be kept.</p> :
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4 border-0 p-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-bold">First name<input required maxLength={50} autoComplete="off" value={firstName} onChange={event => setFirstName(event.target.value)} className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-bold">Last name<input required maxLength={50} autoComplete="off" value={lastName} onChange={event => setLastName(event.target.value)} className={input} /></label>
          </div>
          {dialog.mode === "edit" && <label className="flex flex-col gap-1 text-sm font-bold">Login code
            <input readOnly value={dialog.staff.username} className={`${input} font-mono`} />
          </label>}
          <label className="flex flex-col gap-1 text-sm font-bold">{dialog.mode === "create" ? "Password" : "New password (optional)"}<input type="password" required={dialog.mode === "create"} minLength={10} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className={input} />
            <span className="font-normal text-ink3">{dialog.mode === "create" ? "At least 10 characters. Share the credentials with this admin." : "Leave blank to keep the current password."}</span></label>
        </fieldset>}
      {error && <p role="alert" className="text-sm text-cor-i">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={deleting ? "danger" : "primary"} loading={busy}>{deleting ? "Delete account" : dialog.mode === "create" ? "Create account" : "Save changes"}</Button>
      </div>
    </form>
  </dialog>;
}
