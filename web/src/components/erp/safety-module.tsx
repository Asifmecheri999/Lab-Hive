"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const LAB_WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
type Row = Record<string, unknown>;
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";

// Safety document categories. `type` is a free string on SafetyDocument; "TEMPLATE" marks a blank form.
const SAFETY_TYPES = [
  { v: "SOP", l: "Safety Operating Procedure" },
  { v: "STANDARD_OP", l: "Standard Operating Procedure" },
  { v: "RA", l: "Risk Assessment" },
  { v: "COSHH", l: "COSHH" },
];
const EXTRA_LABELS: Record<string, string> = { MAINTENANCE: "Maintenance", CALIBRATION: "Calibration", EQUIPMENT_MANUAL: "Equipment Manual", EXPERIMENT_MANUAL: "Experiment Manual", MANUAL: "Manual", OTHER: "Document" };
const typeLabel = (v: string) => EXTRA_LABELS[v] ?? (SAFETY_TYPES.find((t) => t.v === v)?.l ?? v.replace(/_/g, " "));
const typeColor: Record<string, string> = { SOP: "#00C9A7", STANDARD_OP: "#2563eb", RA: "#f59e0b", COSHH: "#8b5cf6", TEMPLATE: "#0ea5e9", MAINTENANCE: "#ef4444", CALIBRATION: "#0891b2", EQUIPMENT_MANUAL: "#64748b", EXPERIMENT_MANUAL: "#0d9488", MANUAL: "#64748b", OTHER: "#94a3b8" };
const docHref = (u: string) => (u && u.startsWith("/") ? `${API_URL}${u}` : u);
// Order the Document Hub shows category sections in.
const DOC_CATEGORIES = ["SOP", "STANDARD_OP", "RA", "COSHH", "CALIBRATION", "MAINTENANCE", "EQUIPMENT_MANUAL", "EXPERIMENT_MANUAL", "OTHER"];

// Document fields that live directly on an inventory item (single link each → editable/pushable).
const INV_DOC_FIELDS: { key: string; type: string }[] = [
  { key: "safetyOperatingProcedureUrl", type: "SOP" },
  { key: "standardOperatingProcedureUrl", type: "STANDARD_OP" },
  { key: "riskAssessmentUrl", type: "RA" },
  { key: "calibrationCertificateUrl", type: "CALIBRATION" },
  { key: "maintenanceLogUrl", type: "MAINTENANCE" },
  { key: "experimentManualUrl", type: "EXPERIMENT_MANUAL" },
  { key: "equipmentManualUrl", type: "EQUIPMENT_MANUAL" },
];

type Doc = { id: string; title: string; type: string; fileUrl: string; equipment?: string | null; version?: string | null; source: "safety" | "inventory" | "maintenance"; invItemId?: string; invField?: string };

export function SafetyModule({ token, role }: { token: string; role: string }) {
  const canWrite = LAB_WRITE.includes(role);
  const [tab, setTab] = useState<"docs" | "templates">("docs");
  const [records, setRecords] = useState<Doc[]>([]); // all SafetyDocument records
  const [invDocs, setInvDocs] = useState<Doc[]>([]); // derived from inventory items (incl. calibration & maintenance docs)
  const [typeF, setTypeF] = useState("ALL");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [docModal, setDocModal] = useState<null | string>(null); // null = closed; else default type
  const [tplModal, setTplModal] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editInv, setEditInv] = useState<Doc | null>(null);
  const [toast, setToast] = useState("");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const mapSafety = (d: Row): Doc => ({ id: String(d.id), title: String(d.title), type: String(d.type), fileUrl: String(d.fileUrl ?? ""), equipment: d.equipment as string, version: d.version as string, source: "safety" });
    const isLab = canWrite;               // lab team: everything (incl. maintenance/calibration)
    const isStudent = role === "STUDENT"; // student: only their issued items
    const isFaculty = role === "FACULTY"; // faculty: only their own RA submissions + templates
    try {
      const r = await api("/api/safety/documents");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw: Row[] = await r.json();
      if (isStudent || isFaculty) {
        // Students & faculty: blank templates (forms) + their OWN RA submissions only.
        // (Faculty exclude the RAs they merely supervise — those belong to their students.)
        const templates = raw.filter((d) => String(d.type) === "TEMPLATE").map(mapSafety);
        const ra = await api("/api/safety/ra").then((x) => (x.ok ? x.json() : [])).catch(() => []);
        const mine = (Array.isArray(ra) ? ra : []).filter((d: Row) => !isFaculty || d.relation !== "supervisor").map(mapSafety);
        setRecords([...mine, ...templates]);
      } else {
        setRecords(raw.map(mapSafety)); // lab team: all documents
      }

      // Students & faculty only see inventory docs for items in THEIR OWN issuances
      // (faculty: their own borrowings only, not the students' issuances they supervise).
      let issued: Set<string> | null = null;
      if (isStudent || isFaculty) {
        const iss = await api("/api/issuances").then((x) => (x.ok ? x.json() : [])).catch(() => []);
        issued = new Set<string>();
        (Array.isArray(iss) ? iss : [])
          .filter((s: Row) => !isFaculty || s.relation === "owner")
          .forEach((s: Row) => ((s.items as Row[]) ?? []).forEach((it) => { if (it.itemId) issued!.add(String(it.itemId)); }));
      }
      api("/api/inventory").then((x) => { if (x.ok) x.json().then((items: Row[]) => {
        const out: Doc[] = [];
        for (const it of items) {
          if (issued && !issued.has(String(it.id))) continue;
          const name = String(it.name ?? "Equipment");
          for (const fd of INV_DOC_FIELDS) {
            if (!isLab && (fd.type === "MAINTENANCE" || fd.type === "CALIBRATION")) continue; // hide maintenance log + calibration results from non-lab
            const u = it[fd.key];
            if (u) out.push({ id: `inv-${it.id}-${fd.key}`, title: name, type: fd.type, fileUrl: String(u), equipment: name, source: "inventory", invItemId: String(it.id), invField: fd.key });
          }
          let extra: { label: string; url: string }[] = [];
          try { extra = JSON.parse(String(it.extraDocuments ?? "[]")); } catch { extra = []; }
          extra.forEach((d, i) => { if (d.url) out.push({ id: `inv-${it.id}-extra-${i}`, title: d.label || name, type: "OTHER", fileUrl: d.url, equipment: name, source: "inventory" }); });
        }
        setInvDocs(out);
      }); }).catch(() => {});
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api, canWrite, role]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const ql = q.trim().toLowerCase();
  const matchQ = (d: Doc) => !ql || [d.title, d.equipment, typeLabel(d.type)].filter(Boolean).join(" ").toLowerCase().includes(ql);
  const documents = [...records.filter((d) => d.type !== "TEMPLATE"), ...invDocs];
  const shownDocs = documents.filter(matchQ);                          // search only — categories are shown as sections
  const byCat = (cat: string) => shownDocs.filter((d) => d.type === cat);
  const activeCats = DOC_CATEGORIES.filter((c) => documents.some((d) => d.type === c)); // categories that have any docs
  const visibleCats = typeF === "ALL" ? activeCats : [typeF];          // chip filter narrows to one category
  const userTemplates = records.filter((d) => d.type === "TEMPLATE" && matchQ(d));

  const TabBtn = ({ id, label }: { id: "docs" | "templates"; label: string }) => (
    <button onClick={() => { setTab(id); setQ(""); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</button>
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#0A1628]">Document Hub</h1>
        <p className="text-sm text-gray-500">{role === "FACULTY" ? "Your risk assessment submissions and the blank templates you can download" : "SOPs, risk assessments, COSHH, inventory & maintenance documents, and templates"}</p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <TabBtn id="docs" label="Documents" />
        <TabBtn id="templates" label="Templates" />
      </div>

      {err && <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>}

      {/* ── DOCUMENTS (grouped into category sections) ── */}
      {tab === "docs" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
            <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
            {canWrite && <div className="ml-auto"><Button onClick={() => setDocModal("SOP")}>+ Add document</Button></div>}
          </div>

          {!loading && activeCats.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              <CatChip active={typeF === "ALL"} onClick={() => setTypeF("ALL")} color="#0A1628" label="All" count={shownDocs.length} />
              {activeCats.map((c) => <CatChip key={c} active={typeF === c} onClick={() => setTypeF(c)} color={typeColor[c] ?? "#64748b"} label={typeLabel(c)} count={byCat(c).length} />)}
            </div>
          )}

          {loading ? <p className="text-gray-400">Loading…</p>
            : documents.length === 0 ? <p className="text-gray-400">No documents yet. Add one, or attach SOP/RA links to inventory items — they appear here automatically.</p>
            : shownDocs.length === 0 ? <p className="text-gray-400">No documents match your search.</p>
            : (
            <div className="space-y-8">
              {visibleCats.map((cat) => {
                const list = byCat(cat);
                if (!list.length) return null;
                return (
                  <section key={cat}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: typeColor[cat] ?? "#64748b" }} />
                      <h2 className="text-sm font-bold uppercase tracking-wide text-[#0A1628]">{typeLabel(cat)}</h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{list.length}</span>
                    </div>
                    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((d) => <DocTile key={d.id} d={d} onEdit={canWrite ? (d.source === "safety" ? () => setEditDoc(d) : (d.source === "inventory" && d.invField) ? () => setEditInv(d) : undefined) : undefined} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TEMPLATES ── */}
      {tab === "templates" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
            <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
            {canWrite && <div className="ml-auto"><Button onClick={() => setTplModal(true)}>+ Add template</Button></div>}
          </div>
          <p className="mb-4 text-xs text-gray-400">Upload blank forms here. Download one, fill it in (save/print as PDF), then upload it back as a Document.</p>

          {userTemplates.length === 0 ? <p className="text-sm text-gray-400">No templates yet. {canWrite && "Click “+ Add template” to upload your own blank form."}</p> : (
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {userTemplates.map((d) => <DocTile key={d.id} d={d} onEdit={canWrite ? () => setEditDoc(d) : undefined} />)}
            </div>
          )}
        </div>
      )}

      {docModal && <DocForm api={api} token={token} title="Add document" subtitle="SOP / Standard OP / RA / COSHH" defaultType={docModal} lockType={false} onClose={() => setDocModal(null)} onSaved={() => { setDocModal(null); flash("Document added"); load(); }} />}
      {tplModal && <DocForm api={api} token={token} title="Add blank template" subtitle="Upload your own blank form" defaultType="TEMPLATE" lockType onClose={() => setTplModal(false)} onSaved={() => { setTplModal(false); flash("Template added"); load(); }} />}
      {editDoc && <DocForm api={api} token={token} title={editDoc.type === "TEMPLATE" ? "Edit template" : "Edit document"} subtitle="Update the link, details, or delete" defaultType={editDoc.type} lockType={editDoc.type === "TEMPLATE"} record={editDoc} onClose={() => setEditDoc(null)} onSaved={(m) => { setEditDoc(null); flash(m); load(); }} />}
      {editInv && <InvDocWindow doc={editInv} api={api} token={token} onClose={() => setEditInv(null)} onSaved={(m) => { setEditInv(null); flash(m); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

// A category filter pill (colour dot + label + count) above the grouped sections.
function CatChip({ active, onClick, color, label, count }: { active: boolean; onClick: () => void; color: string; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "border-transparent bg-[#0A1628] text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{count}</span>
    </button>
  );
}

function DocTile({ d, onEdit }: { d: Doc; onEdit?: () => void }) {
  const bar = { background: typeColor[d.type] ?? "#64748b" };
  const inner = (
    <div className="p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={bar}>{d.type === "TEMPLATE" ? "Template" : typeLabel(d.type)}</span>
        {d.source === "inventory" && <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">from inventory</span>}
        {d.source === "maintenance" && <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">from maintenance</span>}
      </div>
      <h3 className="mt-2 font-semibold text-[#0A1628]">{d.title}</h3>
      <p className="mt-1 text-xs text-gray-500">{[d.equipment, d.version ? `v${d.version}` : null].filter(Boolean).join(" · ") || "—"}</p>
      <div className="mt-3 flex items-center gap-3 text-xs">
        {d.fileUrl ? <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); window.open(docHref(d.fileUrl), "_blank", "noopener,noreferrer"); }} className="cursor-pointer font-semibold text-[#0a8d75] hover:underline">Open ↗</span> : <span className="text-gray-400">No link</span>}
        {onEdit && <span className="ml-auto font-semibold text-gray-400">Edit ›</span>}
      </div>
    </div>
  );
  if (onEdit) return <button onClick={onEdit} className="w-full overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg"><div className="h-2" style={bar} />{inner}</button>;
  return <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5"><div className="h-2" style={bar} />{inner}</div>;
}

function DocForm({ api, token, title, subtitle, defaultType, lockType, record, onClose, onSaved }: {
  api: (p: string, i?: RequestInit) => Promise<Response>; token: string; title: string; subtitle: string; defaultType: string; lockType: boolean; record?: Doc;
  onClose: () => void; onSaved: (m: string) => void;
}) {
  const isEdit = !!record;
  const [f, setF] = useState<Row>(() => record ? { title: record.title, type: record.type, equipment: record.equipment ?? "", version: record.version ?? "" } : { type: defaultType, version: "1.0" });
  const [uploaded, setUploaded] = useState<string>(() => (record && record.fileUrl.startsWith("/") ? record.fileUrl : ""));
  const [linkVal, setLinkVal] = useState<string>(() => (record && record.fileUrl && !record.fileUrl.startsWith("/") ? record.fileUrl : ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function upload(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "safety"); fd.append("id", "doc");
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setUploaded(String(d.url ?? "")); } else setErr("Upload failed — is R2 file storage enabled?");
  }
  async function save() {
    const fileUrl = uploaded || linkVal.trim();
    if (!f.title || !f.type || !fileUrl) { setErr("Title and a file (upload or link) are required"); return; }
    setBusy(true); setErr("");
    const body = JSON.stringify({ ...f, fileUrl });
    const r = isEdit ? await api(`/api/safety/documents/${record!.id}`, { method: "PUT", body })
      : await api("/api/safety/documents", { method: "POST", body });
    setBusy(false);
    if (r.ok) onSaved(isEdit ? "Saved" : "Added"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function del() {
    if (!confirm("Delete this?")) return;
    setBusy(true); setErr("");
    const r = await api(`/api/safety/documents/${record!.id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onSaved("Deleted"); else setErr("Delete failed");
  }
  return (
    <Window width="max-w-4xl" title={title} subtitle={subtitle} onClose={onClose}
      footer={<>{isEdit && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save" : "Add"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Title *</label><input className={inputCls} value={String(f.title ?? "")} onChange={(e) => set("title", e.target.value)} /></div>
        {!lockType && <div><label className="mb-1 block text-xs font-medium text-gray-600">Type *</label><select className={inputCls} value={String(f.type ?? "SOP")} onChange={(e) => set("type", e.target.value)}>{SAFETY_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Upload a file</label>
          {uploaded ? (
            <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
              <a href={docHref(uploaded)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">⬇ Download uploaded file</a>
              <button type="button" onClick={() => setUploaded("")} className="text-xs text-red-600 hover:underline">remove</button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">{busy ? "Uploading…" : "📎 Attach file"}<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); }} /></label>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Or paste a link</label>
          <input className={inputCls} value={linkVal} onChange={(e) => setLinkVal(e.target.value)} placeholder="https://…" />
        </div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Equipment / process</label><input className={inputCls} value={String(f.equipment ?? "")} onChange={(e) => set("equipment", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Version</label><input className={inputCls} value={String(f.version ?? "")} onChange={(e) => set("version", e.target.value)} /></div>
      </div>
    </Window>
  );
}

// Edit a document that lives on an inventory item, and push the change back to that item.
function InvDocWindow({ doc, api, token, onClose, onSaved }: {
  doc: Doc; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; onClose: () => void; onSaved: (m: string) => void;
}) {
  const [uploaded, setUploaded] = useState<string>(() => (doc.fileUrl.startsWith("/") ? doc.fileUrl : ""));
  const [linkVal, setLinkVal] = useState<string>(() => (doc.fileUrl && !doc.fileUrl.startsWith("/") ? doc.fileUrl : ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function upload(file: File) {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "inventory"); fd.append("id", doc.invItemId ?? "item");
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setUploaded(String(d.url ?? "")); setLinkVal(""); } else setErr("Upload failed — is R2 file storage enabled?");
  }
  async function save() {
    const url = uploaded || linkVal.trim();
    if (!url) { setErr("Provide a file (upload) or a link"); return; }
    if (!confirm(`Push this change to the inventory item “${doc.equipment}”? It will update the ${typeLabel(doc.type)} on that item.`)) return;
    setBusy(true); setErr("");
    const r = await api(`/api/inventory/${doc.invItemId}`, { method: "PUT", body: JSON.stringify({ [doc.invField as string]: url }) });
    setBusy(false);
    if (r.ok) onSaved("Pushed to inventory"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Push failed"); }
  }
  async function removeFromItem() {
    if (!confirm(`Remove this ${typeLabel(doc.type)} from “${doc.equipment}” in inventory?`)) return;
    setBusy(true); setErr("");
    const r = await api(`/api/inventory/${doc.invItemId}`, { method: "PUT", body: JSON.stringify({ [doc.invField as string]: "" }) });
    setBusy(false);
    if (r.ok) onSaved("Removed from item"); else setErr("Remove failed");
  }
  return (
    <Window width="max-w-3xl" title={`${doc.equipment} — ${typeLabel(doc.type)}`} subtitle="From inventory · edit & push the change back to the item" onClose={onClose}
      footer={<><Button variant="danger" onClick={removeFromItem} disabled={busy}>Remove</Button><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save & push to inventory"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">This document lives on the inventory item. Changes update Inventory directly — you’ll be asked to confirm before anything is pushed.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Upload a file</label>
          {uploaded ? (
            <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
              <a href={docHref(uploaded)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">⬇ {decodeURIComponent(uploaded.split("/").pop() || "file")}</a>
              <button type="button" onClick={() => setUploaded("")} className="text-xs text-red-600 hover:underline">remove</button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">{busy ? "Uploading…" : "📎 Attach file"}<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); }} /></label>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Or paste a link</label>
          <input className={inputCls} value={linkVal} onChange={(e) => setLinkVal(e.target.value)} placeholder="https://…" />
        </div>
      </div>
    </Window>
  );
}
