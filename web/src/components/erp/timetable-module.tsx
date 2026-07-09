"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { TermBar } from "./term-bar";
import { KIND_COLOR, KIND_LABEL, weeksOf, weekLabel, workDaysOf, dayStartOf, dayEndOf, type Term } from "@/lib/semester";
import { API_URL } from "@/lib/api-url";
import { retryFetch } from "@/lib/fetch-retry";

const WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN", "FACULTY"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PXM = 0.8;
const TIMES: string[] = [];
for (let h = 7; h <= 21; h++) for (const m of ["00", "30"]) TIMES.push(`${String(h).padStart(2, "0")}:${m}`);
const mins = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
const kindLabel = (e: Entry) => KIND_LABEL[e.kind] ?? e.kind;

type EItem = { itemId: string; item?: { name?: string; type?: string } };
type Entry = {
  id: string; kind: string; title?: string | null; week: number; dayOfWeek: number; startTime: string; endTime: string;
  labId?: string | null; facultyName?: string | null; groups?: number | null; notes?: string | null;
  lab?: { name?: string } | null; experiment?: { title?: string; items?: EItem[]; subject?: { color?: string | null } | null } | null;
};
const entryColor = (e: Entry) => e.kind === "EXPERIMENT" ? (e.experiment?.subject?.color || KIND_COLOR.EXPERIMENT) : (KIND_COLOR[e.kind] ?? "#64748b");

export function TimetableModule({ token, role }: { token: string; role: string }) {
  const canWrite = WRITE.includes(role);
  const [term, setTerm] = useState<Term | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [week, setWeek] = useState(1);
  const [labF, setLabF] = useState("ALL");
  const [sel, setSel] = useState<Entry | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [labsAll, setLabsAll] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<string[]>([]);

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  useEffect(() => {
    api("/api/schedule/labs").then((r) => (r.ok ? r.json() : [])).then(setLabsAll).catch(() => {});
    api("/api/experiments/people").then((r) => (r.ok ? r.json() : [])).then((l: { name: string }[]) => setPeople(l.map((p) => p.name))).catch(() => {});
  }, [api]);

  const load = useCallback(async (termId: string) => {
    setLoading(true); setErr("");
    try {
      const r = await retryFetch(`${API_URL}/api/timetable?termId=${termId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEntries(await r.json());
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { if (term) load(term.id); else { setEntries([]); setLoading(false); } }, [term, load]);

  const labs = Array.from(new Map(entries.filter((e) => e.lab?.name).map((e) => [e.labId, e.lab!.name])).entries()) as [string, string][];

  const weekEntries = useMemo(() => entries.filter((e) =>
    e.week === week && (labF === "ALL" || e.labId === labF)
  ), [entries, week, labF]);

  const conflictIds = useMemo(() => {
    const equip = (e: Entry) => (e.experiment?.items ?? []).filter((i) => i.item?.type === "EQUIPMENT" || i.item?.type === "TOOL").map((i) => i.itemId);
    const set = new Set<string>();
    for (let i = 0; i < weekEntries.length; i++) for (let j = i + 1; j < weekEntries.length; j++) {
      const a = weekEntries[i], b = weekEntries[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (!(mins(a.startTime) < mins(b.endTime) && mins(b.startTime) < mins(a.endTime))) continue;
      const ea = equip(a), eb = equip(b);
      if (ea.some((x) => eb.includes(x))) { set.add(a.id); set.add(b.id); }
    }
    return set;
  }, [weekEntries]);

  const ds = mins(dayStartOf(term)), de = mins(dayEndOf(term));
  const used = new Set(weekEntries.map((e) => e.dayOfWeek));
  const days = Array.from(new Set([...workDaysOf(term), ...used])).sort((a, b) => a - b);
  const startH = Math.floor(ds / 60), endH = Math.ceil(de / 60);
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);

  async function del(id: string) {
    if (!confirm("Remove this session from the timetable?")) return;
    const r = await retryFetch(`${API_URL}/api/timetable/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (r.ok && term) { setSel(null); load(term.id); }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Semester Plan</h1><p className="text-sm text-gray-500">Weekly calendar · equipment clashes flagged in red</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={labF} onChange={(e) => setLabF(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700"><option value="ALL">All labs</option>{labs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          {term && <button onClick={() => load(term.id)} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>}
        </div>
      </div>

      <TermBar token={token} canWrite={canWrite} onSelect={setTerm} showManage={false} />

      {term && (
        <div className="mb-3 flex items-center justify-center gap-3 rounded-lg bg-white p-2 shadow-sm ring-1 ring-black/5">
          <button onClick={() => setWeek(Math.max(1, week - 1))} disabled={week <= 1} className="rounded-md px-3 py-1.5 text-lg font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40" title="Previous week">‹</button>
          <select value={week} onChange={(e) => setWeek(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-[#0A1628]">
            {Array.from({ length: weeksOf(term) }, (_, w) => <option key={w + 1} value={w + 1}>{weekLabel(w + 1, term)}</option>)}
          </select>
          <button onClick={() => setWeek(Math.min(weeksOf(term), week + 1))} disabled={week >= weeksOf(term)} className="rounded-md px-3 py-1.5 text-lg font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40" title="Next week">›</button>
        </div>
      )}

      {!term ? <p className="text-gray-400">Create a term in the bar above to start building a timetable.</p>
        : err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={() => load(term.id)} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p> : (
        <div className="overflow-x-auto rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <div className="min-w-[720px]">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
              <div />
              {days.map((d) => <div key={d} className="pb-2 text-center text-sm font-semibold text-[#0A1628]">{DAYS[d]}</div>)}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
              <div className="relative" style={{ height: (de - ds) * PXM }}>
                {hours.map((h) => <div key={h} className="absolute right-1 -translate-y-1/2 text-[11px] text-gray-400" style={{ top: (h * 60 - ds) * PXM }}>{String(h).padStart(2, "0")}:00</div>)}
              </div>
              {days.map((d) => (
                <div key={d} className="relative border-l border-gray-100" style={{ height: (de - ds) * PXM }}>
                  {hours.map((h) => <div key={h} className="absolute w-full border-t border-gray-50" style={{ top: (h * 60 - ds) * PXM }} />)}
                  {weekEntries.filter((e) => e.dayOfWeek === d).map((e) => {
                    const conflict = conflictIds.has(e.id);
                    const top = (mins(e.startTime) - ds) * PXM;
                    const height = Math.max(22, (mins(e.endTime) - mins(e.startTime)) * PXM);
                    return (
                      <button key={e.id} onClick={() => setSel(e)} title={String(e.title ?? e.experiment?.title ?? "")}
                        className="absolute left-0.5 right-0.5 overflow-hidden rounded-md px-1.5 py-1 text-left text-white shadow-sm"
                        style={{ top, height, background: conflict ? "#ef4444" : entryColor(e) }}>
                        <p className="truncate text-[11px] font-semibold leading-tight">{e.experiment?.title ?? e.title ?? kindLabel(e)}</p>
                        <p className="truncate text-[10px] opacity-90">{e.startTime}–{e.endTime}</p>
                        {height > 44 && <p className="truncate text-[10px] opacity-80">{[e.lab?.name, e.facultyName].filter(Boolean).join(" · ")}</p>}
                        {conflict && <p className="text-[10px] font-bold">⚠ clash</p>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {term && !loading && !err && weekEntries.length === 0 && <p className="mt-3 text-sm text-gray-400">Nothing scheduled in {weekLabel(week, term)}. Book sessions from the Scheduling tab.</p>}
      {conflictIds.size > 0 && <p className="mt-3 text-sm text-red-600">⚠ {conflictIds.size / 2} equipment clash(es) this week.</p>}

      {sel && (
        <Window width="max-w-md" title={sel.experiment?.title ?? sel.title ?? kindLabel(sel)} subtitle={kindLabel(sel)} onClose={() => setSel(null)}
          footer={<><Button variant="ghost" onClick={() => setSel(null)}>Close</Button>{canWrite && <Button variant="danger" onClick={() => del(sel.id)}>Remove</Button>}{canWrite && <Button onClick={() => { setEditEntry(sel); setSel(null); }}>Edit</Button>}</>}>
          <dl className="space-y-2 text-sm">
            <Info k="When" v={`${weekLabel(sel.week, term)} · ${DAYS[sel.dayOfWeek]} ${sel.startTime}–${sel.endTime}`} />
            <Info k="Lab" v={sel.lab?.name ?? "—"} />
            <Info k="Faculty" v={sel.facultyName ?? "—"} />
            {sel.groups != null && <Info k="Groups" v={String(sel.groups)} />}
            {sel.notes && <Info k="Notes" v={sel.notes} />}
            {conflictIds.has(sel.id) && <p className="rounded bg-red-50 px-3 py-2 text-red-700">⚠ Equipment used by another session at an overlapping time.</p>}
          </dl>
        </Window>
      )}

      {editEntry && term && <EditSession entry={editEntry} term={term} labs={labsAll} people={people} api={api}
        onClose={() => setEditEntry(null)} onSaved={() => { setEditEntry(null); load(term.id); }} />}
    </div>
  );
}

function EditSession({ entry, term, labs, people, api, onClose, onSaved }: {
  entry: Entry; term: Term; labs: { id: string; name: string }[]; people: string[];
  api: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Record<string, unknown>>(() => ({ ...entry }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (String(f.startTime) >= String(f.endTime)) { setErr("End time must be after start"); return; }
    setBusy(true); setErr("");
    const r = await api(`/api/timetable/${entry.id}`, { method: "PUT", body: JSON.stringify({ ...entry, ...f }) });
    setBusy(false);
    if (r.ok) onSaved(); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  const isExp = entry.kind === "EXPERIMENT";
  return (
    <Window width="max-w-lg" title={`Edit · ${entry.experiment?.title ?? entry.title ?? kindLabel(entry)}`} subtitle="Change day, time, lab or who" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {!isExp && <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Title</label><input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={String(f.title ?? "")} onChange={(e) => set("title", e.target.value)} /></div>}
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Week</label><select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={Number(f.week)} onChange={(e) => set("week", Number(e.target.value))}>{Array.from({ length: weeksOf(term) }, (_, w) => <option key={w + 1} value={w + 1}>{weekLabel(w + 1, term)}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Day</label><select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={Number(f.dayOfWeek)} onChange={(e) => set("dayOfWeek", Number(e.target.value))}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Start time</label><select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={String(f.startTime)} onChange={(e) => set("startTime", e.target.value)}>{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">End time</label><select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={String(f.endTime)} onChange={(e) => set("endTime", e.target.value)}>{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Lab</label><select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={String(f.labId ?? "")} onChange={(e) => set("labId", e.target.value)}><option value="">— select —</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Faculty / who</label><select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={String(f.facultyName ?? "")} onChange={(e) => set("facultyName", e.target.value)}><option value="">— select —</option>{people.map((p) => <option key={p} value={p}>{p}</option>)}{!!f.facultyName && !people.includes(String(f.facultyName)) && <option value={String(f.facultyName)}>{String(f.facultyName)}</option>}</select></div>
        {isExp && <div><label className="mb-1 block text-xs font-medium text-gray-600">No. of groups</label><input type="number" min={1} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={f.groups == null || f.groups === "" ? "" : Number(f.groups)} onChange={(e) => set("groups", e.target.value === "" ? "" : Number(e.target.value))} /></div>}
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
    </Window>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-gray-500">{k}</dt><dd className="text-right font-medium text-gray-900">{v}</dd></div>;
}
