"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { ItemLines, linesCost, lineFromApi, type ItemLine, type Inv } from "./item-lines";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"]; // students/faculty are read-only (see their own)
type Row = Record<string, unknown>;
type Lab = { id: string; name: string };
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString()} AED`;
export const ACTIVITY_KINDS = [
  { v: "RESEARCH", l: "Research" }, { v: "PROJECT", l: "Project" }, { v: "COURSEWORK", l: "Coursework requirement" },
  { v: "MINI_PROJECT", l: "Mini project" }, { v: "CLUB", l: "Club" }, { v: "OTHER", l: "Other" },
];
const kindLabel = (v: string) => ACTIVITY_KINDS.find((k) => k.v === v)?.l ?? v;
export const USER_TYPES = [
  { v: "FACULTY", l: "Faculty" }, { v: "STUDENT", l: "Student" }, { v: "RESEARCHER", l: "Researcher" },
  { v: "PHD", l: "PhD student" }, { v: "MASTERS", l: "Masters student" }, { v: "OTHER", l: "Other" },
];
type Fac = { name: string; email?: string | null };
const kindColor: Record<string, string> = { RESEARCH: "#8b5cf6", PROJECT: "#2563eb", COURSEWORK: "#00C9A7", MINI_PROJECT: "#0ea5e9", CLUB: "#f59e0b", OTHER: "#64748b" };
// Date-based lifecycle state (or Finished when closed).
function activityState(a: Row): { label: string; cls: string } {
  if (String(a.status) === "COMPLETED") return { label: "Finished", cls: "bg-gray-100 text-gray-600" };
  const today = new Date().toISOString().slice(0, 10);
  const start = a.startDate ? String(a.startDate).slice(0, 10) : "";
  const end = a.endDate ? String(a.endDate).slice(0, 10) : "";
  const days = (to: string) => Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000);
  if (start && start > today) return { label: `Starts in ${days(start)}d`, cls: "bg-blue-100 text-blue-700" };
  if (end) { const d = days(end); if (d < 0) return { label: `Overdue ${-d}d`, cls: "bg-red-100 text-red-700" }; if (d === 0) return { label: "Due today", cls: "bg-amber-100 text-amber-800" }; return { label: `Completes in ${d}d`, cls: "bg-[#00C9A7]/15 text-[#0a8d75]" }; }
  return { label: "In progress", cls: "bg-[#00C9A7]/15 text-[#0a8d75]" };
}

export function ActivitiesModule({ token, role }: { token: string; role: string }) {
  const canWrite = WRITE.includes(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [kindF, setKindF] = useState("ALL");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<"mine" | "supervising">("mine");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/activities");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
      api("/api/schedule/labs").then((l) => { if (l.ok) l.json().then(setLabs); }).catch(() => {});
      api("/api/inventory").then((i) => { if (i.ok) i.json().then(setInv); }).catch(() => {});
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const shown = rows.filter((r) => kindF === "ALL" || r.kind === kindF);
  // Split into the user's own activities vs the ones they supervise.
  // Lab team see all (relation === "all") — those land under the first tab.
  const supervised = shown.filter((a) => a.relation === "supervisor");
  const owned = shown.filter((a) => a.relation !== "supervisor");
  const displayed = tab === "supervising" ? supervised : owned;
  const mineLabel = canWrite ? "All Activities" : "My Activities";
  const TabBtn = ({ id, label, n }: { id: "mine" | "supervising"; label: string; n: number }) => (
    <button onClick={() => setTab(id)} className={`select-none rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
      {label} <span className={`ml-0.5 text-sm font-bold ${tab === id ? "text-[#00C9A7]" : "text-gray-400"}`}>({n})</span>
    </button>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Activities</h1><p className="text-sm text-gray-500">Research, projects, coursework & clubs — with required items and consumable cost</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={kindF} onChange={(e) => setKindF(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700">
            <option value="ALL">All types</option>{ACTIVITY_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
          <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
          {canWrite && <Button onClick={() => setActive("new")}>+ New Activity</Button>}
        </div>
      </div>

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">No activities yet. {canWrite && "Click “+ New Activity”."}</p> : (() => {
          const tile = (a: Row) => { const stt = activityState(a); return (
            <button key={String(a.id)} onClick={() => setActive(a)} className="flex w-full flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2 w-full shrink-0" style={{ background: "#00C9A7" }} />
              <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: kindColor[String(a.kind)] ?? "#64748b" }}>{kindLabel(String(a.kind))}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stt.cls}`}>{stt.label}</span>
                </div>
                <h3 className="mt-2 font-semibold text-[#0A1628]">{String(a.title)}</h3>
                <p className="mt-1 text-xs text-gray-500">{[a.userName || a.researcher, a.supervisor, (a.lab as Lab)?.name].filter(Boolean).join(" · ") || "—"}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-gray-500">{(a.items as unknown[])?.length ?? 0} items</span>
                  <span className="rounded-full bg-[#00C9A7]/15 px-2.5 py-0.5 font-semibold text-[#0a8d75]">{money(Number(a.consumableCost ?? 0))}</span>
                </div>
              </div>
            </button>
          ); };
          return (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
                <TabBtn id="mine" label={mineLabel} n={owned.length} />
                {supervised.length > 0 && <TabBtn id="supervising" label="Supervising" n={supervised.length} />}
              </div>
              {displayed.length === 0
                ? <p className="text-gray-400">{tab === "supervising" ? "Not supervising any activities." : "None."}</p>
                : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{displayed.map(tile)}</div>}
            </>
          );
        })()}

      {active && <ActivityWindow record={active === "new" ? null : active} labs={labs} inv={inv} api={api} canWrite={canWrite}
        onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

export function ActivityWindow({ record, seed, labs, inv, api, canWrite, onClose, onSaved }: {
  record: Row | null; seed?: Row; labs: Lab[]; inv: Inv[]; api: (p: string, i?: RequestInit) => Promise<Response>; canWrite: boolean;
  onClose: () => void; onSaved: (m: string, id?: string) => void;
}) {
  const isNew = record === null;
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const dis = !editing;
  const [f, setF] = useState<Row>(() => record ? { ...record } : { kind: "PROJECT", ...(seed ?? {}) });
  const initLines = () => ((((record?.items as Row[]) ?? (seed?.items as Row[]) ?? [])).map(lineFromApi));
  const [lines, setLines] = useState<ItemLine[]>(initLines);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [faculties, setFaculties] = useState<Fac[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [showGroup, setShowGroup] = useState(false);
  const [issList, setIssList] = useState<Row[]>([]);
  const [issQ, setIssQ] = useState("");
  const [issOpen, setIssOpen] = useState(false);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const issItemNames = (s: Row) => ((s.items as Row[]) ?? []).map((it) => (it.item as { name?: string })?.name || it.customName).filter(Boolean).join(" ");
  const issMatches = issList.filter((s) => {
    const q = issQ.trim().toLowerCase();
    if (!q) return true;
    return [s.studentName, s.studentEmail, s.groupName, s.courseCode, s.school, s.department, (s.activity as { title?: string })?.title, issItemNames(s)].filter(Boolean).join(" ").toLowerCase().includes(q);
  }).slice(0, 25);

  useEffect(() => {
    api("/api/faculty").then((r) => { if (r.ok) r.json().then(setFaculties); }).catch(() => {});
    api("/api/org").then((r) => { if (r.ok) r.json().then((o: { schools?: { name: string }[]; departments?: { name: string }[] }) => { setSchools((o.schools ?? []).map((s) => s.name)); setDepartments((o.departments ?? []).map((d) => d.name)); }); }).catch(() => {});
    api("/api/issuances").then((r) => { if (r.ok) r.json().then(setIssList); }).catch(() => {});
  }, [api]);

  // Pull borrower details AND items from the chosen issuance. Items land in the read-only list (sourced from the issuance).
  function pullFromIssuance(id: string) {
    const s = issList.find((x) => String(x.id) === id);
    if (!s) return;
    setF((cur) => ({ ...cur,
      title: cur.title || `${String(s.studentName || s.groupName || "Borrowal")} activity`,
      userName: cur.userName || s.studentName || "", userEmail: cur.userEmail || s.studentEmail || "", userType: cur.userType || "STUDENT",
      supervisor: cur.supervisor || s.supervisorName || "", supervisorEmail: cur.supervisorEmail || s.supervisorEmail || "",
      school: cur.school || s.school || "", department: cur.department || s.department || "", courseCode: cur.courseCode || s.courseCode || "",
      groupInfo: cur.groupInfo || s.groupInfo || "", startDate: cur.startDate || s.borrowDate || "", endDate: cur.endDate || s.returnDate || "",
    }));
    // Replace — show only the selected issuance's items (don't accumulate across different issuances).
    const items = (s.items as Row[]) ?? [];
    setLines(items.map(lineFromApi));
  }

  // Supervisor is picked from the Faculty register → email auto-fills.
  function pickSupervisor(name: string) {
    const fac = faculties.find((x) => x.name === name);
    setF((s) => ({ ...s, supervisor: name, supervisorEmail: fac?.email || s.supervisorEmail || "" }));
  }

  async function save() {
    if (!f.title) { setErr("Title is required"); return; }
    setErr(""); setBusy(true);
    const payload = { ...f, items: lines };
    const res = isNew ? await api("/api/activities", { method: "POST", body: JSON.stringify(payload) })
      : await api(`/api/activities/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    setBusy(false);
    if (res.ok) { const r = await res.json().catch(() => ({})); onSaved(isNew ? "Activity created" : "Saved", r.id); }
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function del() {
    if (!confirm("Delete this activity?")) return;
    const res = await api(`/api/activities/${record!.id}`, { method: "DELETE" });
    if (res.ok) onSaved("Deleted"); else setErr("Delete failed");
  }
  async function setFinished(s: string) {
    if (s === "COMPLETED" && !confirm("Mark this activity as finished?")) return;
    setBusy(true); setErr("");
    const res = await api(`/api/activities/${record!.id}`, { method: "PUT", body: JSON.stringify({ ...f, items: lines, status: s }) });
    setBusy(false);
    if (res.ok) onSaved(s === "COMPLETED" ? "Activity finished" : "Activity reopened"); else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Failed"); }
  }

  return (
    <Window width="max-w-4xl" title={isNew ? "New Activity" : String(f.title ?? "Activity")} subtitle={isNew ? "Create" : editing ? "Editing" : kindLabel(String(f.kind))}
      onClose={onClose}
      footer={<>
        {!isNew && canWrite && editing && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        {!isNew && canWrite && !editing && String(f.status) !== "COMPLETED" && <Button variant="ghost" onClick={() => setFinished("COMPLETED")} disabled={busy}>Mark finished</Button>}
        {!isNew && canWrite && !editing && String(f.status) === "COMPLETED" && <Button variant="ghost" onClick={() => setFinished("ACTIVE")} disabled={busy}>Reopen</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setLines(initLines()); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!isNew && (() => { const stt = activityState(f); return <div className="mb-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${stt.cls}`}>{stt.label}</span></div>; })()}
      {editing && issList.length > 0 && (
        <div className="mb-4 rounded-lg bg-gray-50 p-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">Add from issuance <span className="font-normal text-gray-400">(search by student, email, course, project or item — pulls borrower details + items)</span></label>
          <div className="relative">
            <input className={inputCls} placeholder="Search issuances…" value={issQ} onChange={(e) => { setIssQ(e.target.value); setIssOpen(true); }} onFocus={() => setIssOpen(true)} onBlur={() => setTimeout(() => setIssOpen(false), 150)} />
            {issOpen && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {issMatches.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">No matching issuances.</p> : issMatches.map((s) => {
                  const its = (s.items as Row[])?.length ?? 0;
                  const det = [String(s.studentName || s.groupName || "Borrower"), s.studentEmail ? String(s.studentEmail) : "", s.courseCode ? String(s.courseCode) : "", (s.activity as { title?: string })?.title, s.borrowDate ? `borrowed ${String(s.borrowDate)}` : "", its ? `${its} item${its === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
                  return <button type="button" key={String(s.id)} onMouseDown={() => { pullFromIssuance(String(s.id)); setIssQ(""); setIssOpen(false); }} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50">{det}</button>;
                })}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Type</label><select className={inputCls} disabled={dis} value={String(f.kind ?? "PROJECT")} onChange={(e) => set("kind", e.target.value)}>{ACTIVITY_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Title *</label><input className={inputCls} disabled={dis} value={String(f.title ?? "")} onChange={(e) => set("title", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Name of the user</label><input className={inputCls} disabled={dis} value={String(f.userName ?? f.researcher ?? "")} onChange={(e) => set("userName", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Type of user</label><select className={inputCls} disabled={dis} value={String(f.userType ?? "")} onChange={(e) => set("userType", e.target.value)}><option value="">— select —</option>{USER_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">User email</label><input className={inputCls} disabled={dis} value={String(f.userEmail ?? "")} onChange={(e) => set("userEmail", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Course code</label><input className={inputCls} disabled={dis} value={String(f.courseCode ?? "")} onChange={(e) => set("courseCode", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Supervisor (faculty)</label><input list="lh-act-fac" className={inputCls} disabled={dis} value={String(f.supervisor ?? "")} onChange={(e) => pickSupervisor(e.target.value)} placeholder="Pick or type" /><datalist id="lh-act-fac">{faculties.map((ff) => <option key={ff.name} value={ff.name} />)}</datalist></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Supervisor email</label><input className={inputCls} disabled={dis} value={String(f.supervisorEmail ?? "")} onChange={(e) => set("supervisorEmail", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">School</label><select className={inputCls} disabled={dis} value={String(f.school ?? "")} onChange={(e) => set("school", e.target.value)}><option value="">— select —</option>{schools.map((s) => <option key={s} value={s}>{s}</option>)}{String(f.school ?? "") !== "" && !schools.includes(String(f.school)) && <option value={String(f.school)}>{String(f.school)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} disabled={dis} value={String(f.department ?? "")} onChange={(e) => set("department", e.target.value)}><option value="">— select —</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{String(f.department ?? "") !== "" && !departments.includes(String(f.department)) && <option value={String(f.department)}>{String(f.department)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Location</label><select className={inputCls} disabled={dis} value={String(f.labId ?? "")} onChange={(e) => set("labId", e.target.value)}><option value="">— select —</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Additional Requirement</label><input className={inputCls} disabled={dis} value={String(f.facilities ?? "")} onChange={(e) => set("facilities", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Start date</label><input type="date" className={inputCls} disabled={dis} value={String(f.startDate ?? "").slice(0, 10)} onChange={(e) => set("startDate", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">End date</label><input type="date" className={inputCls} disabled={dis} value={String(f.endDate ?? "").slice(0, 10)} onChange={(e) => set("endDate", e.target.value)} /></div>
        <div className="sm:col-span-2">
          {(String(f.groupInfo ?? "") !== "" || showGroup) ? (
            <><label className="mb-1 block text-xs font-medium text-gray-600">Group info</label><textarea rows={2} className={inputCls} disabled={dis} value={String(f.groupInfo ?? "")} onChange={(e) => set("groupInfo", e.target.value)} placeholder="Group members / details — shared with the linked issuance" /></>
          ) : editing ? (
            <button type="button" onClick={() => setShowGroup(true)} className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">+ Add group info if required</button>
          ) : null}
        </div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><textarea rows={2} className={inputCls} disabled={dis} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>

      <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Items <span className="font-normal text-gray-400">(from the issuance)</span></h3>
      </div>
      <p className="mb-2 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">🔗 Items are read-only here and come from an <span className="font-semibold">Issuance</span> — use “Add from issuance” above to search a borrower and pull in their items. Manage items, quantities and “used up” in the issuance, so stock and OPEX never drift.</p>
      <ItemLines lines={lines} setLines={setLines} inv={inv} editing={false} />

      <div className="mt-4 rounded-lg bg-[#0A1628] p-4 text-white">
        <div className="flex items-center justify-between text-sm"><span>Consumable cost incurred</span><span className="font-bold text-[#00C9A7]">{money(linesCost(lines, inv))}</span></div>
        <p className="mt-2 text-[11px] text-gray-400">Only items marked “used” count. Inventory items use their stored price; custom (Other) items use the price you type.</p>
      </div>
    </Window>
  );
}
