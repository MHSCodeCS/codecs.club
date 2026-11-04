"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ThemeToggle } from "./ThemeToggle";

export function ProfileMenu({ name, color, loginCode, onSignOut }: { name: string; color: string; loginCode?: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <div ref={container} className="relative" onPointerEnter={event => {
    if (event.pointerType === "mouse") setOpen(true);
  }} onPointerLeave={event => {
    if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) setOpen(false);
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-label={`${name}, profile options`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(true)}
      className="flex cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent p-1.5 text-ink hover:bg-sf focus-visible:outline-2 focus-visible:outline-mint">
      <Avatar name={name} color={color} size={loginCode ? 34 : 32} className="text-xs" />
      <span className="flex flex-col text-left leading-[1.2]">
        <b className="text-sm font-bold whitespace-nowrap">{name}</b>
        {loginCode && <span className="font-mono text-xs font-medium text-ink3">{loginCode}</span>}
      </span>
    </button>
    {open && <div className="absolute right-0 top-full z-50 w-64 pt-2">
      <div id={id} role="dialog" aria-label="Profile options" className="flex flex-col gap-4 rounded-2xl border border-bd bg-sf p-4 shadow-card">
        <div className="flex flex-col gap-2"><span className="text-sm font-bold">Theme</span><ThemeToggle /></div>
        <Button variant="danger" className="w-full justify-start" onClick={onSignOut}>Sign out</Button>
      </div>
    </div>}
  </div>;
}
