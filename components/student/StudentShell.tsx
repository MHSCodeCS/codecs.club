"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSignOut } from "@/components/auth/RequireRole";
import { useStudentViewer } from "@/components/auth/ViewerContext";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";
import { isSameDay } from "@/lib/format";
import { focusDay } from "@/lib/progress";
import { useNow } from "@/lib/useNow";

export function StudentShell({ children }: { children: ReactNode }) {
  const viewer = useStudentViewer();
  const signOut = useSignOut();
  const pathname = usePathname();
  const now = useNow();
  const home = useQuery(api.student.home);

  const focus = home ? focusDay(home.days, now, home.timeZone) : null;
  const focusIsToday =
    focus?.lessonAt != null && home ? isSameDay(focus.lessonAt, now, home.timeZone) : false;
  const focusHref = focus ? `/learn/days/${focus._id}` : null;

  const links = [
    { href: "/learn", label: "Learning home", current: pathname === "/learn" },
    ...(focus && focusHref
      ? [
          {
            href: focusHref,
            label: `${focusIsToday ? "Today" : "Latest"}: ${focus.topic}`,
            current: pathname === focusHref,
          },
        ]
      : []),
    { href: "/learn/work", label: "My work", current: pathname.startsWith("/learn/work") },
  ];

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="flex h-[68px] flex-none items-center gap-1 px-6 lg:px-10">
        <Link
          href="/learn"
          className="mr-6 text-[22px] leading-none font-extrabold tracking-[-.03em] text-ink no-underline"
        >
          CodeCS
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.current ? "page" : undefined}
              className={cn(
                "flex h-[38px] items-center rounded-[10px] px-3.5 no-underline",
                link.current
                  ? "bg-mint-s font-bold text-mint-i"
                  : "font-semibold text-ink2 hover:bg-sf hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle className="mr-2 hidden xl:inline-flex" />
          <Avatar name={viewer.name} />
          <span className="flex flex-col leading-[1.2]">
            <b className="text-sm font-bold">{viewer.name}</b>
            <span className="font-mono text-xs font-medium text-ink3">{viewer.loginCode}</span>
          </span>
          <Button variant="ghost" size="md" className="ml-1.5" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
