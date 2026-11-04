"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSignOut } from "@/components/auth/RequireRole";
import { useAdminViewer } from "@/components/auth/ViewerContext";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { ProfileMenu } from "@/components/ui/ProfileMenu";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";
import { ClassArchive } from "./ClassArchive";
import { GroupProvider, useGroup } from "./GroupContext";

import { UnsavedWorkProvider, useConfirmLeave } from "./UnsavedWork";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <UnsavedWorkProvider><GroupProvider>
      <div className="flex min-h-full flex-col bg-bg">
        <AdminHeader />
        <ClassContent>{children}</ClassContent>
      </div>
    </GroupProvider></UnsavedWorkProvider>
  );
}

function badgeText(count: number) {
  return count >= 100 ? "99+" : String(count);
}

function AdminHeader() {
  const confirmLeave = useConfirmLeave();
  const viewer = useAdminViewer();
  const signOut = useSignOut();
  const pathname = usePathname();
  const { group, setGroup, classes } = useGroup();
  const badges = useQuery(api.adminNav.badges, { group });
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const closeMenu = () => setMenuOpenOn(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const openHelp = badges?.openHelp ?? 0;
  const helpBadge = openHelp > 0 && (
    <Pill tone="amberSolid" className="h-5 px-[7px] font-extrabold">
      <span className="sr-only">, </span>
      {badgeText(openHelp)}
      <span className="sr-only"> waiting for help</span>
    </Pill>
  );
  const links: Array<{ href: string; label: string; badge?: ReactNode }> = [
    { href: "/admin/students", label: "Students" },
    { href: "/admin/curriculum", label: "Curriculum" },
    {
      href: "/admin/assistance",
      label: "Classroom",
      badge: badges && badges.openHelp > 0 && (
        <Pill tone="amberSolid" className="h-5 px-[7px] font-extrabold">
          <span className="sr-only">, </span>
          {badgeText(badges.openHelp)}
          <span className="sr-only"> waiting for help</span>
        </Pill>
      ),
    },
    {
      href: "/admin/review",
      label: "Review",
      badge: badges && badges.unreviewed > 0 && (
        <Pill className="h-5 px-[7px] font-extrabold">
          <span className="sr-only">, </span>
          {badgeText(badges.unreviewed)}
          <span className="sr-only"> waiting for review</span>
        </Pill>
      ),
    },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/history", label: "History" },
  ];
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/admin/curriculum" && pathname.startsWith("/admin/assignments"));

  const brand = (
    <span className="mr-4 flex items-center gap-2">
      <Link
        href="/admin/students"
        onNavigate={e => { if (!confirmLeave()) e.preventDefault(); }}
        className="text-[21px] leading-none font-extrabold tracking-[-.03em] text-ink no-underline"
      >
        CodeCS
      </Link>
      <Pill tone="ink" shape="tag" className="text-[11px] font-extrabold">
        ADMIN
      </Pill>
    </span>
  );
  const groupControl = (className: string) => (
    <select aria-label="Class" className={cn("h-11 max-w-full rounded-xl border border-bd bg-sf px-3 text-sm font-bold", className)} value={classes.some(c => c.group === group && c.status !== "archived") ? group : ""} onChange={e => setGroup(e.target.value)}>
      <option value="" disabled>Select class</option>
      {classes.filter(c => c.status !== "archived").map(c => <option key={c._id} value={c.group}>{c.name} · {c.year}{c.status === "upcoming" ? " · Upcoming" : ""}</option>)}
    </select>
  );

  return (
    <header className="relative flex-none">
      {/* Full navigation fits from 1280px (the 1366×768 Chromebook layout). */}
      <div className="hidden h-16 items-center gap-1 px-6 xl:flex">
        {brand}
        <nav aria-label="Admin" className="flex gap-0.5">
          {links.map((link) => {
            const current = isCurrent(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onNavigate={e => { if (!confirmLeave()) e.preventDefault(); }}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-[7px] rounded-[10px] px-[11px] text-[14.5px] no-underline",
                  current
                    ? "bg-mint-s font-bold text-mint-i"
                    : "font-semibold text-ink2 hover:bg-sf hover:text-ink",
                )}
              >
                {link.label}
                {link.badge}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          {groupControl("bg-sf")}
          <ProfileMenu name={viewer.name} color={viewer.avatarColor} onSignOut={() => { if (confirmLeave()) void signOut(); }} />
        </div>
      </div>

      {/* Narrower screens and phones: a compact bar with a menu. */}
      <div className="flex h-14 items-center gap-2 border-b border-ln px-4 xl:hidden">
        {brand}
        <span className="ml-auto text-sm font-semibold text-ink3">{group}</span>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border-0 bg-sf2 px-3.5 text-[15px] font-bold text-ink hover:bg-ln"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {menuOpen ? "✕" : "☰"}
          </span>
          Menu
          {!menuOpen && helpBadge}
        </button>
      </div>
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={closeMenu}
            className="fixed inset-x-0 top-14 bottom-0 z-40 cursor-default border-0 bg-ink/25 xl:hidden"
          />
          <div
            id="admin-menu"
            className="absolute inset-x-0 top-14 z-50 flex max-h-[calc(100dvh-56px)] flex-col gap-3 overflow-y-auto border-b border-ln bg-bg px-4 pt-3 pb-4 shadow-card xl:hidden"
          >
            {groupControl("flex bg-sf [&>button]:h-11 [&>button]:flex-1 [&>button]:text-[15px]")}
            <nav aria-label="Admin" className="flex flex-col gap-0.5">
              {links.map((link) => {
                const current = isCurrent(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                onNavigate={e => { if (!confirmLeave()) e.preventDefault(); }}
                    aria-current={current ? "page" : undefined}
                    onClick={closeMenu}
                    className={cn(
                      "flex h-12 items-center gap-2 rounded-xl px-3.5 text-base no-underline",
                      current
                        ? "bg-mint-s font-bold text-mint-i"
                        : "font-semibold text-ink hover:bg-sf",
                    )}
                  >
                    {link.label}
                    {/* Pill aligns itself to the top; this box keeps the count centered. */}
                    {link.badge && <span className="flex">{link.badge}</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-ln pt-3">
              <Avatar name={viewer.name} tone="violet" size={32} className="text-xs" />
              <b className="mr-auto text-sm font-bold">{viewer.name}</b>
              <ThemeToggle className="[&>button]:h-10" />
              <Button variant="secondary" className="h-11 px-4" onClick={() => { if (confirmLeave()) void signOut(); }}>
                Sign out
              </Button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}


function ClassContent({ children }: { children: ReactNode }) {
  const { group, selectedClass } = useGroup();
  const pathname = usePathname();
  const archived = selectedClass?.status === "archived" && pathname !== "/admin/settings";
  return <div key={group} className="flex flex-1 flex-col">
    {archived && <p role="status" className="mx-7 rounded-xl bg-amb-s p-3 font-bold">{selectedClass.name} · {selectedClass.year} · Archived — read-only. Open Settings to choose another class.</p>}
    {archived ? <ClassArchive /> : children}
  </div>;
}
