"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { TermBar } from "./term-bar";
import { SESSION_TYPES, weeksOf, weekLabel, workDaysOf, type Term } from "@/lib/semester";
import { API_URL } from "@/lib/api-url";
import { retryFetch } from "@/lib/fetch-retry";

const WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN", "FACULTY"];
type Row = Record<string, unknown>;
type Lab = { id: string; name: string };
type Subject = { id: string; name: string; code?: string | null; facultyName?: string | null; color?: string | null; _count?: { experiments: number } };
type EItem = { itemId: string; quantity?: number | null; item?: { type?: string | null; name?: string | null; quantity?: number | null } | null };
type Exp = { id: string; title: string; subjectId?: string | null; labId?: string | null; facultyName?: string | null; courseCode?: string | null; items?: EItem[] };
type TEntry = { id: string; week: number; dayOfWeek: number; startTime: string; endTime: string; labId?: string | null; facultyName?: string | null; kind: string; experiment?: { items?: EItem[] } | null };
type Stock = Record<string, { name: string; quantity: number }>;

const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const COLORS = ["#0A1628", "#00C9A7", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#64748b"];
const TIMES: string[] = [];
for (let h = 7; h <= 21; h++) for (const m of ["00", "30"]) TIMES.push(`${String(h).padStart(2, "0")}:${m}`);

export function ScheduleModule({ token, role }: { token: string; role: string }) {
  const canWrite = WRITE.includes(role);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exps, setExps] = useState<Exp[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [facultyReg, setFacultyReg] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [facFilter, setFacFilter] = useState("ALL");
  const [term, setTerm] = useState<Term | null>(null);
  const [openSubject, setOpenSubject] = useState<Subject | "new" | null>(null);
  const [booking, setBooking] = useState<Row | null>(null);
  const [entries, setEntries] = useState<TEntry[]>([]);
  const [stock, setStock] = useState<Stock>({});
  const [toast, setToast] = useState("");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/subjects");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSubjects(await r.json());
      api("/api/experiments").then((x) => { if (x.ok) x.json().then(setExps); }).catch(() => {});
      api("/api/schedule/labs").then((x) => { if (x.ok) x.json().then(setLabs); }).catch(() => {});
      api("/api/experiments/people").then((x) => { if (x.ok) x.json().then((l: { name: string }[]) => setFacultyReg(l.map((p) => p.name))); }).catch(() => {});
      api("/api/inventory").then((x) => { if (x.ok) x.json().then((items: { id: string; name: string; quantity?: number }[]) => setStock(Object.fromEntries(items.map((i) => [i.id, { name: i.name, quantity: Number(i.quantity ?? 0) }])))); }).catch(() => {});
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const loadEntries = useCallback(async () => { if (!term) { setEntries([]); return; } const r = await api(`/api/timetable?termId=${term.id}`); if (r.ok) setEntries(await r.json()); }, [api, term]);
  useEffect(() => { loadEntries(); }, [loadEntries]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const faculties = Array.from(new Set(facultyReg.filter(Boolean))) as string[]; // FACULTY users only
  const shown = subjects.filter((s) => facFilter === "ALL" || s.facultyName === facFilter);

  function openBooking(prefill: Row) {
    if (!term) { flash("Create a term first (top bar)"); return; }
    setBooking({ termId: term.id, ...prefill });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Scheduling</h1><p className="text-sm text-gray-500">Term → subjects → experiments → book into the timetable</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={facFilter} onChange={(e) => setFacFilter(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700">
            <option value="ALL">All teachers</option>
            {faculties.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
          {canWrite && <Button variant="ghost" onClick={() => openBooking({ kind: "MAKEUP" })}>+ Other session</Button>}
          {canWrite && <Button onClick={() => setOpenSubject("new")}>+ New Subject</Button>}
        </div>
      </div>

      <TermBar token={token} canWrite={canWrite} onSelect={setTerm} />

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">No subjects yet. {canWrite && "Click “+ New Subject” to add a course."}</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <button key={s.id} onClick={() => setOpenSubject(s)} className="overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2" style={{ background: s.color || "#0A1628" }} />
              <div className="p-5">
                {s.code && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{s.code}</span>}
                <h3 className="mt-2 font-semibold text-[#0A1628]">{s.name}</h3>
                <p className="mt-1 text-xs text-gray-500">{[s.facultyName, `${s._count?.experiments ?? 0} experiments`].filter(Boolean).join(" · ")}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {openSubject && <SubjectWindow record={openSubject === "new" ? null : openSubject} exps={exps} faculties={faculties} api={api} canWrite={canWrite}
        onClose={() => setOpenSubject(null)} onSaved={(m) => { flash(m); setOpenSubject(null); load(); }} onChanged={load}
        onBook={(exp) => { setOpenSubject(null); openBooking({ kind: "EXPERIMENT", experimentId: exp.id, title: exp.title, labId: exp.labId ?? "", facultyName: exp.facultyName ?? "" }); }} />}
      {booking && term && <BookingWindow prefill={booking} term={term} exps={exps} labs={labs} faculties={faculties} entries={entries} stock={stock} api={api}
        onClose={() => setBooking(null)} onSaved={(m) => { flash(m); setBooking(null); loadEntries(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function FacultyInput({ value, onChange, faculties, disabled }: { value: string; onChange: (v: string) => void; faculties: string[]; disabled?: boolean }) {
  return (
    <select className={inputCls} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— select —</option>
      {faculties.map((f) => <option key={f} value={f}>{f}</option>)}
      {value && !faculties.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

function SubjectWindow({ record, exps, faculties, api, canWrite, onClose, onSaved, onChanged, onBook }: {
  record: Subject | null; exps: Exp[]; faculties: string[]; api: (p: string, i?: RequestInit) => Promise<Response>; canWrite: boolean;
  onClose: () => void; onSaved: (m: string) => void; onChanged: () => void; onBook: (e: Exp) => void;
}) {
  const isNew = record === null;
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const [f, setF] = useState<Partial<Subject>>(() => record ? { ...record } : { name: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const [mine, setMine] = useState<Exp[]>(() => exps.filter((e) => e.subjectId === record?.id));
  const [linkId, setLinkId] = useState("");
  const mineIds = new Set(mine.map((e) => e.id));
  const available = exps.filter((e) => !mineIds.has(e.id));
  async function linkExp() {
    if (!linkId || !record) return;
    const r = await api(`/api/experiments/${linkId}/subject`, { method: "PATCH", body: JSON.stringify({ subjectId: record.id }) });
    if (r.ok) { const e = exps.find((x) => x.id === linkId); if (e) setMine((p) => [...p, { ...e, subjectId: record.id }]); setLinkId(""); onChanged(); }
  }
  async function removeExp(id: string, title: string) {
    if (!confirm(`Remove "${title}" from this subject?`)) return;
    if (!confirm("Are you sure? This removes it from the subject (the experiment itself is kept).")) return;
    const r = await api(`/api/experiments/${id}/subject`, { method: "PATCH", body: JSON.stringify({ subjectId: null }) });
    if (r.ok) { setMine((p) => p.filter((e) => e.id !== id)); onChanged(); }
  }

  async function save() {
    if (!f.name) { setErr("Subject name is required"); return; }
    setErr(""); setBusy(true);
    const res = isNew ? await api("/api/subjects", { method: "POST", body: JSON.stringify(f) })
      : await api(`/api/subjects/${record!.id}`, { method: "PUT", body: JSON.stringify(f) });
    setBusy(false);
    if (res.ok) onSaved(isNew ? "Subject created" : "Saved");
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function del() {
    if (!confirm("Delete this subject? Experiments stay but lose the link.")) return;
    const res = await api(`/api/subjects/${record!.id}`, { method: "DELETE" });
    if (res.ok) onSaved("Deleted"); else setErr("Delete failed");
  }

  return (
    <Window width="max-w-4xl" title={isNew ? "New Subject" : String(f.name)} subtitle={isNew ? "Create course" : editing ? "Editing" : "Course"}
      onClose={onClose}
      footer={<>
        {!isNew && canWrite && editing && <Button variant="danger" onClick={del}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Course name *</label><input className={inputCls} disabled={!editing} value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Course code</label><input className={inputCls} disabled={!editing} value={f.code ?? ""} onChange={(e) => set("code", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Course leader</label><FacultyInput value={f.facultyName ?? ""} disabled={!editing} faculties={faculties} onChange={(v) => set("facultyName", v)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Colour</label>
          <div className="flex flex-wrap gap-2 pt-1">{COLORS.map((c) => <button key={c} type="button" disabled={!editing} onClick={() => set("color", c)} className={`h-7 w-7 rounded-full ring-2 ${f.color === c ? "ring-[#0A1628]" : "ring-transparent"}`} style={{ backgroundColor: c }} />)}</div>
        </div>
      </div>

      {!isNew && (<>
        <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">Experiments under this subject</h3>
        {!editing && <p className="mb-2 text-xs text-gray-400">Click <b>Edit</b> below to add, book or delete experiments.</p>}
        {editing && (
          <div className="mb-3 flex items-center gap-2">
            <select className={`${inputCls} flex-1`} value={linkId} onChange={(e) => setLinkId(e.target.value)}><option value="">Add experiments — choose one…</option>{available.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
            <button type="button" onClick={linkExp} disabled={!linkId} className="shrink-0 rounded-md bg-[#0A1628] px-4 py-2 text-sm font-semibold text-[#00C9A7] hover:brightness-110 disabled:opacity-50">Add</button>
          </div>
        )}
        {mine.length === 0 ? <p className="text-xs text-gray-400">No experiments yet{editing ? " — add one above." : "."}</p> : (
          <ul className="max-h-80 space-y-1.5 overflow-auto pr-1">
            {mine.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
                <span className="flex-1 truncate font-medium text-gray-800">{e.title}{e.courseCode ? <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{e.courseCode}</span> : null}</span>
                {editing && <div className="flex shrink-0 items-center gap-2">
                  <Button onClick={() => onBook(e)}>Book</Button>
                  <Button variant="danger" onClick={() => removeExp(e.id, e.title)}>Delete</Button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </>)}
    </Window>
  );
}

function BookingWindow({ prefill, term, exps, labs, faculties, entries, stock, api, onClose, onSaved }: {
  prefill: Row; term: Term; exps: Exp[]; labs: Lab[]; faculties: string[]; entries: TEntry[]; stock: Stock; api: (p: string, i?: RequestInit) => Promise<Response>;
  onClose: () => void; onSaved: (m: string) => void;
}) {
  const workDays = workDaysOf(term);
  const [f, setF] = useState<Row>(() => ({ week: 1, weekTo: 1, ...prefill }));
  const [sessions, setSessions] = useState<{ dayOfWeek: number; startTime: string; endTime: string }[]>([{ dayOfWeek: workDays[0] ?? 0, startTime: "09:00", endTime: "11:00" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const setFromWeek = (w: number) => setF((s) => ({ ...s, week: w, weekTo: Math.max(w, Number(s.weekTo) || w) }));
  const setSess = (i: number, patch: Partial<{ dayOfWeek: number; startTime: string; endTime: string }>) => setSessions(sessions.map((s, j) => j === i ? { ...s, ...patch } : s));
  const addSess = () => setSessions([...sessions, { dayOfWeek: workDays[0] ?? 0, startTime: "09:00", endTime: "11:00" }]);

  function pickExperiment(id: string) {
    const e = exps.find((x) => x.id === id);
    setF((s) => ({ ...s, experimentId: id, title: e?.title ?? "", labId: e?.labId ?? s.labId, facultyName: e?.facultyName ?? s.facultyName }));
  }

  // Live clash check: same lab, same person, or the same equipment beyond its stock at an overlapping time.
  const overlap = (aS: string, aE: string, bS: string, bE: string) => aS < bE && bS < aE;
  function findConflicts(): string[] {
    const out = new Set<string>();
    const from = Number(f.week) || 1, to = Math.max(from, Number(f.weekTo) || from);
    const expObj = exps.find((x) => x.id === f.experimentId);
    const myEquip = f.kind === "EXPERIMENT" ? (expObj?.items ?? []).filter((it) => it.item?.type === "EQUIPMENT" || it.item?.type === "TOOL") : [];
    for (let w = from; w <= to; w++) {
      for (const s of sessions) {
        if (!s.startTime || !s.endTime || s.startTime >= s.endTime) continue;
        const over = entries.filter((e) => e.week === w && e.dayOfWeek === s.dayOfWeek && overlap(s.startTime, s.endTime, e.startTime, e.endTime));
        const at = `${weekLabel(w, term)} · ${DAYS[s.dayOfWeek]} ${s.startTime}–${s.endTime}`;
        if (f.labId && over.some((e) => e.labId === f.labId)) out.add(`Lab is already booked — ${at}`);
        if (f.facultyName && over.some((e) => e.facultyName === f.facultyName)) out.add(`${String(f.facultyName)} is already booked — ${at}`);
        for (const it of myEquip) {
          const have = stock[it.itemId]?.quantity ?? 0;
          let need = Number(it.quantity) || 0;
          for (const e of over) for (const ei of (e.experiment?.items ?? [])) if (ei.itemId === it.itemId) need += Number(ei.quantity) || 0;
          if (need > have) out.add(`${stock[it.itemId]?.name ?? it.item?.name ?? "Equipment"} over capacity (need ${need}, only ${have}) — ${at}`);
        }
      }
    }
    return Array.from(out);
  }
  const conflicts = findConflicts();

  async function save() {
    if (f.kind === "EXPERIMENT" && !f.experimentId) { setErr("Choose an experiment"); return; }
    if (f.kind !== "EXPERIMENT" && !f.title) { setErr("Enter a session title"); return; }
    if (!sessions.length) { setErr("Add at least one day & time"); return; }
    for (const s of sessions) { if (!s.startTime || !s.endTime || s.startTime >= s.endTime) { setErr("Each day needs a start time before its end time"); return; } }
    if (conflicts.length) { setErr("Resolve the conflicts shown below before booking."); return; }
    const from = Number(f.week) || 1;
    const to = Math.max(from, Number(f.weekTo) || from);
    setErr(""); setBusy(true);
    let n = 0;
    for (let w = from; w <= to; w++) {
      for (const s of sessions) {
        const res = await api("/api/timetable", { method: "POST", body: JSON.stringify({ ...f, week: w, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, termId: term.id }) });
        if (res.ok) n++; else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); setBusy(false); return; }
      }
    }
    setBusy(false);
    onSaved(n > 1 ? `Scheduled ${n} sessions` : "Session scheduled");
  }

  const isExp = f.kind === "EXPERIMENT";
  const isOther = f.kind === "OTHER";
  return (
    <Window width="max-w-xl" title="Schedule a session" subtitle={`Adds to ${term.name}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || conflicts.length > 0}>{busy ? "Saving…" : "Schedule"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Session type</label>
          <select className={inputCls} value={String(f.kind)} onChange={(e) => set("kind", e.target.value)}>
            <option value="EXPERIMENT">Experiment</option>
            {SESSION_TYPES.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
        </div>
        {isExp
          ? <div><label className="mb-1 block text-xs font-medium text-gray-600">Experiment *</label><select className={inputCls} value={String(f.experimentId ?? "")} onChange={(e) => pickExperiment(e.target.value)}><option value="">— select —</option>{exps.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div>
          : <div><label className="mb-1 block text-xs font-medium text-gray-600">{isOther ? "What is it? *" : "Title *"}</label><input className={inputCls} value={String(f.title ?? "")} onChange={(e) => set("title", e.target.value)} placeholder={isOther ? "Type the session name" : "e.g. Staff meeting"} /></div>}
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Lab</label><select className={inputCls} value={String(f.labId ?? "")} onChange={(e) => set("labId", e.target.value)}><option value="">— select —</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Faculty / who</label><FacultyInput value={String(f.facultyName ?? "")} faculties={faculties} onChange={(v) => set("facultyName", v)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">From week *</label><select className={inputCls} value={Number(f.week)} onChange={(e) => setFromWeek(Number(e.target.value))}>{Array.from({ length: weeksOf(term) }, (_, w) => <option key={w + 1} value={w + 1}>{weekLabel(w + 1, term)}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">To week <span className="text-gray-400">(repeat)</span></label><select className={inputCls} value={Number(f.weekTo)} onChange={(e) => set("weekTo", Number(e.target.value))}>{Array.from({ length: weeksOf(term) }, (_, w) => w + 1).filter((w) => w >= Number(f.week)).map((w) => <option key={w} value={w}>{weekLabel(w, term)}</option>)}</select></div>
        {isExp && <div><label className="mb-1 block text-xs font-medium text-gray-600">No. of groups</label><input type="number" min={1} className={inputCls} value={f.groups === 0 || f.groups == null ? "" : Number(f.groups)} onChange={(e) => set("groups", e.target.value === "" ? "" : Number(e.target.value))} /></div>}
      </div>

      <div className="mb-2 mt-4 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Days &amp; times <span className="font-normal text-gray-400">(each repeats every week above)</span></h3>
        <button type="button" onClick={addSess} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add day/time</button>
      </div>
      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <select className={`${inputCls} col-span-5`} value={s.dayOfWeek} onChange={(e) => setSess(i, { dayOfWeek: Number(e.target.value) })}>{workDays.map((di) => <option key={di} value={di}>{DAYS[di]}</option>)}</select>
            <select className={`${inputCls} col-span-3`} value={s.startTime} onChange={(e) => setSess(i, { startTime: e.target.value })} title="from">{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select className={`${inputCls} col-span-3`} value={s.endTime} onChange={(e) => setSess(i, { endTime: e.target.value })} title="till">{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            {sessions.length > 1 && <button type="button" onClick={() => setSessions(sessions.filter((_, j) => j !== i))} className="col-span-1 rounded px-1 text-red-600 hover:bg-red-50">✕</button>}
          </div>
        ))}
      </div>

      {conflicts.length > 0
        ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><b>⛔ Not available — clashes:</b><ul className="ml-4 mt-1 list-disc space-y-0.5">{conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul><p className="mt-1">At the same time you can&apos;t reuse the same lab, person, or a piece of equipment beyond its stock.</p></div>
        : <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">✓ No timetable clashes for the selected weeks, days &amp; times. <span className="text-emerald-600/80">(Recurring weekly-lab clashes are re-checked when you schedule.)</span></div>}

      <div className="mt-3"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><input className={inputCls} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></div>
    </Window>
  );
}
