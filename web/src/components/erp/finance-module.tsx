"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { AnalyticsModule } from "./analytics-module";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const LAB_WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50";
type Row = Record<string, unknown>;

const AED = (n: unknown) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED`;
const OPEX_CATS = ["consumables", "maintenance", "utilities", "transport", "shipping", "services", "activities", "research", "coursework", "other"];
const fileHref = (u: string) => (u && u.startsWith("/") ? `${API_URL}${u}` : u);
const PROC_CATS = ["Equipment", "Tool", "Consumable", "PPE", "Software", "Service", "Other"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PIE = ["#00C9A7", "#2563eb", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#14b8a6", "#64748b", "#ec4899", "#84cc16"];
const yearOf = (d: unknown) => new Date(String(d)).getFullYear();
// Fiscal year helpers. fy = the calendar year the fiscal year STARTS in (so startMonth=1 → plain calendar year).
const fyOf = (d: unknown, sm: number) => { const dt = new Date(String(d)); return (dt.getMonth() + 1) >= sm ? dt.getFullYear() : dt.getFullYear() - 1; };
const fyStart = (fy: number, sm: number) => new Date(fy, sm - 1, 1);
const fyEnd = (fy: number, sm: number) => new Date(fy + 1, sm - 1, 1); // exclusive end ≈ fiscal year-end
const fyLabel = (fy: number, sm: number) => (sm === 1 ? String(fy) : `${fy}/${String((fy + 1) % 100).padStart(2, "0")}`);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoDate = (d: unknown) => { try { return new Date(String(d)).toISOString().slice(0, 10); } catch { return ""; } };
const niceDate = (d: unknown) => { try { return new Date(String(d)).toLocaleDateString(); } catch { return ""; } };
const THIS_YEAR = new Date().getFullYear();

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
function depreciate(a: Row, asOf: Date) {
  const cost = Number(a.cost) || 0;
  const life = Number(a.usefulLifeYears) || 1;
  const annual = cost / life;
  const elapsed = Math.max(0, (asOf.getTime() - new Date(String(a.purchaseDate)).getTime()) / YEAR_MS);
  let accum = Math.min(annual * elapsed, cost);
  if (a.disposed) accum = cost;
  return { annual, accum, bookValue: Math.max(0, cost - accum), remaining: a.disposed ? 0 : Math.max(0, life - elapsed) };
}

// ── styled Excel helpers ──
const NAVY = "FF0A1628", TEAL = "FF00C9A7", STRIPE = "FFF1F5F9";
function addSheet(wb: import("exceljs").Workbook, title: string, headers: { label: string; width?: number }[], rows: unknown[][], moneyCols: number[] = []) {
  const ws = wb.addWorksheet(title);
  ws.columns = headers.map((h) => ({ width: h.width ?? 16 }));
  const hr = ws.getRow(1); hr.height = 20;
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h.label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.border = { bottom: { style: "thin", color: { argb: TEAL } } };
    c.alignment = { vertical: "middle" };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  rows.forEach((r, idx) => {
    const row = ws.addRow(r as never[]);
    if (idx % 2) row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } }; });
    moneyCols.forEach((ci) => { row.getCell(ci).numFmt = "#,##0.00"; });
  });
  return ws;
}
function downloadBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function PieChart({ data }: { data: { label: string; value: number }[] }) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((t, d) => t + d.value, 0);
  if (total <= 0) return <p className="text-xs text-gray-400">No spend to chart yet.</p>;
  const r = 70, cx = 80, cy = 80; let angle = -90;
  const arcs = slices.map((d, i) => {
    const frac = d.value / total; const start = angle, end = angle + frac * 360; angle = end;
    const sr = (start * Math.PI) / 180, er = (end * Math.PI) / 180;
    const x1 = cx + r * Math.cos(sr), y1 = cy + r * Math.sin(sr), x2 = cx + r * Math.cos(er), y2 = cy + r * Math.sin(er);
    const large = end - start > 180 ? 1 : 0;
    return { ...d, frac, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: PIE[i % PIE.length] };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0">{arcs.length === 1 ? <circle cx={cx} cy={cy} r={r} fill={arcs[0].color} /> : arcs.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}</svg>
      <div className="space-y-1.5">{arcs.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-sm" style={{ background: s.color }} /><span className="font-medium capitalize text-[#0A1628]">{s.label}</span><span className="text-gray-500">{AED(s.value)} · {Math.round(s.frac * 100)}%</span></div>
      ))}</div>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const bars = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...bars.map((d) => d.value));
  if (!bars.length) return <p className="text-xs text-gray-400">No spend to chart yet.</p>;
  return (
    <div className="space-y-2">
      {bars.map((d, i) => (
        <div key={i} className="text-xs">
          <div className="mb-0.5 flex items-center justify-between gap-2"><span className="font-medium capitalize text-[#0A1628]">{d.label}</span><span className="text-gray-500">{AED(d.value)}</span></div>
          <div className="h-2.5 w-full rounded-full bg-gray-100"><div className="h-2.5 rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: PIE[i % PIE.length] }} /></div>
        </div>
      ))}
    </div>
  );
}

// Multi-file uploader (receipts/invoices/quotes) — add & remove, stored as [{label,url}].
function Attachments({ token, folder, docs, onChange }: { token: string; folder: string; docs: { label: string; url: string }[]; onChange: (d: { label: string; url: string }[]) => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function upload(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", folder); fd.append("id", "new");
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const d = await r.json(); onChange([...docs, { label: file.name, url: String(d.url ?? "") }]); } else setErr("Upload failed — is R2 file storage enabled?");
  }
  return (
    <div>
      {docs.length > 0 && <div className="mb-2 space-y-1">{docs.map((d, i) => (
        <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs"><a href={fileHref(d.url)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">📎 {d.label}</a><button type="button" onClick={() => onChange(docs.filter((_, j) => j !== i))} className="text-red-600 hover:underline">remove</button></div>
      ))}</div>}
      <label className="inline-block cursor-pointer rounded-md bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-[#00C9A7] hover:brightness-110">{busy ? "Uploading…" : "📎 Attach"}<input type="file" className="hidden" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} /></label>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
const parseDocs = (raw: unknown, legacy?: unknown): { label: string; url: string }[] => {
  try { const a = JSON.parse(String(raw ?? "[]")); if (Array.isArray(a) && a.length) return a; } catch { /* fall through */ }
  return legacy ? [{ label: "Attachment", url: String(legacy) }] : [];
};

// Pie / Bar with a small toggle — used across OPEX, CAPEX, Budget and the statement.
function CategoryChart({ data, initial = "pie" }: { data: { label: string; value: number }[]; initial?: "pie" | "bar" }) {
  const [mode, setMode] = useState<"pie" | "bar">(initial);
  const chip = (on: boolean) => `rounded px-2 py-0.5 text-xs font-medium ${on ? "bg-[#0A1628] text-white" : "text-gray-500 hover:bg-gray-100"}`;
  return (
    <div>
      <div className="mb-2 flex justify-end gap-1">
        <button type="button" onClick={() => setMode("pie")} className={chip(mode === "pie")}>Pie</button>
        <button type="button" onClick={() => setMode("bar")} className={chip(mode === "bar")}>Bar</button>
      </div>
      {mode === "pie" ? <PieChart data={data} /> : <BarChart data={data} />}
    </div>
  );
}

export function FinanceModule({ token, role }: { token: string; role: string }) {
  const canWrite = LAB_WRITE.includes(role);
  const api = useCallback((p: string, i?: RequestInit) => retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const [tab, setTab] = useState<"capex" | "opex" | "budget" | "statement" | "analytics">("capex");
  const [capex, setCapex] = useState<Row[]>([]);
  const [opex, setOpex] = useState<Row[]>([]);
  const [budget, setBudget] = useState<Row[]>([]);
  const [procurement, setProcurement] = useState<Row[]>([]);
  const [fiscalStart, setFiscalStart] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/finance/capex");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCapex(await r.json());
      const [o, b, p, og] = await Promise.all([api("/api/finance/opex"), api("/api/finance/budget"), api("/api/procurement"), api("/api/org")]);
      if (o.ok) setOpex(await o.json());
      if (b.ok) setBudget(await b.json());
      if (p.ok) setProcurement(await p.json());
      if (og.ok) { const d = await og.json(); setFiscalStart(Number(d?.tenant?.fiscalYearStartMonth) || 1); }
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  async function setFiscalMonth(m: number) {
    setFiscalStart(m); // optimistic — instant, fully reversible (only changes grouping)
    const r = await api("/api/org/settings", { method: "PATCH", body: JSON.stringify({ fiscalYearStartMonth: m }) });
    if (r.ok) flash(m === 1 ? "Using calendar year" : `Fiscal year now starts in ${MONTH_NAMES[m - 1]}`); else load();
  }
  useEffect(() => { load(); }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} className={`select-none rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</button>
  );

  return (
    <div>
      <div className="mb-5"><h1 className="text-2xl font-bold text-[#0A1628]">Finance</h1><p className="text-sm text-gray-500">CAPEX, OPEX, budgets &amp; statements</p></div>
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <Tab id="capex" label="CAPEX" />
        <Tab id="opex" label="OPEX" />
        <Tab id="budget" label="Budget Planner" />
        <Tab id="statement" label="Financial Statement" />
        <Tab id="analytics" label="Analytics" />
        {role === "ADMIN" && <div className="ml-auto flex items-center gap-2 text-xs text-gray-500"><span>Fiscal year starts</span><select value={fiscalStart} onChange={(e) => setFiscalMonth(Number(e.target.value))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700" title="Instant & reversible — only changes how dates are grouped">{MONTH_NAMES.map((mn, i) => <option key={mn} value={i + 1}>{mn}{i === 0 ? " (calendar)" : ""}</option>)}</select></div>}
      </div>
      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load finance data: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p> : (
        <>
          {tab === "capex" && <CapexManager assets={capex} api={api} canWrite={canWrite} reload={load} flash={flash} fiscalStart={fiscalStart} />}
          {tab === "opex" && <OpexManager expenses={opex} api={api} canWrite={canWrite} reload={load} flash={flash} fiscalStart={fiscalStart} token={token} />}
          {tab === "budget" && <BudgetPlanner budget={budget} procurement={procurement} api={api} canWrite={canWrite} reload={load} flash={flash} token={token} />}
          {tab === "statement" && <FinancialStatement capex={capex} opex={opex} fiscalStart={fiscalStart} />}
          {tab === "analytics" && <AnalyticsModule token={token} />}
        </>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

type TabProps = { api: (p: string, i?: RequestInit) => Promise<Response>; canWrite: boolean; reload: () => void; flash: (m: string) => void };

// ───────────────────────── CAPEX ─────────────────────────
function CapexManager({ assets, api, canWrite, reload, flash, fiscalStart }: TabProps & { assets: Row[]; fiscalStart: number }) {
  const [yearF, setYearF] = useState<"ALL" | number>("ALL");
  const years = useMemo(() => Array.from(new Set(assets.map((a) => fyOf(a.purchaseDate, fiscalStart)))).sort((a, b) => b - a), [assets, fiscalStart]);
  const shown = assets.filter((a) => yearF === "ALL" || fyOf(a.purchaseDate, fiscalStart) === yearF)
    .sort((a, b) => new Date(String(b.purchaseDate)).getTime() - new Date(String(a.purchaseDate)).getTime());
  const asOf = yearF === "ALL" ? new Date() : fyEnd(yearF as number, fiscalStart);

  async function dispose(a: Row) {
    if (!confirm(`Mark “${String(a.name)}” as disposed?`)) return;
    const r = await api(`/api/finance/capex/${a.id}`, { method: "PUT", body: JSON.stringify({ disposed: true, disposedDate: new Date().toISOString() }) });
    if (r.ok) { flash("Marked disposed"); reload(); }
  }
  async function exportStatement() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const rows = shown.map((a) => { const d = depreciate(a, asOf); return [String(a.name), String(a.category ?? ""), Number(a.cost) || 0, niceDate(a.purchaseDate), Number(a.usefulLifeYears) || 0, d.annual, d.accum, d.bookValue, Math.round(d.remaining * 10) / 10, a.disposed ? "Disposed" : "Active"]; });
    const totalCost = shown.reduce((t, a) => t + (Number(a.cost) || 0), 0);
    const totalBook = shown.reduce((t, a) => t + depreciate(a, asOf).bookValue, 0);
    rows.push(["TOTAL", "", totalCost, "", "", shown.reduce((t, a) => t + depreciate(a, asOf).annual, 0), shown.reduce((t, a) => t + depreciate(a, asOf).accum, 0), totalBook, "", ""]);
    addSheet(wb,`CAPEX ${yearF}`, [{ label: "Asset", width: 28 }, { label: "Category", width: 16 }, { label: "Cost", width: 14 }, { label: "Purchase date", width: 14 }, { label: "Life (yrs)", width: 10 }, { label: "Annual dep.", width: 14 }, { label: "Accum. dep.", width: 14 }, { label: "Book value", width: 14 }, { label: "Remaining (yrs)", width: 14 }, { label: "Status", width: 12 }], rows, [3, 6, 7, 8]);
    downloadBlob(await wb.xlsx.writeBuffer(), `capex-statement-${yearF}.xlsx`, XLSX);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={String(yearF)} onChange={(e) => setYearF(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700">
          <option value="ALL">All years</option>{years.map((y) => <option key={y} value={y}>{fyLabel(y, fiscalStart)}</option>)}
        </select>
        <Button variant="ghost" onClick={exportStatement}>⬇ CAPEX statement</Button>
        <span className="ml-auto text-xs text-gray-400">Equipment comes from Inventory (set Track in Finance = CAPEX).</span>
      </div>
      {shown.length === 0 ? <p className="text-gray-400">No CAPEX assets{yearF !== "ALL" ? " for this year" : ""} yet.</p> : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-black/5">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-[#0A1628] text-white"><tr>{["Asset", "Cost", "Purchased", "Life (yrs)", "Annual dep.", "Book value", "Remaining (yrs)", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map((a) => { const d = depreciate(a, asOf); return (
                <tr key={String(a.id)} className={`hover:bg-gray-50 ${a.disposed ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2"><span className="font-medium text-[#0A1628]">{String(a.name)}</span>{a.source ? <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{a.source === "inventory" ? "Inventory" : String(a.source)}</span> : null}<div className="text-xs text-gray-400">{String(a.category ?? "")}</div></td>
                  <td className="px-3 py-2 text-gray-700">{AED(a.cost)}</td>
                  <td className="px-3 py-2 text-gray-500">{niceDate(a.purchaseDate)}</td>
                  <td className="px-3 py-2 text-gray-500">{String(a.usefulLifeYears)}</td>
                  <td className="px-3 py-2 text-gray-700">{AED(d.annual)}</td>
                  <td className="px-3 py-2 font-semibold text-[#0a8d75]">{a.disposed ? "—" : AED(d.bookValue)}</td>
                  <td className="px-3 py-2 text-gray-500">{a.disposed ? "Disposed" : `${(Math.round(d.remaining * 10) / 10)}`}</td>
                  <td className="px-3 py-2 text-right">{canWrite && !a.disposed && !a.source && <button onClick={() => dispose(a)} className="text-xs text-amber-700 hover:underline">Dispose</button>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── OPEX ─────────────────────────
function OpexManager({ expenses, api, canWrite, reload, flash, fiscalStart, token }: TabProps & { expenses: Row[]; fiscalStart: number; token: string }) {
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [yearF, setYearF] = useState<number>(fyOf(new Date(), fiscalStart));
  const [monthF, setMonthF] = useState<"ALL" | number>("ALL");
  const [catF, setCatF] = useState("ALL");
  const years = useMemo(() => Array.from(new Set([fyOf(new Date(), fiscalStart), ...expenses.map((e) => fyOf(e.date, fiscalStart))])).sort((a, b) => b - a), [expenses, fiscalStart]);
  const shown = expenses.filter((e) => fyOf(e.date, fiscalStart) === yearF && (monthF === "ALL" || new Date(String(e.date)).getMonth() === monthF) && (catF === "ALL" || String(e.category) === catF));
  const total = shown.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const byCat = OPEX_CATS.map((c) => ({ label: c, value: shown.filter((e) => e.category === c).reduce((t, e) => t + (Number(e.amount) || 0), 0) })).filter((d) => d.value > 0);
  const srcLabel = (e: Row) => e.source ? ({ use: "Pushed from Use", maintenance: "Pushed from Maintenance", experiment: "Pushed from Experiment" }[String(e.source)] ?? String(e.source)) : String(e.createdByName ?? "Manual");
  const rowDocs = (e: Row) => parseDocs(e.attachments, e.attachmentUrl);

  async function exportStatement() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const inYear = expenses.filter((e) => fyOf(e.date, fiscalStart) === yearF);
    addSheet(wb,`OPEX ${yearF}`, [{ label: "Date", width: 14 }, { label: "Category", width: 16 }, { label: "Description", width: 36 }, { label: "Amount", width: 14 }, { label: "Source", width: 22 }, { label: "Attachment", width: 14 }], inYear.map((e) => [niceDate(e.date), String(e.category), String(e.description ?? ""), Number(e.amount) || 0, srcLabel(e), rowDocs(e).length ? "Available" : ""]), [4]);
    addSheet(wb,"By category", [{ label: "Category", width: 20 }, { label: "Total", width: 16 }], OPEX_CATS.map((c) => [c, inYear.filter((e) => e.category === c).reduce((t, e) => t + (Number(e.amount) || 0), 0)]).filter((r) => Number(r[1]) > 0), [2]);
    downloadBlob(await wb.xlsx.writeBuffer(), `opex-statement-${yearF}.xlsx`, XLSX);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={yearF} onChange={(e) => setYearF(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700">{years.map((y) => <option key={y} value={y}>{fyLabel(y, fiscalStart)}</option>)}</select>
        <select value={String(monthF)} onChange={(e) => setMonthF(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"><option value="ALL">All months</option>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm capitalize text-gray-700"><option value="ALL">All categories</option>{OPEX_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <Button variant="ghost" onClick={exportStatement}>⬇ OPEX statement</Button>
        {canWrite && <div className="ml-auto"><Button onClick={() => setActive("new")}>+ Log expense</Button></div>}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-[#0A1628] p-4 text-white"><p className="text-xs text-gray-300">Total ({monthF === "ALL" ? yearF : `${MONTHS[monthF as number]} ${yearF}`})</p><p className="mt-1 text-3xl font-bold text-[#00C9A7]">{AED(total)}</p><p className="text-xs text-gray-400">{shown.length} transaction(s)</p></div>
        <div className="rounded-xl border border-gray-100 p-4 lg:col-span-2"><h3 className="mb-3 text-sm font-semibold text-[#0A1628]">Where the money went</h3><CategoryChart data={byCat} /></div>
      </div>

      {shown.length === 0 ? <p className="text-gray-400">No expenses match these filters.</p> : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-black/5">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-[#0A1628] text-white"><tr>{["Date", "Category", "Description", "Amount", "Source", "Attachments"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map((e) => { const ds = rowDocs(e); return (
                <tr key={String(e.id)} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">{niceDate(e.date)}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">{String(e.category)}</span></td>
                  <td className="px-3 py-2 text-gray-700">{String(e.description ?? "")}</td>
                  <td className="px-3 py-2 font-semibold text-[#0A1628]">{AED(e.amount)}</td>
                  <td className="px-3 py-2 text-xs"><span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500">{srcLabel(e)}</span></td>
                  <td className="px-3 py-2 text-xs">{ds.length ? ds.map((d, i) => <a key={i} href={fileHref(d.url)} target="_blank" rel="noreferrer" className="mr-2 font-medium text-[#0a8d75] hover:underline" title={d.label}>Attachment{ds.length > 1 ? ` ${i + 1}` : ""}</a>) : <span className="text-gray-400">No attachment</span>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      {active && <OpexForm record={active === "new" ? null : active} api={api} token={token} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); reload(); }} />}
    </div>
  );
}

function OpexForm({ record, api, token, onClose, onSaved }: { record: Row | null; api: TabProps["api"]; token: string; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = record === null;
  const [f, setF] = useState<Row>(() => record ? { ...record, date: isoDate(record.date) } : { category: "other", date: isoDate(new Date()) });
  const [docs, setDocs] = useState<{ label: string; url: string }[]>(() => parseDocs(record?.attachments, record?.attachmentUrl));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (f.amount == null || f.amount === "" || !f.category || !f.date) { setErr("Amount, category and date are required"); return; }
    setBusy(true); setErr("");
    const payload = { ...f, attachments: docs, attachmentUrl: docs[0]?.url ?? null };
    const res = isNew ? await api("/api/finance/opex", { method: "POST", body: JSON.stringify(payload) }) : await api(`/api/finance/opex/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    setBusy(false);
    if (res.ok) onSaved(isNew ? "Expense logged" : "Saved"); else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  return (
    <Window title={isNew ? "Log expense" : "Edit expense"} subtitle="Operational cost (transport, shipping, utilities…)" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Log" : "Save"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Amount (AED) *</label><input type="number" min={0} className={inputCls} value={f.amount === undefined ? "" : String(f.amount)} onChange={(e) => set("amount", e.target.value === "" ? "" : Number(e.target.value))} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Category *</label><select className={`${inputCls} capitalize`} value={String(f.category ?? "")} onChange={(e) => set("category", e.target.value)}>{OPEX_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Date *</label><input type="date" className={inputCls} value={String(f.date ?? "")} onChange={(e) => set("date", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Description</label><textarea rows={2} className={inputCls} value={String(f.description ?? "")} onChange={(e) => set("description", e.target.value)} placeholder="e.g. courier charge for vendor X" /></div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Receipts / invoices <span className="font-normal text-gray-400">(optional — one or more)</span></label>
          <Attachments token={token} folder="opex" docs={docs} onChange={setDocs} />
        </div>
      </div>
    </Window>
  );
}

// ───────────────────────── BUDGET ─────────────────────────
function BudgetPlanner({ budget, procurement, api, canWrite, reload, flash, token }: TabProps & { budget: Row[]; procurement: Row[]; token: string }) {
  const [yearF, setYearF] = useState<number>(THIS_YEAR);
  const [active, setActive] = useState<Row | "new" | null>(null);
  // Offer a forward range so future years can be planned even before they have any data.
  const years = useMemo(() => Array.from(new Set([THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2, THIS_YEAR + 3, THIS_YEAR + 4, ...budget.map((b) => Number(b.year)), ...procurement.map((p) => Number(p.budgetYear)).filter(Boolean)])).sort((a, b) => b - a), [budget, procurement]);
  const lines = budget.filter((b) => Number(b.year) === yearF);

  // Only real orders consume budget. Committed = qty × estimated price; Actual = invoice unit cost once received.
  const orderItems = (o: Row) => (o.items as Row[]) ?? [];
  const STATUS_OK = new Set(["approved", "ordered", "delivered"]);
  const validOrders = procurement.filter((o) => Number(o.budgetYear) === yearF && STATUS_OK.has(String(o.status ?? "")));
  const deliv = (o: Row): { received?: boolean; unitCost?: number | string }[] => { try { return JSON.parse(String(o.deliverables ?? "[]")); } catch { return []; } };
  const orderValue = (o: Row, useActual: boolean, category?: string) => {
    const dl = useActual ? deliv(o) : [];
    return orderItems(o).reduce((s, it, i) => {
      if (category && String(it.category ?? "") !== category) return s;
      const qty = Number(it.quantity) || 0;
      const inv = dl[i];
      const got = useActual && inv?.received && inv.unitCost != null && inv.unitCost !== "";
      return s + qty * (got ? Number(inv.unitCost) : (Number(it.estPrice) || 0));
    }, 0);
  };
  const committed = (category?: string) => validOrders.reduce((t, o) => t + orderValue(o, false, category), 0);
  const actual = (category?: string) => validOrders.reduce((t, o) => t + orderValue(o, true, category), 0);

  async function del(b: Row) { if (!confirm("Delete this budget line?")) return; const r = await api(`/api/finance/budget/${b.id}`, { method: "DELETE" }); if (r.ok) { flash("Deleted"); reload(); } }
  const totalAlloc = lines.reduce((t, b) => t + (Number(b.allocated) || 0), 0);
  const totalCommitted = committed();
  const totalActual = actual();
  const budByCat = lines.map((b) => ({ label: String(b.category), value: Number(b.allocated) || 0 })).filter((d) => d.value > 0);

  async function exportExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    addSheet(wb, `Budget ${yearF}`,
      [{ label: "Category", width: 24 }, { label: "Description", width: 30 }, { label: "Allocated", width: 14 }, { label: "Committed", width: 14 }, { label: "Actual", width: 14 }, { label: "Remaining", width: 14 }, { label: "Attachment", width: 14 }],
      [
        ...lines.map((b) => { const com = committed(String(b.category)); const act = actual(String(b.category)); return [String(b.category), String(b.description ?? ""), Number(b.allocated) || 0, com, act, (Number(b.allocated) || 0) - com, parseDocs(b.attachments).length ? "Available" : ""]; }),
        ["TOTAL", "", totalAlloc, totalCommitted, totalActual, totalAlloc - totalCommitted, ""],
      ], [3, 4, 5, 6]);
    downloadBlob(await wb.xlsx.writeBuffer(), `budget-${yearF}.xlsx`, XLSX);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={yearF} onChange={(e) => setYearF(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <div className="ml-auto flex gap-2"><Button variant="ghost" onClick={exportExcel}>⬇ Excel</Button>{canWrite && <Button onClick={() => setActive("new")}>+ Add budget line</Button>}</div>
      </div>
      {(() => {
        const used = totalAlloc > 0 ? Math.min(100, Math.round((totalCommitted / totalAlloc) * 100)) : 0;
        const over = totalCommitted > totalAlloc;
        const cards = [
          { label: `Allocated ${yearF}`, value: AED(totalAlloc), icon: "💰", accent: "text-[#00C9A7]" },
          { label: "Committed", value: AED(totalCommitted), icon: "📑", accent: "text-[#F5A623]" },
          { label: "Actual (invoiced)", value: AED(totalActual), icon: "✅", accent: "text-[#00C9A7]" },
          { label: "Remaining", value: `${AED(totalAlloc - totalCommitted)}${over ? " ⚠️" : ""}`, icon: "📊", accent: over ? "text-red-400" : "text-[#00C9A7]" },
        ];
        return (
          <>
            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((k) => (
                <div key={k.label} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A1628] to-[#16243d] p-5 text-white shadow-sm ring-1 ring-black/5">
                  <div className="absolute -right-4 -top-3 text-5xl opacity-10">{k.icon}</div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{k.label}</p>
                  <p className={`mt-2 text-2xl font-bold ${k.accent}`}>{k.value}</p>
                </div>
              ))}
            </div>
            {totalAlloc > 0 && (
              <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-500">
                  <span>Budget utilisation — {yearF}</span>
                  <span className={over ? "font-bold text-red-600" : "text-[#0a8d75]"}>{used}% committed{over ? " · over budget" : ""}</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-gradient-to-r from-[#00C9A7] to-[#0a8d75]"}`} style={{ width: `${used}%` }} />
                </div>
              </div>
            )}
          </>
        );
      })()}
      {lines.length === 0 ? <p className="text-gray-400">No budget lines for {yearF}. {canWrite && "Add one to plan the year — approved purchase orders reduce it."}</p> : (
        <>
        <div className="mb-4 rounded-xl border border-gray-100 p-4"><h3 className="mb-3 text-sm font-semibold text-[#0A1628]">Allocation by category — {yearF}</h3><CategoryChart data={budByCat} /></div>
        <div className="overflow-x-auto rounded-xl ring-1 ring-black/5">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-[#0A1628] text-white"><tr>{["Category", "Allocated", "Committed", "Actual", "Remaining", "Attachments", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((b) => { const com = committed(String(b.category)); const act = actual(String(b.category)); const over = com > Number(b.allocated); const ds = parseDocs(b.attachments); return (
                <tr key={String(b.id)} className={over ? "bg-red-50" : "hover:bg-gray-50"}>
                  <td className="px-3 py-2 font-medium text-[#0A1628]">{String(b.category)}{b.description ? <span className="ml-1 font-normal text-gray-400">· {String(b.description)}</span> : null}</td>
                  <td className="px-3 py-2 text-gray-700">{AED(b.allocated)}</td>
                  <td className="px-3 py-2 text-amber-700">{AED(com)}</td>
                  <td className="px-3 py-2 text-[#0a8d75]">{AED(act)}</td>
                  <td className={`px-3 py-2 font-semibold ${over ? "text-red-600" : "text-[#0a8d75]"}`}>{AED(Number(b.allocated) - com)}{over && " ⚠️"}</td>
                  <td className="px-3 py-2 text-xs">{ds.length ? ds.map((d, i) => <a key={i} href={fileHref(d.url)} target="_blank" rel="noreferrer" className="mr-2 font-medium text-[#0a8d75] hover:underline" title={d.label}>Attachment{ds.length > 1 ? ` ${i + 1}` : ""}</a>) : <span className="text-gray-400">No attachment</span>}</td>
                  <td className="px-3 py-2 text-right">{canWrite && <><button onClick={() => setActive(b)} className="text-xs text-gray-500 hover:underline">Edit</button> <button onClick={() => del(b)} className="ml-2 text-xs text-red-600 hover:underline">Delete</button></>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        </>
      )}
      <p className="mt-3 text-xs text-gray-400"><b>Committed</b> = approved/ordered/delivered POs for {yearF} at estimated price; <b>Actual</b> swaps in the invoice unit cost once items are received. Drafts &amp; rejected orders don’t count. Remaining = Allocated − Committed.</p>
      {active && <BudgetForm record={active === "new" ? null : active} year={yearF} api={api} token={token} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); reload(); }} />}
    </div>
  );
}

function BudgetForm({ record, year, api, token, onClose, onSaved }: { record: Row | null; year: number; api: TabProps["api"]; token: string; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = record === null;
  const [f, setF] = useState<Row>(() => record ? { ...record } : { year, type: "OPEX" });
  const [docs, setDocs] = useState<{ label: string; url: string }[]>(() => parseDocs(record?.attachments));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.category || f.allocated == null || f.allocated === "") { setErr("Category and allocated amount are required"); return; }
    setBusy(true); setErr("");
    const payload = { ...f, attachments: docs };
    const res = isNew ? await api("/api/finance/budget", { method: "POST", body: JSON.stringify(payload) }) : await api(`/api/finance/budget/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    setBusy(false);
    if (res.ok) onSaved(isNew ? "Budget line added" : "Saved"); else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  return (
    <Window title={isNew ? "Add budget line" : "Edit budget line"} subtitle={`Budget ${year}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Add" : "Save"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Category *</label><select className={inputCls} value={String(f.category ?? "")} onChange={(e) => set("category", e.target.value)}><option value="">— select —</option>{PROC_CATS.map((c) => <option key={c} value={c}>{c}</option>)}{String(f.category ?? "") !== "" && !PROC_CATS.includes(String(f.category)) && <option value={String(f.category)}>{String(f.category)}</option>}</select><p className="mt-1 text-[11px] text-gray-400">Matches the procurement item Type.</p></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Allocated (AED) *</label><input type="number" min={0} className={inputCls} value={f.allocated === undefined ? "" : String(f.allocated)} onChange={(e) => set("allocated", e.target.value === "" ? "" : Number(e.target.value))} /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Description</label><input className={inputCls} value={String(f.description ?? "")} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Attachments <span className="font-normal text-gray-400">(quotes, approvals…)</span></label><Attachments token={token} folder="budget" docs={docs} onChange={setDocs} /></div>
      </div>
    </Window>
  );
}

// ───────────────────────── STATEMENT ─────────────────────────
function FinancialStatement({ capex, opex, fiscalStart }: { capex: Row[]; opex: Row[]; fiscalStart: number }) {
  const years = useMemo(() => Array.from(new Set([fyOf(new Date(), fiscalStart), ...capex.map((a) => fyOf(a.purchaseDate, fiscalStart)), ...opex.map((e) => fyOf(e.date, fiscalStart))])).sort((a, b) => b - a), [capex, opex, fiscalStart]);
  const [year, setYear] = useState<number>(fyOf(new Date(), fiscalStart));
  const yearStart = fyStart(year, fiscalStart);
  const asOf = fyEnd(year, fiscalStart);
  const capexY = capex.filter((a) => fyOf(a.purchaseDate, fiscalStart) === year);
  const opexY = opex.filter((e) => fyOf(e.date, fiscalStart) === year);
  const opexByCat = OPEX_CATS.map((c) => ({ label: c, value: opexY.filter((e) => e.category === c).reduce((t, e) => t + (Number(e.amount) || 0), 0) })).filter((d) => d.value > 0);
  const capexByCat = Object.entries(capexY.reduce((m: Record<string, number>, a) => { const k = String(a.category || "Uncategorised"); m[k] = (m[k] || 0) + (Number(a.cost) || 0); return m; }, {})).map(([label, value]) => ({ label, value }));
  const capexCost = capexY.reduce((t, a) => t + (Number(a.cost) || 0), 0); // additions this year
  const opexTotal = opexY.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  // Depreciation charge incurred DURING the year (closing accum − opening accum), per asset.
  const depYear = (a: Row) => Math.max(0, depreciate(a, asOf).accum - depreciate(a, yearStart).accum);
  // Fixed-asset register movement for the year.
  let openBook = 0, depTotal = 0, closeBook = 0;
  for (const a of capex) {
    const purch = new Date(String(a.purchaseDate));
    if (purch <= yearStart) openBook += depreciate(a, yearStart).bookValue;
    if (purch <= asOf) { depTotal += depYear(a); closeBook += depreciate(a, asOf).bookValue; }
  }

  async function exportExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    addSheet(wb,"CAPEX depreciation", [{ label: "Asset", width: 28 }, { label: "Cost", width: 14 }, { label: `Dep. ${year}`, width: 14 }, { label: "Accum. dep.", width: 14 }, { label: "Book value", width: 14 }], capex.map((a) => { const d = depreciate(a, asOf); return [String(a.name), Number(a.cost) || 0, depYear(a), d.accum, d.bookValue]; }), [2, 3, 4, 5]);
    addSheet(wb,"OPEX by category", [{ label: "Category", width: 20 }, { label: "Total", width: 16 }], opexByCat.map((d) => [d.label, d.value]), [2]);
    addSheet(wb,"Transactions", [{ label: "Date", width: 14 }, { label: "Type", width: 10 }, { label: "Category", width: 16 }, { label: "Description", width: 36 }, { label: "Amount", width: 14 }], [
      ...capexY.map((a) => [niceDate(a.purchaseDate), "CAPEX", String(a.category ?? ""), String(a.name), Number(a.cost) || 0]),
      ...opexY.map((e) => [niceDate(e.date), "OPEX", String(e.category), String(e.description ?? ""), Number(e.amount) || 0]),
    ], [5]);
    downloadBlob(await wb.xlsx.writeBuffer(), `financial-statement-${year}.xlsx`, XLSX);
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700">{years.map((y) => <option key={y} value={y}>{fyLabel(y, fiscalStart)}</option>)}</select>
        {fiscalStart !== 1 && <span className="self-center text-xs text-gray-400">FY {fyLabel(year, fiscalStart)} · {MONTH_NAMES[fiscalStart - 1].slice(0, 3)} {year} – {MONTH_NAMES[(fiscalStart + 10) % 12].slice(0, 3)} {year + 1}</span>}
        <div className="ml-auto flex gap-2"><Button variant="ghost" onClick={exportExcel}>⬇ Excel</Button></div>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl bg-[#0A1628] p-4 text-white"><p className="text-xs text-gray-300">Opening book value</p><p className="mt-1 text-xl font-bold text-[#00C9A7]">{AED(openBook)}</p></div>
        <div className="rounded-xl bg-[#0A1628] p-4 text-white"><p className="text-xs text-gray-300">+ CAPEX additions</p><p className="mt-1 text-xl font-bold text-[#00C9A7]">{AED(capexCost)}</p></div>
        <div className="rounded-xl bg-[#0A1628] p-4 text-white"><p className="text-xs text-gray-300">− Depreciation {year}</p><p className="mt-1 text-xl font-bold text-[#00C9A7]">{AED(depTotal)}</p></div>
        <div className="rounded-xl bg-[#0A1628] p-4 text-white"><p className="text-xs text-gray-300">= Closing book value</p><p className="mt-1 text-xl font-bold text-[#00C9A7]">{AED(closeBook)}</p></div>
        <div className="rounded-xl bg-[#0A1628] p-4 text-white"><p className="text-xs text-gray-300">OPEX spend {year}</p><p className="mt-1 text-xl font-bold text-[#00C9A7]">{AED(opexTotal)}</p></div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 p-4"><h3 className="mb-3 text-sm font-semibold text-[#0A1628]">OPEX by category — {year}</h3><CategoryChart data={opexByCat} /></div>
        <div className="rounded-xl border border-gray-100 p-4"><h3 className="mb-3 text-sm font-semibold text-[#0A1628]">CAPEX additions by category — {year}</h3><CategoryChart data={capexByCat} initial="bar" /></div>
      </div>
      <p className="mt-4 text-xs text-gray-400">Asset register movement for {year}: <b>Closing = Opening + Additions − Depreciation</b> (disposals written off within depreciation). Plus OPEX spend by category and a full transaction list. Download as Excel.</p>
    </div>
  );
}
