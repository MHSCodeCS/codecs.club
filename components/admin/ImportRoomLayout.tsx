"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import type { Desk } from "@/lib/classroomLayout";

export function ImportRoomLayout({ group, onImport, onClose }: {
  group: string;
  onImport: (desks: Desk[]) => void;
  onClose: () => void;
}) {
  const classes = useQuery(api.classes.list);
  const [source, setSource] = useState("");
  const layout = useQuery(api.classroomLayouts.get, source ? { group: source } : "skip");
  const sources = classes?.filter(c => c.group !== group) ?? [];

  return <section aria-label="Import room layout" className="flex flex-col gap-3 rounded-xl border border-bd bg-bg p-4">
    <h3 className="font-bold">Import room layout from another class</h3>
    <p className="text-sm text-ink3">Copy desk positions and rotations from a previous class, including archived classes. Students from the source class are not copied. Your students keep matching seat numbers; anyone whose desk is missing becomes unseated.</p>
    <label className="flex flex-col gap-1 text-sm font-bold">Source class
      <select value={source} onChange={e => setSource(e.target.value)} className="h-10 max-w-md rounded-xl border border-bd bg-sf px-3">
        <option value="">Choose a class</option>
        {sources.map(c => <option key={c._id} value={c.group}>{c.name} · {c.year} · {c.status}</option>)}
      </select>
    </label>
    {classes && sources.length === 0 && <p className="text-sm text-ink3">No other classes are available.</p>}
    {source && <p role="status" className="text-sm">{layout ? `${layout.desks.length} desks ready to preview.` : "Loading room layout…"}</p>}
    <p className="text-sm text-ink3">Preview the copied layout, adjust it if needed, then choose Save layout. Cancel keeps your existing room.</p>
    <div className="flex gap-2">
      <Button size="sm" disabled={!source || !layout || !sources.some(c => c.group === source)} onClick={() => { if (layout) onImport(structuredClone(layout.desks)); }}>Preview layout</Button>
      <Button size="sm" onClick={onClose}>Cancel import</Button>
    </div>
  </section>;
}
