"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

export type TicketStudent = { _id: string; firstName: string; lastName: string; loginCode: string };

/** Uses saved roster values; printing never changes a student's code. */
export function LoginTickets({ students, address, onClose }: {
  students: TicketStudent[];
  address: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [website, setWebsite] = useState(address);
  let validAddress = false;
  try { validAddress = ["https:", "http:"].includes(new URL(website).protocol); } catch { /* Show inline validation. */ }
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return createPortal(
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="tickets-title" className="login-tickets m-auto max-h-[90vh] w-[850px] max-w-[95vw] overflow-auto rounded-2xl border border-bd bg-bg p-6 text-ink backdrop:bg-black/50">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <h2 id="tickets-title" className="mr-auto text-xl font-bold">Login tickets · {students.length}</h2>
        <Button variant="primary" disabled={!validAddress} onClick={() => window.print()}>Print / Save PDF</Button>
        <Button onClick={onClose}>Close</Button>
        <p className="w-full text-sm text-ink3">Check the website address before printing. Tickets use saved names and login codes.</p>
        <label className="w-full text-sm font-bold">Website address
          <input type="url" value={website} onChange={e => setWebsite(e.target.value)} className="ml-3 w-full max-w-md rounded-lg border border-bd bg-bg p-2 font-normal" />
        </label>
        {!validAddress && <p role="alert" className="text-sm text-cor-i">Enter a full website address starting with https:// or http://.</p>}
      </div>
      <div className="ticket-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        {students.map(student => <article key={student._id} className="login-ticket rounded-xl border border-bd p-5">
          <div className="text-sm font-bold">CodeCS · Your login ticket</div>
          <h3 className="my-2 text-xl font-extrabold">{student.firstName} {student.lastName}</h3>
          <p className="break-all text-sm">{website}</p>
          <p className="mt-3 text-xs">Your login code</p>
          <p className="my-1 break-all font-mono text-2xl font-bold">{student.loginCode}</p>
          <ol className="mt-3 list-inside list-decimal text-sm">
            <li>Open the website above.</li>
            <li>Enter your login code and sign in.</li>
          </ol>
          <p className="mt-3 text-xs">Keep this ticket. Use the same code each lesson.</p>
        </article>)}
      </div>
    </dialog>, document.body,
  );
}
