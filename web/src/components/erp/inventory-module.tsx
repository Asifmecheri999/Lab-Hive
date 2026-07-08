"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { VendorForm } from "./procurement-module";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const LAB_WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
const SCHEDULERS = ["LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];

const TYPE_OPTS = [
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "TOOL", label: "Tool" },
  { value: "PPE", label: "PPE" },
  { value: "CONSUMABLE", label: "Consumable" },
];
const typeLabel = (v: unknown) => TYPE_OPTS.find((o) => o.value === v)?.label ?? String(v ?? "");
const typePlural: Record<string, string> = { EQUIPMENT: "Equipment", TOOL: "Tools", PPE: "PPE", CONSUMABLE: "Consumables" };
const TYPE_BG: Record<string, string> = {
  EQUIPMENT: "from-sky-100 to-sky-200",
  TOOL: "from-amber-100 to-amber-200",
  PPE: "from-emerald-100 to-emerald-200",
  CONSUMABLE: "from-violet-100 to-violet-200",
};
const TYPE_BADGE: Record<string, string> = {
  EQUIPMENT: "bg-sky-100 text-sky-800",
  TOOL: "bg-amber-100 text-amber-800",
  PPE: "bg-emerald-100 text-emerald-800",
  CONSUMABLE: "bg-violet-100 text-violet-800",
};
const ELECTRICAL_OPTS = ["Single phase", "Three phase", "Battery Powered", "None"];
const STREAMS = ["Teaching", "Research", "Outreach", "Club", "Stationery", "Service", "Other"];

type Item = Record<string, unknown>;
type Lab = { id: string; name: string };
type Vendor = { id: string; name: string };

// Main equipment documents. Anything else goes in "Additional documents" (extraDocuments).
const DOC_FIELDS: { key: string; label: string }[] = [
  { key: "coshhUrl", label: "Safety Standard / COSHH" },
  { key: "riskAssessmentUrl", label: "Risk Assessment" },
  { key: "calibrationCertificateUrl", label: "Calibration" },
  { key: "maintenanceLogUrl", label: "Maintenance" },
  { key: "equipmentManualUrl", label: "Equipment" },
  { key: "experimentManualUrl", label: "Experiment Manual" },
];


export function InventoryModule({ token, role }: { token: string; role: string }) {
  const canWrite = LAB_WRITE.includes(role);
  const canAddLab = SCHEDULERS.includes(role);
  const isFaculty = role === "FACULTY"; // faculty get a simplified read-only view (up to location + documents)
  const [items, setItems] = useState<Item[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [streamFilter, setStreamFilter] = useState("ALL");
  const [labFilter, setLabFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [active, setActive] = useState<Item | "new" | null>(null);
  const [addLab, setAddLab] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");

  const api = useCallback(
    (path: string, init?: RequestInit) =>
      retryFetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } }),
    [token],
  );

  const refreshVendors = useCallback(async () => {
    const v = await api("/api/vendors").catch(() => null);
    const list = v && v.ok ? await v.json() : [];
    setVendors(list);
    return list as Vendor[];
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const i = await api("/api/inventory");
      if (i.status === 401) { signOut({ callbackUrl: "/login" }); return; } // expired token -> re-login
      if (!i.ok) throw new Error(`Inventory failed (HTTP ${i.status})`);
      setItems(await i.json());
      // labs + vendors are best-effort; never block the inventory list
      api("/api/schedule/labs").then((l) => { if (l.ok) l.json().then(setLabs); }).catch(() => {});
      refreshVendors().catch(() => {});
    } catch (e) {
      setLoadError(String((e as Error).message || "Could not load inventory"));
    } finally {
      setLoading(false);
    }
  }, [api, refreshVendors]);

  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }
  async function exportXlsx() {
    const rowsByType: Record<string, Item[]> = {};
    for (const t of SHEET_TYPES) rowsByType[t.type] = items.filter((it) => it.type === t.type);
    const wb = await buildWorkbook(rowsByType, labs, false);
    downloadBlob(await wb.xlsx.writeBuffer(), "labsynch-inventory.xlsx", XLSX_MIME);
  }
  function toggleSel(id: string) { setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} selected item(s)? This cannot be undone.`)) return;
    let ok = 0; let failed = 0;
    for (const id of Array.from(selected)) {
      const r = await api(`/api/inventory/${id}`, { method: "DELETE" }).catch(() => null);
      if (r && r.ok) ok++; else failed++;
    }
    flash(failed ? `Deleted ${ok}, ${failed} couldn't be deleted` : `Deleted ${ok} item(s)`);
    setSelected(new Set()); setSelectMode(false); load();
  }

  const filtered = items.filter((x) => {
    if (typeFilter !== "ALL" && x.type !== typeFilter) return false;
    if (streamFilter !== "ALL" && (x.stream ?? "") !== streamFilter) return false;
    if (labFilter !== "ALL" && x.labId !== labFilter) return false;
    if (stockFilter === "LOW" && !((x.quantity as number) <= (x.minQuantity as number))) return false;
    if (stockFilter === "MAINT" && !x.maintenanceRequired) return false;
    if (stockFilter === "CAL" && !x.calibrationRequired) return false;
    if (stockFilter === "PAT" && !x.patRequired) return false;
    if (search && !`${x.name} ${x.category} ${x.type} ${x.stream ?? ""} ${(x.lab as Lab)?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const countByType = (t: string) => items.filter((x) => x.type === t).length;
  const countByStream = (s: string) => items.filter((x) => (x.stream ?? "") === s).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1628]">Inventory &amp; Assets</h1>
          <p className="text-sm text-gray-500">{filtered.length} item{filtered.length === 1 ? "" : "s"}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={labFilter} onChange={(e) => setLabFilter(e.target.value)} title="Filter by lab"
            className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none">
            <option value="ALL">All labs</option>
            {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} title="Filter by status"
            className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none">
            <option value="ALL">Any status</option>
            <option value="LOW">Low stock</option>
            <option value="MAINT">Maintenance required</option>
            <option value="CAL">Calibration required</option>
            <option value="PAT">PAT testing required</option>
          </select>
          <input placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
          <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
          {!isFaculty && (<div className="relative">
            <Button variant="ghost" onClick={() => setOptionsOpen((o) => !o)}>Options ▾</Button>
            {optionsOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOptionsOpen(false)} />
                <div className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-lg border border-gray-100 bg-white py-1 shadow-xl">
                  {canWrite && <button onClick={() => { setBulk(true); setOptionsOpen(false); }} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">⭱ Import (Excel)</button>}
                  <button onClick={() => { exportXlsx(); setOptionsOpen(false); }} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">⭳ Export (Excel)</button>
                  {canWrite && <button onClick={() => { setSelectMode(true); setSelected(new Set()); setOptionsOpen(false); }} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">🗑 Delete items…</button>}
                  {canAddLab && <button onClick={() => { setAddLab(true); setOptionsOpen(false); }} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">＋ Add laboratory</button>}
                </div>
              </>
            )}
          </div>)}
          {canWrite && <Button onClick={() => setActive("new")}>+ New Asset</Button>}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[{ value: "ALL", label: "All" }, ...TYPE_OPTS].map((t) => {
          const activeTab = typeFilter === t.value;
          const n = t.value === "ALL" ? items.length : countByType(t.value);
          return (
            <button key={t.value} onClick={() => setTypeFilter(t.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${activeTab ? "bg-[#0A1628] text-[#00C9A7]" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
              {t.value === "ALL" ? "All" : typePlural[t.value] ?? t.label} <span className={activeTab ? "text-white/70" : "text-gray-400"}>({n})</span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Stream</span>
        {[{ value: "ALL", label: "All" }, ...STREAMS.map((s) => ({ value: s, label: s }))].map((s) => {
          const on = streamFilter === s.value;
          const n = s.value === "ALL" ? items.length : countByStream(s.value);
          if (s.value !== "ALL" && n === 0) return null;
          return (
            <button key={s.value} onClick={() => setStreamFilter(s.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${on ? "bg-[#00C9A7] text-[#0A1628]" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
              {s.label} <span className={on ? "text-[#0A1628]/60" : "text-gray-400"}>({n})</span>
            </button>
          );
        })}
      </div>

      {selectMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-amber-700">— tick the items you want to delete</span>
          <div className="ml-auto flex gap-2">
            <Button variant="danger" onClick={deleteSelected} disabled={!selected.size}>Delete selected</Button>
            <Button variant="ghost" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>Cancel</Button>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Couldn’t load inventory: {loadError}.{" "}
          <button onClick={load} className="font-semibold underline">Retry</button>{" or "}
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="font-semibold underline">sign in again</button>.
        </div>
      ) : loading ? <p className="text-gray-400">Loading…</p> :
        filtered.length === 0 ? <p className="text-gray-400">No assets yet. {canWrite && "Click “+ New Asset” to add one."}</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((it) => {
            const low = (it.quantity as number) <= (it.minQuantity as number);
            return (
              <button key={String(it.id)} onClick={() => (selectMode ? toggleSel(String(it.id)) : setActive(it))}
                className={`group relative flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ${selectMode && selected.has(String(it.id)) ? "ring-2 ring-[#00C9A7]" : "ring-black/5"}`}>
                {selectMode && <span className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${selected.has(String(it.id)) ? "border-[#00C9A7] bg-[#00C9A7] text-white" : "border-white bg-black/30 text-transparent"}`}>✓</span>}
                <div className={`flex h-36 items-center justify-center bg-gradient-to-br ${TYPE_BG[String(it.type)] ?? "from-gray-100 to-gray-200"}`}>
                  {it.pictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(it.pictureUrl).startsWith("http") ? String(it.pictureUrl) : `${API_URL}${it.pictureUrl}`} alt="" className="h-full w-full object-contain" />
                  ) : <span className="text-4xl opacity-40">🔬</span>}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628] line-clamp-1">{String(it.name)}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE[String(it.type)] ?? "bg-gray-100 text-gray-700"}`}>{typeLabel(it.type)}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 line-clamp-1">
                    {it.stream ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{String(it.stream)}</span> : <span className="text-gray-400">—</span>}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-600">{(it.lab as Lab)?.name ?? it.location ?? "—"}</span>
                    <span className={low ? "font-semibold text-red-600" : "text-gray-700"}>{String(it.quantity)}{it.unit ? " " + it.unit : ""}{low ? " ⚠" : ""}</span>
                  </div>
                  {!isFaculty && !!(it.maintenanceRequired || it.calibrationRequired || it.patRequired) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {it.maintenanceRequired ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">Maintenance</span> : null}
                      {it.calibrationRequired ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Calibration</span> : null}
                      {it.patRequired ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">PAT</span> : null}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <AssetWindow record={active === "new" ? null : active} labs={labs} vendors={vendors} api={api} token={token} canWrite={canWrite} isFaculty={isFaculty}
          refreshVendors={refreshVendors}
          onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />
      )}
      {addLab && <AddLabWindow api={api} onClose={() => setAddLab(false)} onSaved={() => { flash("Laboratory added"); setAddLab(false); load(); }} />}
      {bulk && <ImportWindow labs={labs} vendors={vendors} token={token} api={api} onClose={() => setBulk(false)} onSaved={(m) => { flash(m); setBulk(false); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function UploadField({ label, value, itemId, token, onChange, image, disabled }: {
  label: string; value: string; itemId: string; token: string; onChange: (url: string) => void; image?: boolean; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const isLink = value.startsWith("http");
  const href = isLink ? value : `${API_URL}${value}`;
  const fileName = value && !isLink ? decodeURIComponent(value.split("/").pop() || "file") : "";
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("folder", "inventory"); fd.append("id", itemId);
    const res = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (res.ok) onChange((await res.json()).url);
  }
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {!disabled && (
          <label className="cursor-pointer rounded bg-[#0A1628] px-2.5 py-1 text-xs font-medium text-[#00C9A7] hover:brightness-110">
            {busy ? "Uploading…" : "Upload"}
            <input type="file" hidden onChange={pick} accept={image ? "image/*" : undefined} />
          </label>
        )}
      </div>
      {value ? (
        <div className="mt-2 flex items-center gap-2">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={href} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          )}
          <a href={href} target="_blank" rel="noreferrer" className="flex-1 truncate text-xs font-medium text-[#0a8d75] hover:underline">{isLink ? value : `📎 ${fileName}`}</a>
          {!disabled && <button type="button" onClick={() => onChange("")} className="shrink-0 text-xs text-red-600 hover:underline">remove</button>}
        </div>
      ) : !disabled ? (
        <div className="mt-2 flex gap-1.5">
          <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && linkInput.trim()) onChange(linkInput.trim()); }} className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-[#00C9A7] focus:outline-none" placeholder="…or paste a link" />
          <button type="button" disabled={!linkInput.trim()} onClick={() => onChange(linkInput.trim())} className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-40">Save link</button>
        </div>
      ) : <p className="mt-1 text-xs text-gray-400">None</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>{children}</div>;
}
function dateVal(v: unknown): string { if (!v) return ""; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }

function AssetWindow({ record, labs, vendors, api, token, canWrite, isFaculty, refreshVendors, onClose, onSaved }: {
  record: Item | null; labs: Lab[]; vendors: Vendor[];
  api: (p: string, i?: RequestInit) => Promise<Response>; token: string; canWrite: boolean; isFaculty?: boolean;
  refreshVendors: () => Promise<Vendor[]>;
  onClose: () => void; onSaved: (m: string) => void;
}) {
  const isNew = record === null;
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const [f, setF] = useState<Item>(() => record ? { ...record } : { type: "EQUIPMENT", priceCurrency: "AED" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [addVendor, setAddVendor] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const [consume, setConsume] = useState(false);
  const [movements, setMovements] = useState<Item[]>([]);
  const parseExtra = () => { try { const a = JSON.parse(String(record?.extraDocuments ?? "[]")); return Array.isArray(a) ? a : []; } catch { return []; } };
  const [extraDocs, setExtraDocs] = useState<{ label: string; url: string }[]>(parseExtra);
  const itemId = (record?.id as string) ?? "new";
  useEffect(() => { if (isNew || isFaculty) return; api(`/api/inventory/${itemId}/movements`).then((r) => (r.ok ? r.json() : [])).then(setMovements).catch(() => {}); }, [api, itemId, isNew, isFaculty, consume]);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const dis = !editing || !!isFaculty;
  const isEq = String(f.type) === "EQUIPMENT"; // equipment gets full compliance/docs; others are simpler
  const UAE_DEP = [
    { cat: "Computers & laptops", lifeLabel: "3 years", life: 3, rate: "33%", level: "High" },
    { cat: "Software / intangibles", lifeLabel: "3–5 years", life: 4, rate: "20–33%", level: "High" },
    { cat: "General lab instruments", lifeLabel: "5 years", life: 5, rate: "20%", level: "Medium" },
    { cat: "3D printers / fabrication tools", lifeLabel: "5 years", life: 5, rate: "20%", level: "Medium" },
    { cat: "Vehicles / drones / UAVs", lifeLabel: "5 years", life: 5, rate: "20%", level: "Medium" },
    { cat: "Robotic systems", lifeLabel: "5–10 years", life: 7, rate: "10–20%", level: "Medium" },
    { cat: "Office furniture & fixtures", lifeLabel: "10 years", life: 10, rate: "10%", level: "Low" },
    { cat: "Heavy machinery / large equipment", lifeLabel: "10 years", life: 10, rate: "10%", level: "Low" },
    { cat: "Buildings / leasehold improvements", lifeLabel: "20–25 years", life: 22, rate: "4–5%", level: "Low" },
  ];

  async function save() {
    setErr(""); setBusy(true);
    const payload = { ...f, extraDocuments: JSON.stringify(extraDocs.filter((d) => d.url || d.label)) };
    try {
      const res = isNew
        ? await api("/api/inventory", { method: "POST", body: JSON.stringify(payload) })
        : await api(`/api/inventory/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `Save failed (${res.status})`); }
      onSaved(isNew ? "Asset created" : "Asset saved");
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm("Delete this asset?")) return;
    setBusy(true);
    const res = await api(`/api/inventory/${record!.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onSaved("Asset deleted"); else setErr("Delete failed");
  }

  const vendorSelect = (key: string) => (
    <div className="flex gap-2">
      <select className={inputCls} disabled={dis} value={String(f[key] ?? "")} onChange={(e) => set(key, e.target.value)}>
        <option value="">— select vendor —</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      {editing && <button type="button" onClick={() => setAddVendor(key)} className="shrink-0 rounded-md border border-gray-300 px-2 text-sm text-gray-700 hover:bg-gray-100">+ New</button>}
    </div>
  );

  return (
    <Window width="max-w-4xl" title={isNew ? "New Asset" : String(f.name ?? "Asset")} subtitle={isNew ? "Create asset" : editing ? "Editing" : "Asset details"}
      onClose={onClose}
      footer={<>
        {!isNew && canWrite && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        {!isNew && canWrite && !editing && <Button variant="ghost" onClick={() => setConsume(true)}>Use</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setExtraDocs(parseExtra()); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <Section title="Identity">
        <F label="Name *"><input className={inputCls} disabled={dis} value={String(f.name ?? "")} onChange={(e) => set("name", e.target.value)} /></F>
        <F label="Ownership"><input className={inputCls} disabled={dis} value={String(f.ownership ?? "")} onChange={(e) => set("ownership", e.target.value)} /></F>
        <F label="Stream / category"><select className={inputCls} disabled={dis} value={String(f.stream ?? "")} onChange={(e) => set("stream", e.target.value)}><option value="">— select —</option>{STREAMS.map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
        <F label="Type *"><select className={inputCls} disabled={dis} value={String(f.type ?? "EQUIPMENT")} onChange={(e) => set("type", e.target.value)}>{TYPE_OPTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></F>
        <F label="Serial number"><input className={inputCls} disabled={dis} value={String(f.serialNumber ?? "")} onChange={(e) => set("serialNumber", e.target.value)} /></F>
        {isEq && <F label="Barcode (value)"><input className={inputCls} disabled={dis} value={String(f.barcode ?? "")} onChange={(e) => set("barcode", e.target.value)} /></F>}
        <F label="Quantity"><input type="number" className={inputCls} disabled={dis} value={String(f.quantity ?? "")} onChange={(e) => set("quantity", e.target.value)} /></F>
        {!isFaculty && <F label="Min quantity / unit"><div className="flex gap-2"><input type="number" className={inputCls} disabled={dis} value={String(f.minQuantity ?? "")} onChange={(e) => set("minQuantity", e.target.value)} /><input className={inputCls} placeholder="unit" disabled={dis} value={String(f.unit ?? "")} onChange={(e) => set("unit", e.target.value)} /></div></F>}
      </Section>

      <Section title="Location">
        <F label="Laboratory"><select className={inputCls} disabled={dis} value={String(f.labId ?? "")} onChange={(e) => set("labId", e.target.value)}><option value="">— select laboratory —</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></F>
        <F label="Sub-location (cupboard / tray no.)"><input className={inputCls} disabled={dis} value={String(f.subLocation ?? "")} onChange={(e) => set("subLocation", e.target.value)} /></F>
      </Section>

      {!isFaculty && (<>
      <Section title="Procurement & Pricing">
        <F label="Main supplier (provided by)">{vendorSelect("supplierId")}</F>
        <F label="Purchase date"><input type="date" className={inputCls} disabled={dis} value={dateVal(f.purchaseDate)} onChange={(e) => set("purchaseDate", e.target.value)} /></F>
        <F label="Useful life (years)"><input type="number" min={0} className={inputCls} placeholder="e.g. 5" disabled={dis} value={String(f.lifeYears ?? "")} onChange={(e) => set("lifeYears", e.target.value)} /></F>
        <F label="Currency"><input className={inputCls} placeholder="AED" disabled={dis} value={String(f.priceCurrency ?? "")} onChange={(e) => set("priceCurrency", e.target.value)} /></F>
        <F label="Price per piece"><input type="number" className={inputCls} placeholder="—" disabled={dis} value={String(f.pricePerPiece ?? "")} onChange={(e) => set("pricePerPiece", e.target.value)} /></F>
        {!isEq && <F label="Price per box (optional)"><input type="number" className={inputCls} placeholder="—" disabled={dis} value={String(f.pricePerBox ?? "")} onChange={(e) => set("pricePerBox", e.target.value)} /></F>}
        {!isEq && <F label="Units per box (optional)"><input type="number" className={inputCls} placeholder="e.g. 12" disabled={dis} value={String(f.unitsPerBox ?? "")} onChange={(e) => set("unitsPerBox", e.target.value)} /></F>}
      </Section>

      <Section title="Finance (CAPEX / OPEX)">
        <F label="Track in Finance">
          <select className={inputCls} disabled={dis} value={String(f.financeMode ?? "")} onChange={(e) => set("financeMode", e.target.value)}>
            <option value="">Not tracked</option>
            <option value="CAPEX">CAPEX — depreciating asset</option>
          </select>
        </F>
        {String(f.financeMode) === "CAPEX" ? <F label=" "><p className="text-xs text-gray-500">Appears in the <b>Finance → CAPEX Manager</b> automatically (cost = price/piece × quantity), depreciating over its life.</p></F>
          : <F label=" "><p className="text-xs text-gray-500">Consumables/PPE aren&apos;t flagged here — record usage with the <b>Use</b> button and it posts to <b>OPEX</b> at average cost on the usage date.</p></F>}
        {String(f.financeMode) === "CAPEX" && <>
          <F label="Annual depreciation rate (%)"><input type="number" min={0} max={100} className={inputCls} disabled={dis} placeholder="e.g. 20" value={f.lifeYears ? String(Math.round(100 / Number(f.lifeYears))) : ""} onChange={(e) => { const r = Number(e.target.value); set("lifeYears", r > 0 ? Math.max(1, Math.round(100 / r)) : ""); }} /></F>
          <F label=" " wide>
            <button type="button" onClick={() => setGuide((g) => !g)} className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">📊 {guide ? "Hide" : "Show"} UAE depreciation guide</button>
            {f.lifeYears ? <span className="ml-2 text-xs text-gray-500">≈ {String(f.lifeYears)}‑year life · {Math.round(100 / Number(f.lifeYears))}% per year (straight-line)</span> : null}
            {guide && <div className="mt-2 overflow-x-auto rounded-lg ring-1 ring-black/5">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-[#0A1628] text-white">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Asset category</th>
                    <th className="px-3 py-2 text-left font-semibold">Useful life</th>
                    <th className="px-3 py-2 text-center font-semibold">Annual rate</th>
                    <th className="px-3 py-2 text-center font-semibold">Level</th>
                    <th className="px-3 py-2 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {UAE_DEP.map((r) => (
                    <tr key={r.cat} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/60 hover:bg-[#00C9A7]/5">
                      <td className="px-3 py-2 font-medium text-gray-700">{r.cat}</td>
                      <td className="px-3 py-2 text-gray-500">{r.lifeLabel}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-gray-600">{r.rate}</td>
                      <td className="px-3 py-2 text-center"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.level === "High" ? "bg-red-100 text-red-700" : r.level === "Medium" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{r.level}</span></td>
                      <td className="px-3 py-2 text-right">{!dis && <button type="button" onClick={() => { set("lifeYears", r.life); setGuide(false); }} className="font-medium text-[#0a8d75] hover:underline">use</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </F>
        </>}
      </Section>

      {isEq && <Section title="MEP / Electrical">
        <F label="Electrical requirement"><select className={inputCls} disabled={dis} value={String(f.electricalReq ?? "")} onChange={(e) => set("electricalReq", e.target.value)}><option value="">— select —</option>{ELECTRICAL_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}</select></F>
        <F label="Additional MEP"><input className={inputCls} disabled={dis} value={String(f.additionalMep ?? "")} onChange={(e) => set("additionalMep", e.target.value)} /></F>
        <F label="PAT testing required"><select className={inputCls} disabled={dis} value={f.patRequired ? "yes" : "no"} onChange={(e) => set("patRequired", e.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></select></F>
        {f.patRequired ? <F label=" " wide><p className="text-xs text-gray-500">PAT tests are recorded in the <b>Maintenance</b> module (type: PAT) — dates &amp; certificates live there.</p></F> : <div />}
      </Section>}

      {isEq && <Section title="Maintenance & calibration">
        <F label="Maintenance required"><select className={inputCls} disabled={dis} value={f.maintenanceRequired ? "yes" : "no"} onChange={(e) => set("maintenanceRequired", e.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></select></F>
        <F label="Calibration required"><select className={inputCls} disabled={dis} value={f.calibrationRequired ? "yes" : "no"} onChange={(e) => set("calibrationRequired", e.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></select></F>
        <F label=" " wide><p className="text-xs text-gray-500">All maintenance &amp; calibration <b>records</b> — types, dates, due/expiry, costs, vendors and certificates — are created and kept in the <b>Maintenance</b> module. Flag them here and log the work there.</p></F>
      </Section>}

      <Section title="Comments">
        <F label="Comments" wide><textarea rows={2} className={inputCls} disabled={dis} value={String(f.comments ?? "")} onChange={(e) => set("comments", e.target.value)} /></F>
      </Section>
      </>)}

      <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">Images</h3>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <UploadField label="Picture" image value={String(f.pictureUrl ?? "")} itemId={itemId} token={token} disabled={dis} onChange={(u) => set("pictureUrl", u)} />
        {!isFaculty && isEq && <UploadField label="Barcode image" image value={String(f.barcodeUrl ?? "")} itemId={itemId} token={token} disabled={dis} onChange={(u) => set("barcodeUrl", u)} />}
      </div>

      {isEq && <>
        <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">Documents</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOC_FIELDS.map((d) => (
            <UploadField key={d.key} label={d.label} value={String(f[d.key] ?? "")} itemId={itemId} token={token} disabled={dis} onChange={(u) => set(d.key, u)} />
          ))}
        </div>
      </>}

      <div className="mb-2 mt-5 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">{isEq ? "Additional documents" : "Documents"} <span className="font-normal text-gray-400">(data sheets, certificates, etc.)</span></h3>
        {editing && <button type="button" onClick={() => setExtraDocs([...extraDocs, { label: "", url: "" }])} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add document</button>}
      </div>
      {extraDocs.length === 0 && <p className="text-xs text-gray-400">No additional documents.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {extraDocs.map((d, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <input className={inputCls} placeholder="Document name (e.g. Data sheet)" disabled={dis} value={d.label}
                onChange={(e) => setExtraDocs(extraDocs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              {editing && <button type="button" onClick={() => setExtraDocs(extraDocs.filter((_, j) => j !== i))} className="shrink-0 rounded px-2 text-red-600 hover:bg-red-50">✕</button>}
            </div>
            <UploadField label={d.label || "File"} value={d.url} itemId={itemId} token={token} disabled={dis}
              onChange={(u) => setExtraDocs(extraDocs.map((x, j) => j === i ? { ...x, url: u } : x))} />
          </div>
        ))}
      </div>

      {!isNew && !isFaculty && (<>
        <h3 className="mb-2 mt-5 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">Stock history <span className="font-normal text-gray-400">(audit ledger)</span></h3>
        {movements.length === 0 ? <p className="text-xs text-gray-400">No stock movements recorded yet.</p> : (
          <div className="max-h-56 overflow-auto rounded-lg ring-1 ring-black/5">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-500"><tr>{["Date", "Change", "Reason", "Unit cost", "Note"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={String(m.id)} className="border-t border-gray-50">
                    <td className="px-2 py-1 text-gray-500">{m.date ? new Date(String(m.date)).toLocaleDateString() : ""}</td>
                    <td className={`px-2 py-1 font-semibold ${Number(m.delta) < 0 ? "text-red-600" : "text-[#0a8d75]"}`}>{Number(m.delta) > 0 ? "+" : ""}{String(m.delta)}</td>
                    <td className="px-2 py-1 capitalize text-gray-600">{String(m.reason)}</td>
                    <td className="px-2 py-1 text-gray-500">{m.unitCost != null ? `${Number(m.unitCost).toLocaleString()} AED` : ""}</td>
                    <td className="px-2 py-1 text-gray-400">{String(m.note ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>)}

      {addVendor && (
        <VendorForm record={null} api={api} token={token} onClose={() => setAddVendor(null)}
          onSaved={async (_m, saved) => { const key = addVendor; setAddVendor(null); await refreshVendors(); if (saved?.id) set(key, String(saved.id)); }} />
      )}
      {consume && record && <ConsumeWindow item={record} api={api} onClose={() => setConsume(false)} onSaved={(m) => { setConsume(false); onSaved(m); }} />}
    </Window>
  );
}

// Record consumption (used / broken / borrowed): drops stock + posts OPEX at the item's average cost.
function ConsumeWindow({ item, api, onClose, onSaved }: { item: Item; api: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: (m: string) => void }) {
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const price = Number(item.pricePerPiece) || 0;
  async function save() {
    if (qty <= 0) { setErr("Quantity must be at least 1"); return; }
    setBusy(true); setErr("");
    const r = await api(`/api/inventory/${String(item.id)}/consume`, { method: "POST", body: JSON.stringify({ quantity: qty, date, reason }) });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      const amt = d && d.amount != null ? Number(d.amount) : price * qty;
      setBusy(false);
      onSaved(amt ? `Recorded use of ${qty} — ${amt.toLocaleString()} AED posted to OPEX` : `Recorded use of ${qty} (no unit price set — 0 AED to OPEX)`);
    } else { setBusy(false); const e = await r.json().catch(() => ({})); setErr(e.error ?? "Failed"); }
  }
  return (
    <Window title={`Use / consume — ${String(item.name ?? "")}`} subtitle="Drops stock and posts to Finance OPEX" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Record use"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Quantity used *</label><input type="number" min={1} className={inputCls} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Date</label><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Reason (used / broken / borrowed…)</label><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. broken" /></div>
        <p className="sm:col-span-2 text-xs text-gray-500">{price ? `At ${price.toLocaleString()} AED each → ` : "No recorded unit price — "}<b>{(price * qty).toLocaleString()} AED</b> to OPEX on {date}. Stock drops by {qty}.</p>
      </div>
    </Window>
  );
}

function AddLabWindow({ api, onClose, onSaved }: { api: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", building: "", floor: "", roomNo: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!f.name) { setErr("Name is required"); return; }
    setBusy(true); setErr("");
    const res = await api("/api/schedule/labs", { method: "POST", body: JSON.stringify(f) });
    setBusy(false);
    if (res.ok) onSaved(); else setErr("Failed (need coordinator/admin role)");
  }
  return (
    <Window title="Add Laboratory" subtitle="Basic details — add facilities later in the Facilities page" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Add"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Lab name *"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></F>
        <F label="Building"><input className={inputCls} value={f.building} onChange={(e) => setF({ ...f, building: e.target.value })} /></F>
        <F label="Floor"><input className={inputCls} value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} /></F>
        <F label="Room no."><input className={inputCls} value={f.roomNo} onChange={(e) => setF({ ...f, roomNo: e.target.value })} /></F>
      </div>
    </Window>
  );
}

// ── Import / export via Excel (.xlsx). One sheet per type; documents & images are NOT included. ──
const SHEET_TYPES: { type: string; sheet: string }[] = [
  { type: "EQUIPMENT", sheet: "Equipment" },
  { type: "TOOL", sheet: "Tools" },
  { type: "PPE", sheet: "PPE" },
  { type: "CONSUMABLE", sheet: "Consumables" },
];
const XL_COLS: { key: string; label: string; width: number }[] = [
  { key: "name", label: "Name", width: 28 },
  { key: "category", label: "Category", width: 16 },
  { key: "stream", label: "Stream", width: 16 },
  { key: "quantity", label: "Quantity", width: 10 },
  { key: "minQuantity", label: "Min quantity", width: 12 },
  { key: "unit", label: "Unit", width: 10 },
  { key: "serialNumber", label: "Serial number", width: 16 },
  { key: "barcode", label: "Barcode", width: 14 },
  { key: "ownership", label: "Ownership", width: 16 },
  { key: "lab", label: "Lab", width: 18 },
  { key: "subLocation", label: "Sub-location", width: 14 },
  { key: "supplier", label: "Supplier", width: 18 },
  { key: "purchaseDate", label: "Purchase date", width: 14 },
  { key: "priceCurrency", label: "Currency", width: 10 },
  { key: "pricePerPiece", label: "Price per piece", width: 14 },
  { key: "pricePerBox", label: "Price per box", width: 13 },
  { key: "unitsPerBox", label: "Units per box", width: 13 },
  { key: "lifeYears", label: "Life (years)", width: 11 },
  { key: "financeMode", label: "Finance (CAPEX or blank)", width: 20 },
  { key: "electricalReq", label: "Electrical requirement", width: 20 },
  { key: "additionalMep", label: "Additional MEP", width: 16 },
  { key: "maintenanceRequired", label: "Maintenance required", width: 18 },
  { key: "calibrationRequired", label: "Calibration required", width: 18 },
  { key: "patRequired", label: "PAT required", width: 12 },
  { key: "comments", label: "Comments", width: 26 },
  { key: "notes", label: "Notes", width: 26 },
];
const XL_BOOL = ["patRequired", "maintenanceRequired", "calibrationRequired"];
const XL_DATES = ["purchaseDate"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LABEL_TO_KEY: Record<string, string> = {};
XL_COLS.forEach((c) => { LABEL_TO_KEY[norm(c.label)] = c.key; LABEL_TO_KEY[norm(c.key)] = c.key; });
Object.assign(LABEL_TO_KEY, { laboratory: "lab", qty: "quantity", price: "pricePerPiece", currency: "priceCurrency", vendor: "supplier", serial: "serialNumber" });
const parseBool = (v: unknown) => ["yes", "y", "true", "1", "required", "x", "✓"].includes(String(v).toLowerCase().trim());
const xlsxDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : "");

function downloadBlob(data: BlobPart, name: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// Build a styled workbook: one sheet per type, bold coloured header row, all columns.
async function buildWorkbook(rowsByType: Record<string, Item[]>, labs: Lab[], withExample: boolean) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const cellVal = (it: Item, key: string): string | number => {
    if (key === "lab") return (it.lab as Lab)?.name ?? "";
    if (XL_BOOL.includes(key)) return it[key] ? "Yes" : "No";
    if (XL_DATES.includes(key)) return xlsxDate(it[key]);
    const v = it[key];
    return v == null ? "" : (typeof v === "number" ? v : String(v));
  };
  for (const { type, sheet } of SHEET_TYPES) {
    const ws = wb.addWorksheet(sheet);
    ws.columns = XL_COLS.map((c) => ({ header: c.label, key: c.key, width: c.width }));
    const hr = ws.getRow(1);
    hr.height = 22;
    hr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1628" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF00C9A7" } } };
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const it of (rowsByType[type] ?? [])) ws.addRow(Object.fromEntries(XL_COLS.map((c) => [c.key, cellVal(it, c.key)])));
    if (withExample && type === "EQUIPMENT" && !(rowsByType[type] ?? []).length) {
      ws.addRow({ name: "Digital Multimeter", category: "Test & Measurement", stream: "Teaching", quantity: 5, minQuantity: 1, unit: "pcs", serialNumber: "SN-001", ownership: "EE Dept", lab: labs[0]?.name ?? "Electronics Lab", subLocation: "Cupboard 3", supplier: "Acme Instruments", purchaseDate: "2025-01-15", priceCurrency: "AED", pricePerPiece: 250, lifeYears: 7, financeMode: "CAPEX", electricalReq: "Single phase", patRequired: "Yes", maintenanceRequired: "Yes", maintenanceType: "INHOUSE", maintenanceFrequency: "ANNUAL", nextMaintenanceDue: "2026-02-01", calibrationRequired: "Yes", calibrationType: "OUTSOURCE", calibrationFrequency: "ANNUAL", calibrationExpiry: "2026-03-01", notes: "Fluke 87V" });
    }
  }
  return wb;
}
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function ImportWindow({ labs, vendors, api, onClose, onSaved }: {
  labs: Lab[]; vendors: Vendor[]; token: string; api: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: (m: string) => void;
}) {
  const [parsed, setParsed] = useState<Item[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState("");

  async function downloadTemplate() {
    const wb = await buildWorkbook({}, labs, true);
    downloadBlob(await wb.xlsx.writeBuffer(), "labsynch-inventory-template.xlsx", XLSX_MIME);
  }

  async function onFile(file: File) {
    setFileName(file.name); setErr(""); setResult("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const labByName = new Map(labs.map((l) => [l.name.toLowerCase().trim(), l.id]));
      const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase().trim(), v.id]));
      const out: Item[] = [];
      wb.eachSheet((ws) => {
        const sheetType = SHEET_TYPES.find((s) => s.sheet.toLowerCase() === ws.name.toLowerCase())?.type ?? "EQUIPMENT";
        const idxToKey: Record<number, string> = {};
        ws.getRow(1).eachCell((cell, col) => { const k = LABEL_TO_KEY[norm(String(cell.value ?? ""))]; if (k) idxToKey[col] = k; });
        if (!Object.keys(idxToKey).length) return;
        for (let r = 2; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const obj: Item = { type: sheetType };
          let has = false;
          for (const [col, key] of Object.entries(idxToKey)) {
            let v: unknown = row.getCell(Number(col)).value;
            if (v && typeof v === "object" && "text" in (v as object)) v = (v as { text: string }).text;
            if (v != null && String(v).trim() !== "") { obj[key] = v; has = true; }
          }
          if (!has || !String(obj.name ?? "").trim()) continue;
          for (const b of XL_BOOL) if (b in obj) obj[b] = parseBool(obj[b]);
          for (const d of XL_DATES) if (obj[d]) obj[d] = xlsxDate(obj[d]);
          if (obj.lab) { const id = labByName.get(String(obj.lab).toLowerCase().trim()); if (id) obj.labId = id; delete obj.lab; }
          if (obj.supplier) { const id = vendorByName.get(String(obj.supplier).toLowerCase().trim()); if (id) obj.supplierId = id; delete obj.supplier; }
          if (obj.serviceProvider) { const id = vendorByName.get(String(obj.serviceProvider).toLowerCase().trim()); if (id) obj.serviceProviderId = id; delete obj.serviceProvider; }
          out.push(obj);
        }
      });
      if (!out.length) { setErr("No item rows found. Use the template — one sheet per type, with a Name in each row."); setParsed([]); return; }
      setParsed(out);
    } catch { setErr("Couldn't read that file — please use the .xlsx template."); setParsed([]); }
  }

  async function importAll() {
    if (!parsed.length) { setErr("Nothing to import yet — upload the filled template."); return; }
    setBusy(true); setErr(""); setResult("");
    let ok = 0; const fails: string[] = [];
    for (const it of parsed) {
      const res = await api("/api/inventory", { method: "POST", body: JSON.stringify(it) });
      if (res.ok) ok++; else { const e = await res.json().catch(() => ({})); fails.push(`${String(it.name)}: ${e.error ?? res.status}`); }
    }
    setBusy(false);
    if (fails.length === 0) onSaved(`${ok} item${ok === 1 ? "" : "s"} imported`);
    else setResult(`Imported ${ok}. Failed ${fails.length}: ${fails.slice(0, 5).join(" · ")}${fails.length > 5 ? " …" : ""}`);
  }

  return (
    <Window width="max-w-4xl" title="Import items from Excel" subtitle="Download the template (a sheet per type), fill it, then upload the .xlsx" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={importAll} disabled={busy || !parsed.length}>{busy ? "Importing…" : `Import ${parsed.length || ""} item${parsed.length === 1 ? "" : "s"}`}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {result && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{result}</p>}

      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-gray-600">
        <li><button type="button" onClick={downloadTemplate} className="font-semibold text-[#0a8d75] underline">Download the Excel template</button> — separate sheets for Equipment, Tools, PPE, Consumables.</li>
        <li>Fill one row per item under the matching sheet. <b>Required:</b> Name (the type comes from the sheet).</li>
        <li>Save and <b>upload the .xlsx</b> below. (Documents &amp; images aren&apos;t in the sheet — add those on the item afterwards.)</li>
      </ol>

      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 px-3 py-6 text-sm text-gray-600 hover:bg-gray-50">
        {fileName ? `📄 ${fileName}` : "📤 Upload filled .xlsx"}
        <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>

      {parsed.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-[#0A1628]">{parsed.length} item(s) ready to import</p>
          <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-500"><tr><th className="px-2 py-1">Name</th><th className="px-2 py-1">Type</th><th className="px-2 py-1">Stream</th><th className="px-2 py-1">Qty</th></tr></thead>
              <tbody>
                {parsed.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100"><td className="px-2 py-1 font-medium text-[#0A1628]">{String(it.name)}</td><td className="px-2 py-1">{String(it.type)}</td><td className="px-2 py-1">{String(it.stream ?? "")}</td><td className="px-2 py-1">{String(it.quantity ?? "")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Window>
  );
}
