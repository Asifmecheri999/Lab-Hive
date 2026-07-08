"use client";

import { useCallback, useEffect, useState } from "react";
import { Window, Button } from "./window";
import { workDaysOf, dayStartOf, dayEndOf, type Term } from "@/lib/semester";
import { API_URL } from "@/lib/api-url";

const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";
const LS_KEY = "labhive.termId";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS: string[] = [];
for (let h = 6; h <= 22; h++) for (const m of ["00", "30"]) HOURS.push(`${String(h).padStart(2, "0")}:${m}`);

// Term selector + manager. Calls onSelect with the chosen term (or null).
export function TermBar({ token, canWrite, onSelect, showManage = true }: { token: string; canWrite: boolean; onSelect: (t: Term | null) => void; showManage?: boolean }) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [id, setId] = useState<string>("");
  const [dialog, setDialog] = useState<null | { mode: "new" | "edit" | "dup"; term?: Term }>(null);

  const api = useCallback((p: string, i?: RequestInit) =>
    fetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const pick = useCallback((list: Term[], wantId: string) => {
    const found = list.find((t) => t.id === wantId) ?? list[0] ?? null;
    setId(found?.id ?? "");
    if (found) localStorage.setItem(LS_KEY, found.id);
    onSelect(found);
  }, [onSelect]);

  const load = useCallback(async () => {
    const r = await api("/api/timetable/terms");
    if (!r.ok) return;
    const list: Term[] = await r.json();
    setTerms(list);
    pick(list, localStorage.getItem(LS_KEY) ?? "");
  }, [api, pick]);
  useEffect(() => { load(); }, [load]);

  function choose(termId: string) { pick(terms, termId); }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 shadow-sm ring-1 ring-black/5">
      <span className="px-1 text-xs font-medium text-gray-500">Term</span>
      {terms.length === 0
        ? <span className="text-sm text-gray-400">No term yet</span>
        : <select value={id} onChange={(e) => choose(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm font-medium text-[#0A1628]">
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}{t.startDate ? ` · from ${t.startDate}` : ""} ({t.weeks} wks)</option>)}
          </select>}
      {canWrite && showManage && <>
        <Button variant="ghost" onClick={() => setDialog({ mode: "new" })}>+ New term</Button>
        {id && <Button variant="ghost" onClick={() => setDialog({ mode: "edit", term: terms.find((t) => t.id === id) })}>Edit</Button>}
        {id && <Button variant="ghost" onClick={() => setDialog({ mode: "dup", term: terms.find((t) => t.id === id) })}>Duplicate →</Button>}
      </>}
      {dialog && <TermDialog dialog={dialog} api={api} onClose={() => setDialog(null)}
        onSaved={async (newId) => { setDialog(null); const r = await api("/api/timetable/terms"); const list = await r.json(); setTerms(list); pick(list, newId ?? id); }} />}
    </div>
  );
}

function TermDialog({ dialog, api, onClose, onSaved }: {
  dialog: { mode: "new" | "edit" | "dup"; term?: Term };
  api: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: (id?: string) => void;
}) {
  const isDup = dialog.mode === "dup";
  const base = dialog.term;
  const [name, setName] = useState(dialog.mode === "edit" ? base?.name ?? "" : isDup ? `${base?.name ?? "Term"} (copy)` : "");
  const [startDate, setStartDate] = useState(base?.startDate ?? "");
  const [weeks, setWeeks] = useState(base?.weeks ?? 12);
  const [workDays, setWorkDays] = useState<number[]>(() => workDaysOf(base));
  const [dayStart, setDayStart] = useState(dayStartOf(base));
  const [dayEnd, setDayEnd] = useState(dayEndOf(base));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggleDay = (i: number) => setWorkDays((d) => d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort((a, b) => a - b));

  async function save() {
    if (!name) { setErr("Name is required"); return; }
    if (!workDays.length) { setErr("Pick at least one working day"); return; }
    if (dayStart >= dayEnd) { setErr("Day end must be after day start"); return; }
    setBusy(true); setErr("");
    const body = JSON.stringify({ name, startDate, weeks, workDays, dayStart, dayEnd });
    let res: Response;
    if (dialog.mode === "edit") res = await api(`/api/timetable/terms/${base!.id}`, { method: "PUT", body });
    else if (isDup) res = await api(`/api/timetable/terms/${base!.id}/duplicate`, { method: "POST", body });
    else res = await api("/api/timetable/terms", { method: "POST", body });
    setBusy(false);
    if (res.ok) { const t = await res.json().catch(() => ({})); onSaved(t.id); }
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function del() {
    if (!confirm("Delete this term and ALL its scheduled sessions?")) return;
    const r = await api(`/api/timetable/terms/${base!.id}`, { method: "DELETE" });
    if (r.ok) onSaved("");
  }

  const title = dialog.mode === "edit" ? "Edit term" : isDup ? "Duplicate term" : "New term";
  return (
    <Window width="max-w-md" title={title} subtitle={isDup ? `Copies every session from “${base?.name}”` : "Semester / term"} onClose={onClose}
      footer={<>
        {dialog.mode === "edit" && <Button variant="danger" onClick={del}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isDup ? "Create copy" : "Save"}</Button>
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Term name *</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fall 2026" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Week 1 starts on</label><input type="date" className={inputCls} value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Number of weeks</label><input type="number" min={1} max={52} className={inputCls} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} /></div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Working days <span className="text-gray-400">(shown in the calendar)</span></label>
          <div className="flex flex-wrap gap-1.5">{DAY_NAMES.map((d, i) => <button key={i} type="button" onClick={() => toggleDay(i)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${workDays.includes(i) ? "bg-[#0A1628] text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-100"}`}>{d}</button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Day starts</label><select className={inputCls} value={dayStart} onChange={(e) => setDayStart(e.target.value)}>{HOURS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Day ends</label><select className={inputCls} value={dayEnd} onChange={(e) => setDayEnd(e.target.value)}>{HOURS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        </div>
        {isDup && <p className="text-xs text-gray-500">All {base?._count?.entries ?? 0} sessions from “{base?.name}” will be copied into the new term — adjust the start date for the new year/summer.</p>}
      </div>
    </Window>
  );
}
