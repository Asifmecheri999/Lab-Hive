"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const LAB_WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
type Row = Record<string, unknown>;

// A real button (pointer cursor, not a text-cursor label) that opens the file picker.
function UploadButton({ onFile, label, dark = true }: { onFile: (f: File) => void; label: string; dark?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const cls = dark
    ? "shrink-0 cursor-pointer rounded-md bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-[#00C9A7] hover:brightness-110"
    : "inline-block cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100";
  return (
    <>
      <button type="button" className={cls} onClick={() => ref.current?.click()}>{label}</button>
      <input ref={ref} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </>
  );
}
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString()} AED`;

const VENDOR_CATEGORIES = ["Equipment", "Tools", "Consumables", "Maintenance", "Calibration", "Facilities", "HVAC"];
const PROC_STATUS: Record<string, { l: string; c: string }> = {
  draft: { l: "Draft", c: "bg-gray-100 text-gray-600" },
  submitted: { l: "Submitted", c: "bg-amber-100 text-amber-800" },
  approved: { l: "Approved", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
  rejected: { l: "Rejected", c: "bg-red-100 text-red-700" },
  on_hold: { l: "On hold", c: "bg-orange-100 text-orange-800" },
  ordered: { l: "Ordered", c: "bg-blue-100 text-blue-700" },
  delivered: { l: "Delivered", c: "bg-gray-100 text-gray-600" },
};

type Inv = { id: string; name: string; type: string; pricePerPiece?: number | null; quantity?: number; minQuantity?: number; unit?: string | null; pictureUrl?: string | null };
type ProcItem = { itemId: string; customName: string; category: string; quantity: number | string; unit: string; estPrice: number | string; link: string; imageUrl: string; notes: string };
type Vendor = { id: string; name: string };

const PROC_TYPES = ["Equipment", "Tool", "Consumable", "PPE", "Software", "Service", "Maintenance", "AMC", "Calibration", "Repair", "Other"];
const THIS_YEAR = new Date().getFullYear();
const BUDGET_YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2, THIS_YEAR + 3];
const PIE_COLORS = ["#00C9A7", "#2563eb", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#14b8a6", "#64748b", "#ec4899", "#84cc16"];

const emptyItem = (): ProcItem => ({ itemId: "", customName: "", category: "", quantity: 1, unit: "PIECE", estPrice: "", link: "", imageUrl: "", notes: "" });
const itemFromApi = (it: Row): ProcItem => ({ itemId: String(it.itemId ?? ""), customName: String(it.customName ?? ""), category: String(it.category ?? ""), quantity: Number(it.quantity ?? 1), unit: String(it.unit ?? "PIECE"), estPrice: it.estPrice == null ? "" : Number(it.estPrice), link: String(it.link ?? ""), imageUrl: String(it.imageUrl ?? ""), notes: String(it.notes ?? "") });
const fileUrl = (u: string) => (u && u.startsWith("/") ? `${API_URL}${u}` : u);

function PieChart({ data }: { data: { label: string; value: number }[] }) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((t, d) => t + d.value, 0);
  if (total <= 0) return <p className="text-xs text-gray-400">Add item prices and types to see the breakdown.</p>;
  const r = 70, cx = 80, cy = 80;
  let angle = -90;
  const arcs = slices.map((d, i) => {
    const frac = d.value / total;
    const start = angle, end = angle + frac * 360; angle = end;
    const sr = (start * Math.PI) / 180, er = (end * Math.PI) / 180;
    const x1 = cx + r * Math.cos(sr), y1 = cy + r * Math.sin(sr);
    const x2 = cx + r * Math.cos(er), y2 = cy + r * Math.sin(er);
    const large = end - start > 180 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { ...d, frac, path, color: PIE_COLORS[i % PIE_COLORS.length] };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0">
        {arcs.length === 1 ? <circle cx={cx} cy={cy} r={r} fill={arcs[0].color} /> : arcs.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
      </svg>
      <div className="space-y-1.5">
        {arcs.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-sm" style={{ background: s.color }} /><span className="font-medium text-[#0A1628]">{s.label}</span><span className="text-gray-500">{money(s.value)} · {Math.round(s.frac * 100)}%</span></div>
        ))}
      </div>
    </div>
  );
}

export function ProcurementModule({ token, role, email }: { token: string; role: string; email: string }) {
  // Faculty get a READ-ONLY history of approved purchase requisitions only (they can
  // open each tile and see items + vendor quotes inside, but cannot edit anything).
  // Quote / Deliverables / Vendors tabs are lab-team operations.
  const facultyView = role === "FACULTY";
  const [tab, setTab] = useState<"purchase" | "quotes" | "deliverables" | "vendors">(facultyView ? "purchase" : "quotes");

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} className={`select-none rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</button>
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#0A1628]">Procurement</h1>
        <p className="text-sm text-gray-500">{facultyView ? "Approved purchase requisitions — read-only" : "Purchase requests, deliverables, and vendors"}</p>
      </div>
      {!facultyView && (
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <TabBtn id="quotes" label="Quote Request" />
        <TabBtn id="purchase" label="Purchase Requests" />
        <TabBtn id="deliverables" label="Deliverables" />
        <TabBtn id="vendors" label="Vendors" />
      </div>
      )}
      {!facultyView && tab === "vendors" ? <VendorsPanel token={token} role={role} /> : !facultyView && tab === "quotes" ? <QuotesPanel token={token} role={role} /> : !facultyView && tab === "deliverables" ? <DeliverablesList token={token} role={role} /> : <ProcRequests key={facultyView ? "faculty" : tab} token={token} role={role} email={email} kind="PURCHASE" />}
    </div>
  );
}

// ───────────────────────── Requests / Budget ─────────────────────────
function ProcRequests({ token, role, email, kind }: { token: string; role: string; email: string; kind: "PURCHASE" | "BUDGET" }) {
  const isBudget = kind === "BUDGET";
  const canWrite = LAB_WRITE.includes(role);
  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const [rows, setRows] = useState<Row[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [labs, setLabs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/procurement");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
      api("/api/vendors").then((x) => { if (x.ok) x.json().then(setVendors); }).catch(() => {});
      api("/api/inventory").then((x) => { if (x.ok) x.json().then(setInv); }).catch(() => {});
      api("/api/org").then((x) => { if (x.ok) x.json().then((o: { campuses?: { name: string }[]; departments?: { name: string }[] }) => { setCampuses((o.campuses ?? []).map((s) => s.name)); setDepartments((o.departments ?? []).map((d) => d.name)); }); }).catch(() => {});
      api("/api/schedule/labs").then((x) => { if (x.ok) x.json().then((l: { name: string }[]) => setLabs(l.map((d) => d.name))); }).catch(() => {});
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }
  const [approvers, setApprovers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [defApprover, setDefApprover] = useState("");
  useEffect(() => {
    if (role !== "ADMIN") return;
    api("/api/procurement/approvers").then((r) => (r.ok ? r.json() : [])).then(setApprovers).catch(() => {});
    api("/api/org").then((r) => (r.ok ? r.json() : null)).then((d) => setDefApprover(String(d?.tenant?.defaultApproverEmail ?? ""))).catch(() => {});
  }, [api, role]);
  async function saveDefaultApprover(emailVal: string) {
    const p = approvers.find((a) => a.email === emailVal);
    setDefApprover(emailVal);
    await api("/api/org/settings", { method: "PATCH", body: JSON.stringify({ defaultApproverEmail: emailVal, defaultApproverName: p?.name ?? "" }) });
    flash(emailVal ? "Default approver saved" : "Default approver cleared");
  }

  const ql = q.trim().toLowerCase();
  const shown = rows.filter((r) => (String(r.kind ?? "PURCHASE") === kind) && (!ql || [r.title, (r.vendor as { name?: string })?.name, r.budgetType].filter(Boolean).join(" ").toLowerCase().includes(ql)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requests…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
        <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
        {role === "ADMIN" && !isBudget && <select value={defApprover} onChange={(e) => saveDefaultApprover(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700" title="Default approver pre-selected on new requests"><option value="">Default approver: none</option>{approvers.map((a) => <option key={a.id} value={a.email}>{a.name}{a.email ? ` (${a.email})` : ""}</option>)}</select>}
        {canWrite && <div className="ml-auto"><Button onClick={() => setActive("new")}>{isBudget ? "+ Create budget" : "+ Create request"}</Button></div>}
      </div>

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">No requests yet. {canWrite && "Click “+ Create request”."}</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => {
            const b = PROC_STATUS[String(r.status)] ?? { l: String(r.status), c: "bg-gray-100 text-gray-600" };
            const items = (r.items as Row[]) ?? [];
            const total = items.reduce((t, it) => t + (Number(it.quantity) || 0) * (Number(it.estPrice) || 0), 0);
            return (
              <button key={String(r.id)} onClick={() => setActive(r)} className="flex w-full select-none flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="h-2 w-full shrink-0" style={{ background: "#00C9A7" }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628]">{String(r.title)}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.c}`}>{b.l}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{[r.budgetYear ? `Budget ${String(r.budgetYear)}` : null, (r.vendor as { name?: string })?.name].filter(Boolean).join(" · ")}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{items.length} item{items.length === 1 ? "" : "s"}</span>
                    {isBudget && total > 0 && <span className="rounded-full bg-[#00C9A7]/15 px-2.5 py-0.5 font-semibold text-[#0a8d75]">{money(total)}</span>}
                  </div>
                  {!isBudget && ["ordered", "delivered"].includes(String(r.status)) && <p className="mt-2 inline-block rounded-full bg-[#00C9A7]/15 px-2.5 py-0.5 text-xs font-semibold text-[#0a8d75]">📦 In Deliverables</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {active && <ProcWindow record={active === "new" ? null : active} kind={kind} vendors={vendors} inv={inv} campuses={campuses} departments={departments} labs={labs} token={token} api={api} canWrite={canWrite} role={role} email={email}
        onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function ProcWindow({ record, kind, vendors, inv, campuses, departments, labs, token, api, canWrite, role, email, onClose, onSaved }: {
  record: Row | null; kind: "PURCHASE" | "BUDGET"; vendors: Vendor[]; inv: Inv[]; campuses: string[]; departments: string[]; labs: string[]; token: string;
  api: (p: string, i?: RequestInit) => Promise<Response>; canWrite: boolean; role: string; email: string;
  onClose: () => void; onSaved: (m: string) => void;
}) {
  const isNew = record === null;
  const isBudget = String((record?.kind as string) ?? kind) === "BUDGET";
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const dis = !editing;
  const [f, setF] = useState<Row>(() => record ? { ...record } : { kind, budgetYear: THIS_YEAR, status: "draft", currency: "AED", vatPercent: 5 });
  const initItems = () => ((record?.items as Row[]) ?? []).map(itemFromApi);
  const [items, setItems] = useState<ProcItem[]>(initItems);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [approvers, setApprovers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [docs, setDocs] = useState<{ label: string; url: string }[]>(() => { try { return JSON.parse(String(record?.documents ?? "[]")); } catch { return []; } });
  useEffect(() => {
    api("/api/procurement/approvers").then((r) => (r.ok ? r.json() : [])).then(setApprovers).catch(() => {});
    if (isNew) api("/api/org").then((r) => (r.ok ? r.json() : null)).then((d) => { const de = d?.tenant?.defaultApproverEmail; if (de) setF((s) => (s.approverEmail ? s : { ...s, approverEmail: de, approverName: d?.tenant?.defaultApproverName ?? "" })); }).catch(() => {});
  }, [api, isNew]);
  async function uploadDoc(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "procurement"); fd.append("id", String(record?.id ?? "new"));
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setDocs((p) => [...p, { label: file.name, url: String(d.url ?? "") }]); } else setErr("Upload failed — is R2 enabled?");
  }
  type VQuote = { vendorName?: string; amount?: number | string; note?: string; fileUrl?: string; preferred?: boolean };
  const [vquotes, setVquotes] = useState<VQuote[]>(() => { try { return JSON.parse(String(record?.vendorQuotes ?? "[]")); } catch { return []; } });
  const addQuote = () => setVquotes([...vquotes, {}]);
  const removeQuote = (i: number) => setVquotes(vquotes.filter((_, j) => j !== i));
  const setQuote = (i: number, p: Partial<VQuote>) => setVquotes(vquotes.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const setPreferred = (i: number) => setVquotes(vquotes.map((q, j) => ({ ...q, preferred: j === i })));
  async function uploadQuoteFile(i: number, file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "quotations"); fd.append("id", String(record?.id ?? "new"));
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setQuote(i, { fileUrl: String(d.url ?? "") }); } else setErr("Upload failed — is R2 enabled?");
  }
  const isApprover = !!f.approverEmail && f.approverEmail === email; // only the routed approver acts
  async function setStatus(s: string) {
    setBusy(true); setErr("");
    const r = await api(`/api/procurement/${String(record!.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: s }) });
    setBusy(false);
    if (r.ok) onSaved({ submitted: "Submitted for approval", approved: "Approved", rejected: "Rejected", on_hold: "Put on hold", ordered: "Pushed to Deliverables" }[s] ?? "Updated");
    else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Couldn't update status"); }
  }
  const pushedToDeliv = String(f.status) === "ordered" || String(f.status) === "delivered";
  function pushToDeliverables() {
    if (pushedToDeliv) { setErr("Already pushed to Deliverables — delete it from the Deliverables tab first to avoid duplicating."); return; }
    setStatus("ordered");
  }
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const patch = (i: number, p: Partial<ProcItem>) => setItems((cur) => cur.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const totalQty = items.reduce((t, l) => t + (Number(l.quantity) || 0), 0);
  const total = items.reduce((t, l) => t + (Number(l.quantity) || 0) * (Number(l.estPrice) || 0), 0);
  const vat = f.vatPercent === undefined || f.vatPercent === null ? 5 : (Number(f.vatPercent) || 0); // default 5% (UAE standard); clear the field for 0%
  const byCat = Object.entries(items.reduce((m: Record<string, number>, l) => {
    if (!(l.itemId || l.customName)) return m;
    const v = (Number(l.quantity) || 0) * (Number(l.estPrice) || 0);
    if (v <= 0) return m;
    const k = l.category || "Uncategorised";
    m[k] = (m[k] || 0) + v; return m;
  }, {})).map(([label, value]) => ({ label, value }));

  async function copyRequest() {
    setBusy(true); setErr("");
    const r = await api("/api/procurement", { method: "POST", body: JSON.stringify({ ...f, kind: isBudget ? "BUDGET" : "PURCHASE", title: `${String(f.title ?? "Request")} (copy)`, status: "draft", items }) });
    setBusy(false);
    if (r.ok) onSaved("Copied"); else setErr("Copy failed");
  }
  async function convertToPurchase() {
    setBusy(true); setErr("");
    const r = await api("/api/procurement", { method: "POST", body: JSON.stringify({ ...f, kind: "PURCHASE", title: `${String(f.title ?? "Budget")} (purchase)`, status: "draft", items }) });
    setBusy(false);
    if (r.ok) onSaved("Moved to Purchase Requests"); else setErr("Failed");
  }

  async function del() {
    if (!confirm(`Delete this ${isBudget ? "budget" : "request"}? This cannot be undone.`)) return;
    setBusy(true); setErr("");
    const res = await api(`/api/procurement/${record!.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onSaved("Deleted"); else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Delete failed"); }
  }

  async function save() {
    if (!f.title) { setErr("Title is required"); return; }
    setErr(""); setBusy(true);
    const payload = { ...f, items, documents: docs, vendorQuotes: vquotes };
    const res = isNew ? await api("/api/procurement", { method: "POST", body: JSON.stringify(payload) })
      : await api(`/api/procurement/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    setBusy(false);
    if (res.ok) onSaved(isNew ? "Request created" : "Saved");
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }

  function addLowStock() {
    const low = inv.filter((it) => (it as Row).quantity != null && (it as Row).minQuantity != null && Number((it as Row).quantity) <= Number((it as Row).minQuantity));
    const known = new Set(items.map((l) => l.itemId).filter(Boolean));
    const add = low.filter((it) => !known.has(it.id)).map((it) => ({ ...emptyItem(), itemId: it.id, estPrice: it.pricePerPiece ?? "" }));
    if (add.length) setItems([...items.filter((l) => l.itemId || l.customName), ...add]);
  }

  const slug = () => String(f.title ?? "request").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  // Professional, styled workbook — coloured header, item-numbered rows, totals + (budget) breakdown.
  async function exportExcel() {
    setBusy(true); setErr("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const NAVY = "FF0A1628", TEAL = "FF00C9A7", STRIPE = "FFF1F5F9";
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(isBudget ? "Budget" : "Purchase request");
      ws.columns = [{ width: 9 }, { width: 30 }, { width: 14 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 32 }, { width: 26 }];

      ws.mergeCells("A1:I1");
      const t = ws.getCell("A1");
      t.value = `LabSynch — ${isBudget ? "Budget document" : "Purchase request"}: ${String(f.title ?? "")}`;
      t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      t.alignment = { vertical: "middle", indent: 1 };
      ws.getRow(1).height = 28;

      const vendorName = vendors.find((v) => v.id === f.vendorId)?.name ?? String(f.supplier ?? "");
      const meta: [string, string][] = [["Budget year", String(f.budgetYear ?? "")], ["Vendor", vendorName], ["Campus", String(f.campus ?? "")], ["Department", String(f.department ?? "")], ["Laboratory", String(f.lab ?? "")], ["Status", String(f.status ?? "")]];
      let row = 3;
      for (const [k, v] of meta) { const a = ws.getCell(`A${row}`); a.value = k; a.font = { bold: true, color: { argb: NAVY } }; ws.getCell(`B${row}`).value = v; row++; }
      row++;

      const headers = ["Item No.", "Item", "Type", "Quantity", "Unit", "Price per qty", "Total", "Link", "Notes"];
      const hr = ws.getRow(row); hr.height = 20;
      headers.forEach((h, i) => { const cell = hr.getCell(i + 1); cell.value = h; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; cell.border = { bottom: { style: "thin", color: { argb: TEAL } } }; cell.alignment = { vertical: "middle" }; });
      ws.views = [{ state: "frozen", ySplit: row }];

      let vis = 0;
      items.forEach((l, idx) => {
        if (!(l.itemId || l.customName)) return;
        const name = l.itemId ? (inv.find((i) => i.id === l.itemId)?.name ?? "item") : l.customName;
        const tot = (Number(l.quantity) || 0) * (Number(l.estPrice) || 0);
        const r = ws.addRow([String(idx + 1).padStart(3, "0"), name, l.category, Number(l.quantity) || 0, l.unit, Number(l.estPrice) || 0, tot || 0, l.link, l.notes]);
        if (vis % 2) r.eachCell((c2) => { c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } }; });
        r.getCell(6).numFmt = "#,##0.00"; r.getCell(7).numFmt = "#,##0.00";
        vis++;
      });

      const tr = ws.addRow(["", "Grand total", "", totalQty, "", "", total || 0, "", ""]);
      tr.font = { bold: true }; tr.getCell(7).numFmt = "#,##0.00";
      tr.eachCell((c2) => { c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; });

      if (isBudget && byCat.length) {
        ws.addRow([]);
        const bh = ws.addRow(["Spend by type", "Amount", "Share"]);
        bh.eachCell((c2, n) => { if (n <= 3) { c2.font = { bold: true, color: { argb: "FFFFFFFF" } }; c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; } });
        for (const d of byCat) { const rr = ws.addRow([d.label, d.value, total ? `${Math.round((d.value / total) * 100)}%` : ""]); rr.getCell(2).numFmt = "#,##0.00"; }
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `procurement-${slug()}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch { setErr("Excel export failed"); } finally { setBusy(false); }
  }

  // Download all item images as a zip, each renamed to its Item No. (matches the Excel).
  return (
    <>
    <Window width="max-w-5xl" title={isNew ? (isBudget ? "New budget" : "New quote request") : String(f.title ?? "Request")} subtitle={isNew ? (isBudget ? "Budget document" : "Quote request → submit for approval → order → deliver") : editing ? "Editing" : `Budget ${String(f.budgetYear ?? "")} · ${PROC_STATUS[String(f.status)]?.l ?? String(f.status)}`}
      onClose={onClose}
      footer={<>
        {!isNew && canWrite && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        {!isNew && !editing && !f.external && canWrite && String(f.status) === "draft" && <Button onClick={() => { if (!f.approverEmail) { setErr("Choose an approver first"); return; } setStatus("submitted"); }} disabled={busy}>Submit for approval</Button>}
        {!isNew && !editing && !f.external && canWrite && String(f.status) === "on_hold" && <Button onClick={() => { if (!f.approverEmail) { setErr("Choose an approver first"); return; } setStatus("submitted"); }} disabled={busy}>Resubmit for approval</Button>}
        {!isNew && !editing && !f.external && isApprover && (String(f.status) === "submitted" || String(f.status) === "on_hold") && <Button onClick={() => setStatus("approved")} disabled={busy}>Approve</Button>}
        {!isNew && !editing && !f.external && isApprover && String(f.status) === "submitted" && <Button variant="ghost" onClick={() => setStatus("on_hold")} disabled={busy}>Hold</Button>}
        {!isNew && !editing && !f.external && isApprover && (String(f.status) === "submitted" || String(f.status) === "on_hold") && <Button variant="danger" onClick={() => setStatus("rejected")} disabled={busy}>Reject</Button>}
        {!isNew && !editing && !isBudget && canWrite && (f.external || ["approved", "ordered", "delivered"].includes(String(f.status))) && <Button variant={pushedToDeliv ? "ghost" : undefined} onClick={pushToDeliverables} disabled={busy}>{pushedToDeliv ? "✓ In Deliverables" : "Push to deliverables"}</Button>}
        {!isNew && <Button variant="ghost" onClick={exportExcel} disabled={busy}>⬇ Excel</Button>}
        {!isNew && canWrite && !editing && <Button variant="ghost" onClick={copyRequest} disabled={busy}>Duplicate</Button>}
        {!isNew && canWrite && !editing && isBudget && String(f.status) === "approved" && <Button variant="ghost" onClick={convertToPurchase} disabled={busy}>Move to Purchase</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setItems(initItems()); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!isNew && f.decisionNote ? <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${String(f.status) === "rejected" ? "border-red-200 bg-red-50 text-red-800" : String(f.status) === "on_hold" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-[#00C9A7]/30 bg-[#00C9A7]/10 text-[#0a8d75]"}`}><b>{String(f.approverName || "Approver")} — {PROC_STATUS[String(f.status)]?.l ?? String(f.status)}:</b> {String(f.decisionNote)}</div> : null}

      {!isNew && !canWrite && (
        <div className="mb-4 rounded-lg border-l-4 border-[#00C9A7] bg-[#00C9A7]/10 px-4 py-3">
          <div className="text-sm font-semibold text-[#0a8d75]">Approved purchase requisition</div>
          <div className="mt-0.5 text-xs text-[#0a8d75]/80">Read-only — the request details and items are shown below.</div>
        </div>
      )}
      {!canWrite && !isNew ? (
        <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-[#0A1628]">{String(f.title ?? "Request")}</h3>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${PROC_STATUS[String(f.status)]?.c ?? "bg-gray-100 text-gray-600"}`}>{PROC_STATUS[String(f.status)]?.l ?? String(f.status)}</span>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {([["Budget year", f.budgetYear], ["Vendor", f.supplier || vendors.find((v) => v.id === f.vendorId)?.name], ["Department", f.department], ["Laboratory", f.lab], ["Campus", f.campus], ["Approved by", f.approverName || f.approverEmail]] as [string, unknown][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-gray-50 py-1.5"><dt className="text-gray-500">{k}</dt><dd className="text-right font-medium text-[#0A1628]">{String(v)}</dd></div>
            ))}
          </dl>
          {f.description ? <div className="mt-3"><div className="text-xs font-medium text-gray-500">Notes</div><p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-800">{String(f.description)}</p></div> : null}
        </div>
      ) : (
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Title *</label><input className={inputCls} disabled={dis} value={String(f.title ?? "")} onChange={(e) => set("title", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Budget year</label><select className={inputCls} disabled={dis} value={String(f.budgetYear ?? THIS_YEAR)} onChange={(e) => set("budgetYear", Number(e.target.value))}>{BUDGET_YEARS.map((y) => <option key={y} value={y}>Budget {y}</option>)}{f.budgetYear != null && !BUDGET_YEARS.includes(Number(f.budgetYear)) && <option value={String(f.budgetYear)}>Budget {String(f.budgetYear)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Vendor</label><select className={inputCls} disabled={dis} value={f.vendorId ? String(f.vendorId) : (String(f.supplier ?? "") === "General" ? "__GENERAL__" : "")} onChange={(e) => { const v = e.target.value; if (v === "__GENERAL__") setF((s) => ({ ...s, vendorId: "", supplier: "General" })); else setF((s) => ({ ...s, vendorId: v, supplier: "" })); }}><option value="">— none —</option><option value="__GENERAL__">General</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Process</label><select className={inputCls} disabled={dis} value={f.external ? "external" : "labsynch"} onChange={(e) => set("external", e.target.value === "external")}><option value="labsynch">Via LabSynch (approval workflow)</option><option value="external">External (handled outside)</option></select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
          {f.external ? <select className={inputCls} disabled={dis} value={String(f.status ?? "draft")} onChange={(e) => set("status", e.target.value)}>{Object.keys(PROC_STATUS).filter((s) => s !== "submitted" && s !== "on_hold" && s !== "ordered" && s !== "delivered").map((s) => <option key={s} value={s}>{PROC_STATUS[s]?.l ?? s}</option>)}{["ordered", "delivered"].includes(String(f.status)) && <option value={String(f.status)}>{PROC_STATUS[String(f.status)]?.l ?? String(f.status)}</option>}</select>
            : isNew ? <input className={`${inputCls} bg-gray-50`} value="Draft (submit for approval after saving)" disabled />
            : <select className={`${inputCls} bg-gray-50`} value={String(f.status ?? "draft")} disabled><option value={String(f.status ?? "draft")}>{PROC_STATUS[String(f.status)]?.l ?? String(f.status)}</option></select>}</div>
        {!f.external && <div><label className="mb-1 block text-xs font-medium text-gray-600">Approver (Dean / faculty)</label><select className={inputCls} disabled={dis} value={String(f.approverEmail ?? "")} onChange={(e) => { const p = approvers.find((a) => a.email === e.target.value); setF((s) => ({ ...s, approverEmail: e.target.value, approverName: p?.name ?? "" })); }}><option value="">— choose approver —</option>{approvers.map((a) => <option key={a.id} value={a.email}>{a.name} ({a.role})</option>)}{!!f.approverEmail && !approvers.some((a) => a.email === f.approverEmail) && <option value={String(f.approverEmail)}>{String(f.approverName ?? f.approverEmail)}</option>}</select></div>}
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Campus</label><select className={inputCls} disabled={dis} value={String(f.campus ?? "")} onChange={(e) => set("campus", e.target.value)}><option value="">— none —</option>{campuses.map((s) => <option key={s} value={s}>{s}</option>)}{String(f.campus ?? "") !== "" && !campuses.includes(String(f.campus)) && <option value={String(f.campus)}>{String(f.campus)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} disabled={dis} value={String(f.department ?? "")} onChange={(e) => set("department", e.target.value)}><option value="">— none —</option>{departments.map((s) => <option key={s} value={s}>{s}</option>)}{String(f.department ?? "") !== "" && !departments.includes(String(f.department)) && <option value={String(f.department)}>{String(f.department)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Laboratory</label><select className={inputCls} disabled={dis} value={String(f.lab ?? "")} onChange={(e) => set("lab", e.target.value)}><option value="">— none —</option><option value="General">General</option>{labs.map((s) => <option key={s} value={s}>{s}</option>)}{String(f.lab ?? "") !== "" && String(f.lab) !== "General" && !labs.includes(String(f.lab)) && <option value={String(f.lab)}>{String(f.lab)}</option>}</select></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes / description</label><textarea rows={2} className={inputCls} disabled={dis} value={String(f.description ?? "")} onChange={(e) => set("description", e.target.value)} /></div>
      </div>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Items to procure</h3>
        {editing && <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={addLowStock} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add low-stock</button>
          <button type="button" onClick={() => setItems([...items, emptyItem()])} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add item</button>
        </div>}
      </div>

      <div className="space-y-3">
        <datalist id="lh-proc-types">{PROC_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        {items.length === 0 && <p className="text-xs text-gray-400">No items. Add from inventory or type your own.</p>}
        {items.map((l, i) => {
          const sel = inv.find((x) => x.id === l.itemId);
          const stock = sel?.quantity ?? 0;
          const stockCls = !sel ? "" : stock === 0 ? "bg-red-100 text-red-700" : (sel.minQuantity != null && stock <= sel.minQuantity) ? "bg-amber-100 text-amber-800" : "bg-[#00C9A7]/15 text-[#0a8d75]";
          const lineTotal = (Number(l.quantity) || 0) * (Number(l.estPrice) || 0);
          return (
            <div key={i} className="rounded-lg border border-gray-100 p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Item No. {String(i + 1).padStart(3, "0")}</div>
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-4"><ItemPicker line={l} inv={inv} disabled={!editing} onChange={(p) => patch(i, p)} /></div>
                <input type="number" min={0} className={`${inputCls} col-span-2`} disabled={!editing} value={l.quantity === 0 ? "" : l.quantity} onChange={(e) => patch(i, { quantity: e.target.value === "" ? "" : Number(e.target.value) })} title="quantity" placeholder="Qty" />
                <select className={`${inputCls} col-span-2`} disabled={!editing} value={l.unit} onChange={(e) => patch(i, { unit: e.target.value })} title="unit"><option value="PIECE">Piece</option><option value="BOX">Box</option><option value="DOZEN">Dozen</option></select>
                <input type="number" min={0} className={`${inputCls} col-span-3`} disabled={!editing} value={l.estPrice} onChange={(e) => patch(i, { estPrice: e.target.value === "" ? "" : Number(e.target.value) })} title="price per qty" placeholder="Price/qty (excl VAT)" />
                {editing && <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="col-span-1 rounded px-1 text-red-600 hover:bg-red-50">✕</button>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 pl-1 text-xs">
                {sel && <span className={`rounded-full px-2 py-0.5 font-semibold ${stockCls}`}>In stock: {stock}{sel.unit ? ` ${sel.unit}` : ""}</span>}
                {lineTotal > 0 && <span className="font-semibold text-gray-600">Line total: {money(lineTotal)}</span>}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <select className={inputCls} disabled={!editing} value={l.category} onChange={(e) => patch(i, { category: e.target.value })} title="Type"><option value="">— Type —</option>{PROC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}{l.category && !PROC_TYPES.includes(l.category) && <option value={l.category}>{l.category}</option>}</select>
                <input className={inputCls} disabled={!editing} value={l.link} onChange={(e) => patch(i, { link: e.target.value })} placeholder="Product / quote link" />
                <input className={inputCls} disabled={!editing} value={l.notes} onChange={(e) => patch(i, { notes: e.target.value })} placeholder="Note" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-[#0A1628]">Vendor quotes <span className="font-normal text-gray-400">(single, or compare several)</span></h3>{editing && <button type="button" onClick={addQuote} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add quote</button>}</div>
        {vquotes.length === 0 ? <p className="text-xs text-gray-400">No vendor quotes added.</p> : (
          <div className="space-y-2">
            {vquotes.map((qv, i) => (
              <div key={i} className={`rounded-lg border p-3 ${qv.preferred ? "border-[#00C9A7] bg-[#00C9A7]/5" : "border-gray-100"}`}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><select className={inputCls} disabled={dis} value={qv.vendorName ?? ""} onChange={(e) => setQuote(i, { vendorName: e.target.value })}>
                    <option value="">— Select vendor —</option>
                    {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                    {qv.vendorName && !vendors.some((v) => v.name === qv.vendorName) && <option value={qv.vendorName}>{qv.vendorName}</option>}
                  </select></div>
                  <div className="w-28 shrink-0"><input type="number" min={0} className={inputCls} disabled={dis} value={qv.amount === undefined ? "" : String(qv.amount)} onChange={(e) => setQuote(i, { amount: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="Amount" /></div>
                  {editing && <button type="button" onClick={() => removeQuote(i)} className="shrink-0 rounded px-1.5 text-red-600 hover:bg-red-50" title="Remove this quote">✕</button>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input className={`${inputCls} min-w-[8rem] flex-1`} disabled={dis} value={qv.note ?? ""} onChange={(e) => setQuote(i, { note: e.target.value })} placeholder="Note (e.g. lead time, warranty)" />
                  {qv.fileUrl && <span className="flex items-center gap-1 text-xs"><a href={fileUrl(qv.fileUrl)} target="_blank" rel="noreferrer" className="font-medium text-[#0a8d75] hover:underline">📎 quote</a>{editing && <button type="button" onClick={() => setQuote(i, { fileUrl: undefined })} className="rounded px-1 text-red-600 hover:bg-red-50" title="Remove file">✕</button>}</span>}
                  {editing && <UploadButton onFile={(file) => uploadQuoteFile(i, file)} label={qv.fileUrl ? "⬆ Replace quote" : "⬆ Upload quote"} />}
                  <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-700"><input type="radio" name="lh-pref-quote" disabled={dis} checked={!!qv.preferred} onChange={() => setPreferred(i)} />Preferred</label>
                </div>
              </div>
            ))}
          </div>
        )}
        {(() => { const p = vquotes.find((q) => q.preferred); return p ? <p className="mt-1 text-xs font-medium text-[#0a8d75]">Preferred: {p.vendorName || "—"}{p.amount ? ` · ${money(Number(p.amount))}` : ""}</p> : null; })()}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <h3 className="mb-2 text-sm font-semibold text-[#0A1628]">Attachments <span className="font-normal text-gray-400">(supporting documents)</span></h3>
        {docs.length > 0 && <div className="mb-2 space-y-1">{docs.map((dd, di) => (
          <div key={di} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs"><a href={fileUrl(dd.url)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">📎 {dd.label}</a>{editing && <button type="button" onClick={() => setDocs(docs.filter((_, j) => j !== di))} className="text-red-600 hover:underline">remove</button>}</div>
        ))}</div>}
        {editing ? <UploadButton onFile={uploadDoc} label="⬆ Upload document" dark={false} /> : (docs.length === 0 && <p className="text-xs text-gray-400">No attachments.</p>)}
      </div>

      <div className="mt-4 rounded-lg bg-[#0A1628] p-4 text-white">
        <div className="flex items-center justify-between text-sm"><span>Total quantity</span><span className="font-bold">{totalQty}</span></div>
        <div className="mt-1 flex items-center justify-between text-sm"><span>Subtotal (excl VAT)</span><span className="font-bold text-[#00C9A7]">{money(total)}</span></div>
        <div className="mt-1 flex items-center justify-between text-sm"><span>VAT</span><span className="flex items-center gap-1">{editing ? <input type="number" min={0} className="w-14 rounded px-1.5 py-0.5 text-right text-sm text-[#0A1628]" value={f.vatPercent === undefined || f.vatPercent === null ? 5 : String(f.vatPercent)} onChange={(e) => set("vatPercent", e.target.value === "" ? "" : Number(e.target.value))} placeholder="5" /> : <span>{vat}</span>}<span>%</span><span className="ml-2 w-24 text-right text-gray-300">{money(total * vat / 100)}</span></span></div>
        <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-1 text-sm"><span>Total (incl VAT)</span><span className="font-bold text-[#00C9A7]">{money(total * (1 + vat / 100))}</span></div>
      </div>
      {isBudget && <div className="mt-4 rounded-xl border border-gray-100 p-4">
        <h3 className="mb-3 text-sm font-semibold text-[#0A1628]">Where the money goes — by type</h3>
        <PieChart data={byCat} />
      </div>}
        </Window>
      </>
  );
}

// Deliverables — record arrived items + invoice unit costs + invoice/delivery-note files, then push to inventory (weighted-average pricing).
function DeliverablesDialog({ record, api, token, onClose, onSaved }: { record: Row; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; onClose: () => void; onSaved: (m: string) => void }) {
  const items = (record.items as Row[]) ?? [];
  type D = { received: boolean; unitCost: number | string; pushedStock: boolean };
  const estOf = (it: Row): number | string => (it.estPrice != null && it.estPrice !== "" ? Number(it.estPrice) : "");
  const parse = (): D[] => { try { const a = JSON.parse(String(record.deliverables ?? "[]")); return items.map((it, i) => ({ received: !!a[i]?.received, unitCost: a[i]?.unitCost != null && a[i]?.unitCost !== "" ? a[i].unitCost : estOf(it), pushedStock: !!a[i]?.pushedStock })); } catch { return items.map((it) => ({ received: false, unitCost: estOf(it), pushedStock: false })); } };
  const [d, setD] = useState<D[]>(parse);
  const [invoiceUrl, setInvoiceUrl] = useState(String(record.invoiceUrl ?? ""));
  const [deliveryNoteUrl, setDeliveryNoteUrl] = useState(String(record.deliveryNoteUrl ?? ""));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const setLine = (i: number, p: Partial<D>) => setD((cur) => cur.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const nameOf = (it: Row) => (it.item as { name?: string })?.name ?? String(it.customName ?? "item");

  async function upload(file: File, folder: string, set: (u: string) => void) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", folder); fd.append("id", String(record.id));
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const j = await r.json(); set(String(j.url ?? "")); } else setErr("Upload failed — is R2 enabled?");
  }
  async function save(next?: D[]) {
    setBusy(true); setErr("");
    const r = await api(`/api/procurement/${String(record.id)}/deliverables`, { method: "POST", body: JSON.stringify({ invoiceUrl, deliveryNoteUrl, deliverables: next ?? d }) });
    setBusy(false);
    if (r.ok) { setMsg("Saved"); setTimeout(() => setMsg(""), 1500); } else setErr("Save failed");
  }
  // Push received items into inventory — tops up stock (weighted-average price on a cost change) or creates new items.
  async function pushStock() {
    const picks = items.map((it, i) => ({ it, i })).filter(({ i }) => d[i].received && !d[i].pushedStock);
    if (!picks.length) {
      const allPushed = items.length > 0 && items.every((_, i) => !d[i].received || d[i].pushedStock) && items.some((_, i) => d[i].pushedStock);
      setErr(allPushed ? "All received items are already pushed to inventory — nothing left to push." : "Tick the arrived items first (and enter their unit cost).");
      return;
    }
    if (!confirm(`Push ${picks.length} item(s) to inventory?\n\nExisting items get their stock topped up (price averaged if the invoice cost differs). Items not in inventory will be created.`)) return;
    const lines = picks.map(({ it, i }) => ({ itemId: it.itemId ? String(it.itemId) : undefined, customName: it.itemId ? undefined : nameOf(it), category: String(it.category ?? ""), unit: String(it.unit ?? ""), quantity: Number(it.quantity) || 1, unitCost: d[i].unitCost === "" ? undefined : Number(d[i].unitCost) }));
    setBusy(true); setErr("");
    const r = await api(`/api/procurement/${String(record.id)}/receive-stock`, { method: "POST", body: JSON.stringify({ lines }) });
    setBusy(false);
    if (r.ok) {
      const res = await r.json().catch(() => ({}));
      const idxs = new Set(picks.map((p) => p.i));
      const next = d.map((l, j) => (idxs.has(j) ? { ...l, pushedStock: true } : l));
      setD(next); await save(next);
      const avg = (res.averaged ?? []) as { name: string; oldPrice: number; newPrice: number }[];
      setMsg(`Inventory updated — ${res.updated ?? 0} stock topped up, ${res.created ?? 0} created${avg.length ? ` · ${avg.length} price(s) averaged` : ""}`);
      setTimeout(() => setMsg(""), 4000);
    } else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Push failed"); }
  }
  async function clearAll() {
    if (!confirm("Clear this order's deliverables — received ticks, unit costs, invoice & delivery note?")) return;
    setBusy(true); setErr("");
    const r = await api(`/api/procurement/${String(record.id)}/deliverables`, { method: "POST", body: JSON.stringify({ invoiceUrl: "", deliveryNoteUrl: "", deliverables: [] }) });
    setBusy(false);
    if (r.ok) onSaved("Deliverables cleared"); else setErr("Couldn't clear");
  }
  return (
    <Window width="max-w-5xl" title="Deliverables" subtitle={String(record.title ?? "")} onClose={onClose}
      footer={<><Button variant="danger" onClick={clearAll} disabled={busy}>Delete</Button><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="ghost" onClick={pushStock} disabled={busy}>{items.length > 0 && items.some((_, i) => d[i].pushedStock) && items.every((_, i) => !d[i].received || d[i].pushedStock) ? "✓ Pushed to inventory" : "📦 Push to inventory"}</Button><Button onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="mb-3 rounded bg-[#00C9A7]/10 px-3 py-2 text-sm text-[#0a8d75]">{msg}</p>}
      <p className="mb-3 text-sm text-gray-500">Tick the items that arrived, enter the unit cost from the invoice, and attach the supplier invoice &amp; delivery note. Then <b>Push to inventory</b> to top up stock (price is averaged if the cost changed) or create new items.</p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-3">
          <div className="flex-1"><p className="text-xs font-semibold text-[#0A1628]">Supplier invoice</p>{invoiceUrl ? <a href={fileUrl(invoiceUrl)} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#0a8d75] hover:underline">📎 View invoice</a> : <span className="text-xs text-gray-400">Not attached</span>}</div>
          <label className="shrink-0 cursor-pointer rounded-md bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-[#00C9A7] hover:brightness-110">{invoiceUrl ? "📎 Replace" : "📎 Attach"}<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file, "invoices", setInvoiceUrl); }} /></label>
          {invoiceUrl && <button type="button" onClick={() => setInvoiceUrl("")} className="shrink-0 rounded-md border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50" title="Remove invoice">Remove</button>}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-3">
          <div className="flex-1"><p className="text-xs font-semibold text-[#0A1628]">Delivery note</p>{deliveryNoteUrl ? <a href={fileUrl(deliveryNoteUrl)} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#0a8d75] hover:underline">📎 View note</a> : <span className="text-xs text-gray-400">Not attached</span>}</div>
          <label className="shrink-0 cursor-pointer rounded-md bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-[#00C9A7] hover:brightness-110">{deliveryNoteUrl ? "📎 Replace" : "📎 Attach"}<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file, "procurement", setDeliveryNoteUrl); }} /></label>
          {deliveryNoteUrl && <button type="button" onClick={() => setDeliveryNoteUrl("")} className="shrink-0 rounded-md border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50" title="Remove delivery note">Remove</button>}
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-gray-400">No items on this order.</p>}
        {items.map((it, i) => { const qty = Number(it.quantity) || 1; const line = (Number(d[i].unitCost) || 0) * qty; return (
          <div key={String(it.id ?? i)} className="rounded-lg border border-gray-100 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex flex-1 items-center gap-2 text-sm font-medium text-[#0A1628]"><input type="checkbox" checked={d[i].received} onChange={(e) => setLine(i, { received: e.target.checked })} />{nameOf(it)} <span className="text-gray-400">× {qty}</span></label>
              <div className="flex flex-col items-end gap-0.5"><span className="text-[10px] uppercase tracking-wide text-gray-400">Price / qty</span><input type="number" min={0} className={`${inputCls} w-24 text-left`} value={d[i].unitCost === "" ? "" : String(d[i].unitCost)} onChange={(e) => setLine(i, { unitCost: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="cost" /></div>
              <div className="flex flex-col items-end gap-0.5"><span className="text-[10px] uppercase tracking-wide text-gray-400">Item total</span><div className="w-28 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-sm font-semibold text-gray-700">{line ? money(line) : "—"}</div></div>
            </div>
            {d[i].received && <div className="mt-1 pl-6 text-[11px]">{d[i].pushedStock ? <span className="font-semibold text-[#0a8d75]">✓ pushed to inventory</span> : <span className="text-gray-400">{it.itemId ? "Existing item — stock will be topped up (price averaged on change)" : "Not in inventory — will be created"}</span>}</div>}
          </div>
        ); })}
      </div>

      {items.length > 0 && (() => {
        const dvat = record.vatPercent === undefined || record.vatPercent === null ? 5 : (Number(record.vatPercent) || 0);
        const dsub = items.reduce((t, it, i) => t + (Number(it.quantity) || 1) * (Number(d[i].unitCost) || 0), 0);
        return (
          <div className="mt-4 rounded-lg bg-[#0A1628] p-4 text-white">
            <div className="flex items-center justify-between text-sm"><span>Subtotal (excl VAT)</span><span className="font-bold text-[#00C9A7]">{money(dsub)}</span></div>
            <div className="mt-1 flex items-center justify-between text-sm"><span>VAT {dvat}%</span><span className="text-gray-300">{money(dsub * dvat / 100)}</span></div>
            <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-1 text-sm"><span>Total amount (incl VAT)</span><span className="font-bold text-[#00C9A7]">{money(dsub * (1 + dvat / 100))}</span></div>
          </div>
        );
      })()}
    </Window>
  );
}

function ItemPicker({ line, inv, disabled, onChange }: { line: ProcItem; inv: Inv[]; disabled?: boolean; onChange: (p: Partial<ProcItem>) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const sel = inv.find((i) => i.id === line.itemId);
  const display = line.itemId ? (sel?.name ?? "item") : line.customName || "";
  const list = inv.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="relative">
      <input className={inputCls} disabled={disabled} placeholder="Search inventory or type a custom item…"
        value={open ? q : display} onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {list.map((i) => (
            <button type="button" key={i.id} onMouseDown={() => { onChange({ itemId: i.id, customName: "", estPrice: i.pricePerPiece ?? line.estPrice }); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50">{i.name} <span className="text-gray-400">({i.type} · {i.quantity ?? 0} in stock)</span></button>
          ))}
          {q.trim() && (
            <button type="button" onMouseDown={() => { onChange({ itemId: "", customName: q.trim() }); setOpen(false); }}
              className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-sm text-[#0a8d75] hover:bg-gray-50">➕ Add “{q.trim()}” (custom)</button>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Deliverables tab ─────────────────────────
function DeliverablesList({ token, role }: { token: string; role: string }) {
  const canWrite = LAB_WRITE.includes(role);
  const api = useCallback((p: string, i?: RequestInit) => retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Row | null>(null);
  const [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/procurement");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    if (r.ok) setRows((await r.json()).filter((x: Row) => String(x.kind ?? "PURCHASE") !== "BUDGET" && ["ordered", "delivered"].includes(String(x.status))));
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const ql = q.trim().toLowerCase();
  const shown = rows.filter((r) => !ql || [r.title, (r.vendor as { name?: string })?.name].filter(Boolean).join(" ").toLowerCase().includes(ql));
  const recv = (r: Row) => { try { const a = JSON.parse(String(r.deliverables ?? "[]")); return (a as { received?: boolean }[]).filter((x) => x?.received).length; } catch { return 0; } };
  const pushedToInv = (r: Row) => { try { const a = JSON.parse(String(r.deliverables ?? "[]")); return (a as { pushedStock?: boolean }[]).some((x) => x?.pushedStock); } catch { return false; } };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orders…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
        <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
      </div>
      {loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">No purchase orders yet. Create one under “Purchase Requests”.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => { const items = (r.items as Row[]) ?? []; const got = recv(r); return (
            <button key={String(r.id)} onClick={() => canWrite && setActive(r)} className="flex w-full select-none flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2 w-full shrink-0" style={{ background: "#00C9A7" }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[#0A1628]">{String(r.title)}</h3>
                  {got > 0 && <span className="shrink-0 rounded-full bg-[#00C9A7]/15 px-2 py-0.5 text-xs font-semibold text-[#0a8d75]">{got}/{items.length} received</span>}
                </div>
                <p className="mt-1 text-xs text-gray-500">{[(r.vendor as { name?: string })?.name ?? String(r.supplier ?? ""), String(r.status ?? "")].filter(Boolean).join(" · ") || "—"}</p>
                <p className="mt-2 text-xs text-gray-400">{items.length} item{items.length === 1 ? "" : "s"} · record arrivals &amp; costs →</p>
                {pushedToInv(r) && <p className="mt-2 inline-block rounded-full bg-[#00C9A7]/15 px-2.5 py-0.5 text-xs font-semibold text-[#0a8d75]">📦 Pushed to inventory</p>}
              </div>
            </button>
          ); })}
        </div>
      )}
      {active && <DeliverablesDialog record={active} api={api} token={token} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

// ───────────────────────── Quote requests (RFQ) ─────────────────────────
type QItem = { itemId?: string; customName?: string; category?: string; qty: number | string; unit?: string; link?: string; notes?: string };
type QSheet = { vendorId?: string; vendorName?: string; status?: string; pushedToPR?: boolean; items: QItem[] };
const QUOTE_STATUS: Record<string, { l: string; c: string }> = { draft: { l: "Draft", c: "bg-gray-100 text-gray-600" }, received: { l: "Quote received", c: "bg-[#00C9A7]/15 text-[#0a8d75]" } };
const invTypeLabel = (t?: string) => ({ EQUIPMENT: "Equipment", TOOL: "Tool", CONSUMABLE: "Consumable", PPE: "PPE" }[String(t ?? "").toUpperCase()] ?? "");

function QuotesPanel({ token, role }: { token: string; role: string }) {
  const canWrite = LAB_WRITE.includes(role);
  const api = useCallback((p: string, i?: RequestInit) => retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/procurement/quotes");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    if (r.ok) setRows(await r.json());
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const parse = (r: Row): QSheet => { try { const d = JSON.parse(String(r.data ?? "{}")); return { ...d, items: d.items ?? [] }; } catch { return { items: [] }; } };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-sm text-gray-500">Create a quote request, then download it as Excel or email it to the vendor / procurement.</p>
        {canWrite && <div className="ml-auto"><Button onClick={() => setActive("new")}>+ Create request</Button></div>}
      </div>
      {loading ? <p className="text-gray-400">Loading…</p>
        : rows.length === 0 ? <p className="text-gray-400">No quote requests yet. {canWrite && "Create one to send to a supplier."}</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => { const q = parse(r); return (
            <button key={String(r.id)} onClick={() => setActive(r)} className="flex w-full select-none flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2 w-full shrink-0" style={{ background: "#00C9A7" }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2"><h3 className="flex items-center gap-1.5 font-semibold text-[#0A1628]"><span>📄</span>{String(r.title)}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${QUOTE_STATUS[q.status ?? "draft"]?.c ?? QUOTE_STATUS.draft.c}`}>{QUOTE_STATUS[q.status ?? "draft"]?.l ?? "Draft"}</span></div>
                <p className="mt-1 text-xs text-gray-500">{q.items.length} item(s){q.vendorName ? ` · ${q.vendorName}` : ""}</p>
                {q.pushedToPR && <p className="mt-2 inline-block rounded-full bg-[#00C9A7]/15 px-2.5 py-0.5 text-xs font-semibold text-[#0a8d75]">🛒 In Purchase requests</p>}
              </div>
            </button>
          ); })}
        </div>
      )}
      {active && <QuoteWindow record={active === "new" ? null : active} api={api} canWrite={canWrite} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function QuoteWindow({ record, api, canWrite, onClose, onSaved }: { record: Row | null; api: (p: string, i?: RequestInit) => Promise<Response>; canWrite: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = record === null;
  const init: QSheet = (() => { try { const d = JSON.parse(String(record?.data ?? "{}")); return { ...d, items: d.items?.length ? d.items : [{ qty: 1, unit: "PIECE" }] }; } catch { return { items: [{ qty: 1, unit: "PIECE" }] }; } })();
  const [title, setTitle] = useState(String(record?.title ?? ""));
  const [vendorId, setVendorId] = useState(String(init.vendorId ?? ""));
  const [vendorName, setVendorName] = useState(String(init.vendorName ?? ""));
  const [status, setStatus] = useState(String(init.status ?? "draft"));
  const [pushedPR, setPushedPR] = useState(!!init.pushedToPR);
  const [items, setItems] = useState<QItem[]>(init.items);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit"; const dis = !editing;
  useEffect(() => {
    api("/api/vendors").then((r) => (r.ok ? r.json() : [])).then(setVendors).catch(() => {});
    api("/api/inventory").then((r) => (r.ok ? r.json() : [])).then(setInv).catch(() => {});
  }, [api]);

  const itemName = (it: QItem) => (it.itemId ? (inv.find((x) => x.id === it.itemId)?.name ?? "item") : (it.customName ?? ""));
  function pickVendor(id: string) { const v = vendors.find((x) => x.id === id); setVendorId(id); setVendorName(v?.name ?? ""); }
  const addItem = () => setItems([...items, { qty: 1, unit: "PIECE" }]);
  const removeItem = (i: number) => setItems(items.filter((_, j) => j !== i));
  const setItem = (i: number, p: Partial<QItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...p } : it)));

  async function save(): Promise<string | null> {
    if (!title.trim()) { setErr("Give the request a heading"); return null; }
    setBusy(true); setErr("");
    const body = JSON.stringify({ title: title.trim(), data: { vendorId, vendorName, status, pushedToPR: pushedPR, items: items.filter((it) => it.itemId || it.customName) } });
    const r = isNew ? await api("/api/procurement/quotes", { method: "POST", body }) : await api(`/api/procurement/quotes/${String(record!.id)}`, { method: "PUT", body });
    setBusy(false);
    if (!r.ok) { setErr("Save failed"); return null; }
    const saved = await r.json().catch(() => ({}));
    return String(saved.id ?? record?.id ?? "");
  }
  async function saveAndClose() { const id = await save(); if (id) onSaved(isNew ? "Quote request created" : "Saved"); }
  async function del() { if (!confirm("Delete this quote request?")) return; const r = await api(`/api/procurement/quotes/${String(record!.id)}`, { method: "DELETE" }); if (r.ok) onSaved("Deleted"); }
  async function pushToPR() {
    if (pushedPR) { setErr("Already pushed to Purchase Requests — delete that purchase request first to avoid duplicating."); return; }
    if (status !== "received") { setErr("Set the status to “Quote received” before pushing to a purchase request."); return; }
    const lines = items.filter((it) => it.itemId || it.customName).map((it) => ({ itemId: it.itemId || "", customName: it.customName || "", category: it.category || "", quantity: Number(it.qty) || 1, unit: it.unit || "PIECE", estPrice: "", link: it.link || "", notes: it.notes || "" }));
    if (!lines.length) { setErr("Add items first"); return; }
    setBusy(true); setErr("");
    const r = await api("/api/procurement", { method: "POST", body: JSON.stringify({ title: title || "From quote request", kind: "PURCHASE", budgetYear: new Date().getFullYear(), vendorId: vendorId || null, status: "draft", items: lines }) });
    if (!r.ok) { setBusy(false); setErr("Couldn't push to purchase request"); return; }
    await api(`/api/procurement/quotes/${String(record!.id)}`, { method: "PUT", body: JSON.stringify({ title: title.trim(), data: { vendorId, vendorName, status, pushedToPR: true, items: items.filter((it) => it.itemId || it.customName) } }) });
    setBusy(false); setPushedPR(true);
    onSaved("Pushed to Purchase Requests — open that tab to price & submit");
  }
  async function exportExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Quote request");
    ws.mergeCells("A1:F1"); const t = ws.getCell("A1"); t.value = `Quote request: ${title}${vendorName ? ` — ${vendorName}` : ""}`; t.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } }; t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1628" } };
    ws.getRow(1).height = 24;
    ws.columns = [{ width: 34 }, { width: 16 }, { width: 8 }, { width: 10 }, { width: 34 }, { width: 30 }];
    const head = ws.getRow(2); ["Item", "Type", "Qty", "Unit", "Link", "Notes"].forEach((h, i) => { const c = head.getCell(i + 1); c.value = h; c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; });
    items.filter((it) => it.itemId || it.customName).forEach((it) => ws.addRow([itemName(it), it.category || "", Number(it.qty) || 0, it.unit || "PIECE", it.link || "", it.notes || ""]));
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = `quote-request-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "rfq"}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Window width="max-w-5xl" title={isNew ? "New quote request" : String(title || "Quote request")} subtitle="Pick inventory items or add your own — download as Excel" onClose={onClose}
      footer={<>{!isNew && canWrite && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}<Button variant="ghost" onClick={exportExcel} disabled={busy}>⬇ Excel</Button>{!isNew && canWrite && !editing && <Button variant={pushedPR ? "ghost" : undefined} onClick={pushToPR} disabled={busy}>{pushedPR ? "✓ In Purchase requests" : "→ Purchase request"}</Button>}<Button variant="ghost" onClick={onClose}>Close</Button>{!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}{editing && !isNew && <Button variant="ghost" onClick={() => { setMode("view"); }}>Cancel</Button>}{canWrite && editing && <Button onClick={saveAndClose} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}</>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Heading *</label><input className={inputCls} disabled={dis} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Microscopes — Request for quotation" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Preferred vendor / procurement</label><select className={inputCls} disabled={dis} value={vendorId} onChange={(e) => pickVendor(e.target.value)}><option value="">— none —</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Status</label><select className={inputCls} disabled={dis} value={status} onChange={(e) => setStatus(e.target.value)}><option value="draft">Draft</option><option value="received">Quote received</option></select></div>
      </div>
      <div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold text-[#0A1628]">Items</h3>{editing && <button type="button" onClick={addItem} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add item</button>}</div>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-xs text-gray-400">No items. Search inventory or type your own.</p>}
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-gray-100 p-2">
            <div className="grid grid-cols-12 items-center gap-2">
              <div className="col-span-4"><ItemPicker line={{ ...emptyItem(), itemId: it.itemId ?? "", customName: it.customName ?? "" }} inv={inv} disabled={dis} onChange={(p) => setItem(i, { itemId: p.itemId || undefined, customName: p.customName || undefined, category: it.category || invTypeLabel(inv.find((x) => x.id === p.itemId)?.type) })} /></div>
              <select className={`${inputCls} col-span-3`} disabled={dis} value={it.category ?? ""} onChange={(e) => setItem(i, { category: e.target.value })} title="Type"><option value="">— Type —</option>{PROC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}{it.category && !PROC_TYPES.includes(it.category) && <option value={it.category}>{it.category}</option>}</select>
              <input type="number" min={0} className={`${inputCls} col-span-2`} disabled={dis} value={it.qty === 0 ? "" : it.qty} onChange={(e) => setItem(i, { qty: e.target.value === "" ? "" : Number(e.target.value) })} title="qty" placeholder="Qty" />
              <select className={`${inputCls} col-span-2`} disabled={dis} value={it.unit ?? "PIECE"} onChange={(e) => setItem(i, { unit: e.target.value })} title="unit"><option value="PIECE">Piece</option><option value="BOX">Box</option><option value="DOZEN">Dozen</option></select>
              {editing && <button type="button" onClick={() => removeItem(i)} className="col-span-1 rounded px-1 text-red-600 hover:bg-red-50" title="Remove">✕</button>}
            </div>
            <div className="grid grid-cols-12 gap-2">
              <input className={`${inputCls} col-span-5`} disabled={dis} value={it.link ?? ""} onChange={(e) => setItem(i, { link: e.target.value })} placeholder="Product / quote link" />
              <input className={`${inputCls} col-span-7`} disabled={dis} value={it.notes ?? ""} onChange={(e) => setItem(i, { notes: e.target.value })} placeholder="Notes" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400">Search an inventory item (stock shown) or type your own. Save, then <b>⬇ Excel</b> to download and send to the vendor / procurement.</p>
    </Window>
  );
}

// ───────────────────────── Vendors ─────────────────────────
export function VendorsPanel({ token, role }: { token: string; role: string }) {
  const canWrite = LAB_WRITE.includes(role);
  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [catF, setCatF] = useState("ALL");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/vendors");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    if (r.ok) setRows(await r.json());
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const ql = q.trim().toLowerCase();
  const shown = rows.filter((v) => (catF === "ALL" || String(v.category) === catF) && (!ql || [v.name, v.contactName, v.country].filter(Boolean).join(" ").toLowerCase().includes(ql)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700">
          <option value="ALL">All categories</option>{VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
        {canWrite && <div className="ml-auto"><Button onClick={() => setActive("new")}>+ Add vendor</Button></div>}
      </div>

      {loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">No vendors{catF !== "ALL" ? " in this category" : ""} yet.</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((v) => (
            <button key={String(v.id)} onClick={() => canWrite && setActive(v)} className="block w-full select-none overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2" style={{ background: v.isApproved ? "#00C9A7" : "#F5A623" }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[#0A1628]">{String(v.name)}</h3>
                  {v.isApproved ? <span className="shrink-0 rounded-full bg-[#00C9A7]/15 px-2 py-0.5 text-xs font-semibold text-[#0a8d75]">Approved</span> : <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Pending</span>}
                </div>
                <p className="mt-1 text-xs text-gray-500">{[v.category, v.country].filter(Boolean).join(" · ") || "—"}</p>
                {(v.contactName || v.email) ? <p className="mt-2 text-xs text-gray-400">{[v.contactName, v.email].filter(Boolean).join(" · ")}</p> : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {active && <VendorForm record={active === "new" ? null : active} api={api} token={token} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

export function VendorForm({ record, api, token, onClose, onSaved }: { record: Row | null; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; onClose: () => void; onSaved: (m: string, saved?: Row) => void }) {
  const isNew = record === null;
  const [f, setF] = useState<Row>(() => record ? { ...record } : { isApproved: false });
  const [docs, setDocs] = useState<{ label: string; url: string }[]>(() => { try { return JSON.parse(String(record?.documents ?? "[]")); } catch { return []; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function uploadDoc(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "vendors"); fd.append("id", String(record?.id ?? "new"));
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setDocs((p) => [...p, { label: file.name, url: String(d.url ?? "") }]); } else setErr("Upload failed — is R2 file storage enabled?");
  }
  async function save() {
    if (!f.name) { setErr("Name is required"); return; }
    setBusy(true); setErr("");
    const payload = { ...f, documents: docs };
    const res = isNew ? await api("/api/vendors", { method: "POST", body: JSON.stringify(payload) })
      : await api(`/api/vendors/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    if (res.ok) { const saved = await res.json().catch(() => null); setBusy(false); onSaved(isNew ? "Vendor added" : "Saved", saved); } else { setBusy(false); const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function del() {
    if (!confirm("Delete this vendor?")) return;
    const res = await api(`/api/vendors/${record!.id}`, { method: "DELETE" });
    if (res.ok) onSaved("Deleted"); else setErr("Delete failed");
  }
  return (
    <Window title={isNew ? "Add vendor" : String(f.name ?? "Vendor")} onClose={onClose}
      footer={<>{!isNew && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Add" : "Save"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Name *</label><input className={inputCls} value={String(f.name ?? "")} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Category</label><select className={inputCls} value={String(f.category ?? "")} onChange={(e) => set("category", e.target.value)}><option value="">— select —</option>{VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}{String(f.category ?? "") !== "" && !VENDOR_CATEGORIES.includes(String(f.category)) && <option value={String(f.category)}>{String(f.category)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Contact name</label><input className={inputCls} value={String(f.contactName ?? "")} onChange={(e) => set("contactName", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Email</label><input className={inputCls} value={String(f.email ?? "")} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Phone</label><input className={inputCls} value={String(f.phone ?? "")} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Country</label><input className={inputCls} value={String(f.country ?? "")} onChange={(e) => set("country", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><textarea rows={2} className={inputCls} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Documents <span className="font-normal text-gray-400">(VAT certificate, trade licence, contract…)</span></label>
          {docs.length > 0 && <div className="mb-2 space-y-1">{docs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs"><a href={fileUrl(d.url)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">📎 {d.label}</a><button type="button" onClick={() => setDocs(docs.filter((_, j) => j !== i))} className="text-red-600 hover:underline">remove</button></div>
          ))}</div>}
          <label className="inline-block cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">{busy ? "Uploading…" : "📎 Attach document"}<input type="file" className="hidden" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadDoc(file); }} /></label>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={!!f.isApproved} onChange={(e) => set("isApproved", e.target.checked)} /> Approved vendor</label>
      </div>
    </Window>
  );
}
