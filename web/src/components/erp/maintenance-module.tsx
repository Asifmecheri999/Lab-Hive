"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

type Row = Record<string, unknown>;
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString()} AED`;
const fmtDate = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString() : "—");
const isPast = (d: unknown) => !!d && new Date(String(d)).getTime() < Date.now();
const fileUrl = (u: string) => (u && u.startsWith("/") ? `${API_URL}${u}` : u);
const logYear = (l: Row) => { const d = l.dueDate ?? l.createdAt ?? l.nextDueDate; return d ? new Date(String(d)).getFullYear() : 0; };
// A DONE log is finished — never overdue or upcoming. Only open logs flag overdue/upcoming.
const isOverdueLog = (l: Row) => { if (String(l.status ?? "NOT_STARTED") === "DONE") return false; return isPast(l.dueDate) || isPast(l.nextDueDate); };
// "Soon" = within one month from now (and not yet past). Upcoming = a due/next-due date falling in that window.
const isSoon = (d: unknown) => { if (!d) return false; const t = new Date(String(d)).getTime(); const now = Date.now(); return t >= now && t - now <= 31 * 24 * 3600 * 1000; };
const isUpcomingLog = (l: Row) => { if (String(l.status ?? "NOT_STARTED") === "DONE") return false; return isSoon(l.dueDate) || isSoon(l.nextDueDate); };
const DAY_MS = 24 * 3600 * 1000;
const overdueRef = (l: Row) => (isPast(l.nextDueDate) ? l.nextDueDate : (String(l.status ?? "NOT_STARTED") !== "DONE" && isPast(l.dueDate) ? l.dueDate : null));
const upcomingRef = (l: Row) => (isSoon(l.dueDate) ? l.dueDate : (isSoon(l.nextDueDate) ? l.nextDueDate : null));
const daysOverdue = (d: unknown) => Math.max(1, Math.floor((Date.now() - new Date(String(d)).getTime()) / DAY_MS));
const daysUntil = (d: unknown) => Math.max(0, Math.ceil((new Date(String(d)).getTime() - Date.now()) / DAY_MS));

const LOG_STATUS: Record<string, { l: string; c: string }> = {
  NOT_STARTED: { l: "Not started", c: "bg-gray-100 text-gray-600" },
  IN_PROGRESS: { l: "In progress", c: "bg-blue-100 text-blue-700" },
  DONE: { l: "Done", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
};
type Doc = { label: string; url: string };
type Inv = { id: string; name: string; maintenanceRequired?: boolean; calibrationRequired?: boolean; patRequired?: boolean };
type Vendor = { id: string; name: string };
type Person = { name: string };

// All maintenance is one kind of record; the type is just a tag on the log.
const TYPE_META: Record<string, { label: string; bar: string; defaultMode: string }> = {
  AMC: { label: "AMC", bar: "#8b5cf6", defaultMode: "OUTSOURCE" },
  SERVICE: { label: "Service", bar: "#00C9A7", defaultMode: "" },
  REPAIR: { label: "Repair", bar: "#ef4444", defaultMode: "" },
  CALIBRATION: { label: "Calibration", bar: "#f59e0b", defaultMode: "" },
  PREVENTIVE: { label: "Preventive", bar: "#2563eb", defaultMode: "" },
  PAT: { label: "PAT", bar: "#16a34a", defaultMode: "" },
};
const TYPE_LIST = ["AMC", "SERVICE", "PREVENTIVE", "REPAIR", "CALIBRATION", "PAT"];
const typeMeta = (t: string) => TYPE_META[t] ?? { label: t || "Log", bar: "#64748b", defaultMode: "" };

function DocsUploader({ token, value, onChange, folder = "maintenance" }: { token: string; value: Doc[]; onChange: (v: Doc[]) => void; folder?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function upload(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", folder); fd.append("id", "log");
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const d = await r.json(); onChange([...value, { label: file.name, url: String(d.url ?? "") }]); } else setErr("Upload failed — is R2 enabled?");
  }
  return (
    <div>
      <label className="inline-block cursor-pointer select-none rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">{busy ? "Uploading…" : "📎 Attach document"}<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></label>
      {value.length > 0 && (
        <div className="mt-2 space-y-1">
          {value.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs">
              <a href={fileUrl(d.url)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">📎 {d.label}</a>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-red-600 hover:underline">remove</button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

export function MaintenanceModule({ token }: { token: string; role: string }) {
  const [inv, setInv] = useState<Inv[]>([]);
  const [users, setUsers] = useState<Person[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [logs, setLogs] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "overdue">("all");
  const [sel, setSel] = useState<Inv | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [toast, setToast] = useState("");
  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const loadLogs = useCallback(async () => {
    const r = await api("/api/maintenance/logs");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    if (r.ok) setLogs(await r.json());
  }, [api]);
  useEffect(() => {
    api("/api/inventory").then((r) => { if (r.ok) r.json().then(setInv); }).catch(() => {});
    api("/api/maintenance/staff").then((r) => { if (r.ok) r.json().then((u: Person[]) => setUsers(u)); }).catch(() => {});
    api("/api/vendors").then((r) => { if (r.ok) r.json().then((v: Vendor[]) => setVendors(v)); }).catch(() => {});
    loadLogs();
  }, [api, loadLogs]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  async function exportXlsx() {
    try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const cols = [
      { header: "Equipment", key: "equip", width: 26 }, { header: "Type", key: "type", width: 14 },
      { header: "Status", key: "status", width: 14 }, { header: "Description", key: "desc", width: 34 },
      { header: "Due / Repair date", key: "due", width: 16 }, { header: "Next due date", key: "next", width: 16 },
      { header: "In-house / Outsource", key: "mode", width: 18 }, { header: "Assigned to / Vendor", key: "by", width: 20 },
      { header: "Cost (AED)", key: "cost", width: 12 }, { header: "Notes", key: "notes", width: 34 }, { header: "Logged", key: "logged", width: 14 },
    ];
    const d = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : "");
    const nameOf = (l: Row) => (l.item as { name?: string })?.name ?? inv.find((i) => i.id === String(l.itemId))?.name ?? "—";
    const toRow = (l: Row) => ({ equip: nameOf(l), type: typeMeta(String(l.type)).label, status: LOG_STATUS[String(l.status ?? "NOT_STARTED")]?.l ?? String(l.status ?? ""), desc: String(l.description ?? ""), due: d(l.dueDate), next: d(l.nextDueDate), mode: l.mode === "INHOUSE" ? "In-house" : l.mode === "OUTSOURCE" ? "Outsource" : "", by: String(l.performedBy ?? ""), cost: l.cost != null && l.cost !== "" ? Number(l.cost) : "", notes: String(l.notes ?? ""), logged: d(l.createdAt) });
    const sheets = [
      { name: "All", rows: logs },
      { name: "Overdue", rows: logs.filter(isOverdueLog) },
      { name: "Upcoming", rows: logs.filter(isUpcomingLog) },
      { name: "Log History", rows: logs.filter((l) => String(l.status) === "DONE") },
    ];
    for (const s of sheets) {
      const ws = wb.addWorksheet(s.name);
      ws.columns = cols;
      const hr = ws.getRow(1); hr.height = 22;
      hr.eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1628" } }; cell.alignment = { vertical: "middle", horizontal: "left" }; cell.border = { bottom: { style: "thin", color: { argb: "FF00C9A7" } } }; });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      for (const l of s.rows) ws.addRow(toRow(l));
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "labsynch-maintenance.xlsx"; a.click(); URL.revokeObjectURL(url);
    } catch (e) { flash(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`); }
  }

  const byItem: Record<string, Row[]> = {};
  for (const l of logs) { const k = String(l.itemId); (byItem[k] ??= []).push(l); }
  const ql = q.trim().toLowerCase();
  const equip = inv.filter((i) => (i.maintenanceRequired || i.calibrationRequired || i.patRequired || (byItem[i.id]?.length))
    && (!ql || i.name.toLowerCase().includes(ql))
    && (filter === "all" || (byItem[i.id] ?? []).some(filter === "overdue" ? isOverdueLog : isUpcomingLog)));
  const overdueEquip = inv.filter((i) => (byItem[i.id] ?? []).some(isOverdueLog)).length;
  const upcomingEquip = inv.filter((i) => (byItem[i.id] ?? []).some(isUpcomingLog)).length;
  const YEAR = new Date().getFullYear();

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#0A1628]">Maintenance</h1>
        <p className="text-sm text-gray-500">One equipment, one place — AMC, service, preventive, repair, calibration &amp; PAT logs and history</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search equipment…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
        <button onClick={loadLogs} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => setFilter("all")} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === "all" ? "border-[#0A1628] bg-[#0A1628] text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>📋 All</button>
          <button onClick={() => setFilter("upcoming")} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === "upcoming" ? "border-amber-500 bg-amber-500 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>🔔 Upcoming{upcomingEquip ? ` (${upcomingEquip})` : ""}</button>
          <button onClick={() => setFilter("overdue")} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === "overdue" ? "border-red-600 bg-red-600 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>⚠ Overdue{overdueEquip ? ` (${overdueEquip})` : ""}</button>
          <Button variant="ghost" onClick={exportXlsx}>⭳ Export Excel</Button>
          <Button onClick={() => setCreating(true)}>+ Create log</Button>
        </div>
      </div>

      {equip.length === 0 ? <p className="text-gray-400">No equipment flagged for maintenance, calibration or PAT yet — set the flags on an item in Inventory.</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {equip.map((it) => {
            const its = byItem[it.id] ?? [];
            const active = its.filter((l) => String(l.status ?? "NOT_STARTED") !== "DONE");
            const done = its.length - active.length;
            const odLogs = its.filter(isOverdueLog);
            const upLogs = its.filter(isUpcomingLog);
            const overdue = odLogs.length > 0;
            const upcoming = !overdue && upLogs.length > 0;
            const odDays = overdue ? Math.max(...odLogs.map((l) => daysOverdue(overdueRef(l)))) : 0;
            const upDays = upcoming ? Math.min(...upLogs.map((l) => daysUntil(upcomingRef(l)))) : 0;
            const flags = [it.maintenanceRequired && "Maintenance", it.calibrationRequired && "Calibration", it.patRequired && "PAT"].filter(Boolean) as string[];
            const yr = its.filter((l) => logYear(l) === YEAR);
            const yDone = yr.filter((l) => String(l.status) === "DONE").length;
            const yProg = yr.filter((l) => String(l.status) === "IN_PROGRESS").length;
            const yTodo = yr.filter((l) => String(l.status ?? "NOT_STARTED") === "NOT_STARTED").length;
            return (
              <button key={it.id} onClick={() => setSel(it)} className="select-none overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="h-2" style={{ background: overdue ? "#ef4444" : upcoming ? "#f59e0b" : "#00C9A7" }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628]">{it.name}</h3>
                    {overdue ? <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">⚠ Overdue by {odDays}d</span> : upcoming ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">🔔 Due in {upDays}d</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {flags.length ? flags.map((fl) => <span key={fl} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{fl}</span>)
                      : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Not required in Inventory — records kept</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px] font-medium">
                    <span className="text-gray-400">{YEAR}:</span>
                    <span className="rounded bg-[#00C9A7]/15 px-1.5 py-0.5 text-[#0a8d75]">{yDone} done</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">{yProg} in progress</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{yTodo} to do</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{active.length} active · {done} in history</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {sel && <EquipmentPanel item={sel} logs={byItem[sel.id] ?? []} inv={inv} users={users} vendors={vendors} api={api} token={token} onClose={() => setSel(null)} onChanged={() => loadLogs()} />}
      {creating && <LogWindow record={null} inv={inv} users={users} vendors={vendors} api={api} token={token} onClose={() => setCreating(false)} onSaved={(m) => { setCreating(false); flash(m); loadLogs(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

// ── One equipment: its logs (Active) and its History, plus create new ──
function EquipmentPanel({ item, logs, inv, users, vendors, api, token, onClose, onChanged }: { item: Inv; logs: Row[]; inv: Inv[]; users: Person[]; vendors: Vendor[]; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; onClose: () => void; onChanged: () => void }) {
  const [view, setView] = useState<"active" | "history">("active");
  const [yearF, setYearF] = useState<number | "ALL">(new Date().getFullYear());
  const [active, setActive] = useState<Row | "new" | null>(null);
  const flags = [item.maintenanceRequired && "Maintenance", item.calibrationRequired && "Calibration", item.patRequired && "PAT"].filter(Boolean) as string[];
  const inYear = (l: Row, y: number) => [l.dueDate, l.createdAt, l.nextDueDate].some((d) => !!d && new Date(String(d)).getFullYear() === y);
  const years = Array.from(new Set(logs.flatMap((l) => [l.dueDate, l.createdAt, l.nextDueDate].filter(Boolean).map((d) => new Date(String(d)).getFullYear())))).sort((a, b) => b - a);
  const shown = logs.filter((l) => (view === "active" ? String(l.status ?? "NOT_STARTED") !== "DONE" : String(l.status ?? "NOT_STARTED") === "DONE") && (yearF === "ALL" || inYear(l, yearF)));

  return (
    <Window width="max-w-5xl" title={item.name} subtitle="Maintenance · calibration · PAT · repairs"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={() => setActive("new")}>+ Create new</Button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {flags.length ? flags.map((fl) => <span key={fl} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{fl} required</span>) : null}
        <select value={String(yearF)} onChange={(e) => setYearF(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="ml-auto rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700">
          <option value="ALL">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-md border border-gray-300 text-sm">
          <button onClick={() => setView("active")} className={`px-3 py-1.5 font-medium ${view === "active" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Active</button>
          <button onClick={() => setView("history")} className={`px-3 py-1.5 font-medium ${view === "history" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>History</button>
        </div>
      </div>
      {shown.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">{view === "active" ? "Nothing in progress for this equipment." : "No completed records for this period."}</p> : (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {shown.map((l) => {
            const st = String(l.status ?? "NOT_STARTED");
            const sb = LOG_STATUS[st] ?? LOG_STATUS.NOT_STARTED;
            const meta = typeMeta(String(l.type));
            const isRepair = String(l.type) === "REPAIR";
            const nextOver = st !== "DONE" && isPast(l.nextDueDate);
            const over = isOverdueLog(l);
            const up = !over && isUpcomingLog(l);
            return (
              <button key={String(l.id)} onClick={() => setActive(l)} className="select-none overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="h-2" style={{ background: over ? "#ef4444" : up ? "#f59e0b" : (st === "DONE" ? "#00C9A7" : meta.bar) }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: meta.bar }}>{meta.label}</span>
                    {over ? <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">⚠ Overdue by {daysOverdue(overdueRef(l))}d</span> : up ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">🔔 Due in {daysUntil(upcomingRef(l))}d</span> : <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${sb.c}`}>{sb.l}</span>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-[#0A1628]">{String(l.description ?? "—")}</p>
                  <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                    {l.mode || l.performedBy ? <p>{l.mode ? (l.mode === "INHOUSE" ? "In-house" : "Outsourced") : ""}{l.performedBy ? `${l.mode ? " · " : ""}${String(l.performedBy)}` : ""}</p> : null}
                    {l.dueDate ? <p>{isRepair ? "Repair date" : "Due"}: {fmtDate(l.dueDate)}</p> : null}
                    {!isRepair && l.nextDueDate ? <p className={nextOver ? "font-semibold text-red-600" : ""}>Next due: {fmtDate(l.nextDueDate)}{nextOver ? " · overdue" : ""}</p> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {active && <LogWindow record={active === "new" ? null : active} defaultItemId={item.id} inv={inv} users={users} vendors={vendors} api={api} token={token} onClose={() => setActive(null)} onSaved={() => { setActive(null); onChanged(); }} />}
    </Window>
  );
}


function LogWindow({ record, inv, users, vendors, api, token, defaultItemId, defaultType, onClose, onSaved }: {
  record: Row | null; inv: Inv[]; users: Person[]; vendors: Vendor[]; api: (p: string, i?: RequestInit) => Promise<Response>; token: string;
  defaultItemId?: string; defaultType?: string; onClose: () => void; onSaved: (m: string) => void;
}) {
  const isNew = record === null;
  const dft = defaultType ?? "SERVICE";
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const dis = !editing;
  const [f, setF] = useState<Row>(() => record ? { ...record } : { itemId: defaultItemId ?? "", type: dft, status: "NOT_STARTED", mode: typeMeta(dft).defaultMode, dueDate: "", nextDueDate: "" });
  const [docs, setDocs] = useState<Doc[]>(() => { try { return JSON.parse(String(record?.documents ?? "[]")); } catch { return []; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const ftype = String(f.type ?? "SERVICE");
  const isOutsource = String(f.mode) === "OUTSOURCE";
  const isRepair = ftype === "REPAIR";
  const lockItem = !isNew || !!defaultItemId;
  const selItem = inv.find((i) => i.id === f.itemId) as Row | undefined;
  const invDocs = selItem
    ? ([["riskAssessmentUrl", "Risk assessment"], ["safetyOperatingProcedureUrl", "Safety operating procedure"], ["standardOperatingProcedureUrl", "Standard operating procedure"], ["equipmentManualUrl", "Equipment manual"], ["experimentManualUrl", "Experiment manual"], ["maintenanceLogUrl", "Maintenance log"], ["pictureUrl", "Image"]] as const)
        .map(([k, l]) => ({ url: String(selItem[k] ?? ""), label: l })).filter((d) => d.url)
    : [];

  async function save() {
    if (!f.itemId || !f.description || !f.dueDate) { setErr(`Equipment, description and ${isRepair ? "repair date" : "due date"} are required`); return; }
    setBusy(true); setErr("");
    const body = JSON.stringify({ ...f, type: ftype, documents: docs, nextDueDate: isRepair ? null : f.nextDueDate });
    const r = isNew ? await api("/api/maintenance/logs", { method: "POST", body })
      : await api(`/api/maintenance/logs/${record!.id}`, { method: "PUT", body });
    setBusy(false);
    if (r.ok) onSaved(isNew ? "Logged" : "Saved"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }

  async function del() {
    if (!confirm("Delete this log? This cannot be undone.")) return;
    setBusy(true); setErr("");
    const r = await api(`/api/maintenance/logs/${record!.id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onSaved("Deleted"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Delete failed"); }
  }

  const st = String(f.status ?? "NOT_STARTED");
  return (
    <Window width="max-w-5xl" title={isNew ? `New ${typeMeta(ftype).label} log` : ((record!.item as { name?: string })?.name ?? typeMeta(ftype).label)} subtitle={editing ? "Editing" : `${typeMeta(ftype).label} · ${LOG_STATUS[st]?.l ?? st}`}
      onClose={onClose}
      footer={<>
        {!isNew && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Save" : "Update"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Type *</label><select className={inputCls} disabled={dis} value={ftype} onChange={(e) => set("type", e.target.value)}>{TYPE_LIST.map((t) => <option key={t} value={t}>{typeMeta(t).label}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Status</label><select className={inputCls} disabled={dis} value={st} onChange={(e) => set("status", e.target.value)}>{Object.keys(LOG_STATUS).map((s) => <option key={s} value={s}>{LOG_STATUS[s].l}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Equipment *</label><select className={inputCls} disabled={dis || lockItem} value={String(f.itemId ?? "")} onChange={(e) => set("itemId", e.target.value)}><option value="">— select —</option>{inv.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Description *</label><textarea rows={2} className={inputCls} disabled={dis} value={String(f.description ?? "")} onChange={(e) => set("description", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">{isRepair ? "Repair date *" : "Due date *"}</label><input type="date" className={inputCls} disabled={dis} value={String(f.dueDate ?? "").slice(0, 10)} onChange={(e) => set("dueDate", e.target.value)} /></div>
        {!isRepair && <div><label className="mb-1 block text-xs font-medium text-gray-600">Next due date</label><input type="date" className={inputCls} disabled={dis} value={String(f.nextDueDate ?? "").slice(0, 10)} onChange={(e) => set("nextDueDate", e.target.value)} /></div>}
        <div><label className="mb-1 block text-xs font-medium text-gray-600">In-house / Outsource</label><select className={inputCls} disabled={dis} value={String(f.mode ?? "")} onChange={(e) => set("mode", e.target.value)}><option value="">— select —</option><option value="INHOUSE">In-house</option><option value="OUTSOURCE">Outsource</option></select></div>
        {isOutsource ? (
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Vendor</label><select className={inputCls} disabled={dis} value={String(f.performedBy ?? "")} onChange={(e) => set("performedBy", e.target.value)}><option value="">— select vendor —</option>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}{String(f.performedBy ?? "") !== "" && !vendors.some((v) => v.name === f.performedBy) && <option value={String(f.performedBy)}>{String(f.performedBy)}</option>}</select></div>
        ) : (
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Assigned to (in-house)</label><select className={inputCls} disabled={dis} value={String(f.performedBy ?? "")} onChange={(e) => set("performedBy", e.target.value)}><option value="">— select —</option>{users.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}{String(f.performedBy ?? "") !== "" && !users.some((u) => u.name === f.performedBy) && <option value={String(f.performedBy)}>{String(f.performedBy)}</option>}</select></div>
        )}
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Cost (AED)</label><input type="number" className={inputCls} disabled={dis} value={String(f.cost ?? "")} onChange={(e) => set("cost", e.target.value)} /></div>
        <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" disabled={dis} checked={f.includeInOpex !== false} onChange={(e) => set("includeInOpex", e.target.checked)} /> Add cost to Finance (OPEX) once completed</label></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">File link (optional)</label><input className={inputCls} disabled={dis} value={String(f.fileUrl ?? "")} onChange={(e) => set("fileUrl", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes (work done · changes made)</label><textarea rows={2} className={inputCls} disabled={dis} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">New report / records (reports · quotes · certificates)</label>{editing ? <DocsUploader token={token} value={docs} onChange={setDocs} /> : (docs.length ? <div className="space-y-1">{docs.map((d, i) => <a key={i} href={fileUrl(d.url)} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-[#0a8d75] hover:underline">📎 {d.label}</a>)}</div> : <p className="text-xs text-gray-400">None</p>)}</div>
        {invDocs.length > 0 && <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Records from inventory (reference)</label><div className="space-y-1">{invDocs.map((d, i) => <a key={i} href={fileUrl(d.url)} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-[#0a8d75] hover:underline">📎 {d.label}</a>)}</div></div>}
      </div>
    </Window>
  );
}

