"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN", "FACULTY"];
type Row = Record<string, unknown>;
type Lab = { id: string; name: string };
type Subject = { id: string; name: string; code?: string | null };
type Inv = { id: string; name: string; type: string; quantity?: number | null; unit?: string | null; pricePerPiece?: number | null; pricePerBox?: number | null; riskAssessmentUrl?: string | null; safetyOperatingProcedureUrl?: string | null; standardOperatingProcedureUrl?: string | null; equipmentManualUrl?: string | null; experimentManualUrl?: string | null; maintenanceLogUrl?: string | null; extraDocuments?: string | null };
type EDoc = { label: string; url: string };

const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString()} AED`;
const TYPE_LABEL: Record<string, string> = { EQUIPMENT: "Equipment", TOOL: "Tool", PPE: "PPE", CONSUMABLE: "Consumable" };
const tlabel = (t?: string) => TYPE_LABEL[t ?? ""] ?? (t ?? "");

// Document fields carried on an inventory item — pulled into the experiment automatically.
// NOTE: maintenance documents (e.g. maintenance log) are intentionally excluded from experiments.
const ITEM_DOC_FIELDS: [keyof Inv, string][] = [
  ["riskAssessmentUrl", "Risk Assessment"], ["safetyOperatingProcedureUrl", "SOP"], ["standardOperatingProcedureUrl", "Standard OP"],
  ["equipmentManualUrl", "Equipment Manual"], ["experimentManualUrl", "Experiment Manual"],
];
// Legacy fixed doc columns on older experiments — folded into the documents list on open.
const LEGACY_EXP_DOCS: [string, string][] = [
  ["experimentManualUrl", "Experiment Manual"], ["equipmentManualUrl", "Equipment Manual"], ["riskAssessmentUrl", "Risk Assessment"],
  ["safetyOperatingProcedureUrl", "SOP"], ["standardOperatingProcedureUrl", "Standard OP"],
];
function itemDocs(it: Inv): EDoc[] {
  const out: EDoc[] = [];
  for (const [k, l] of ITEM_DOC_FIELDS) { const u = String(it[k] ?? ""); if (u) out.push({ label: `${it.name} — ${l}`, url: u }); }
  try { const ex = JSON.parse(String(it.extraDocuments ?? "[]")); if (Array.isArray(ex)) for (const d of ex) if (d?.url) out.push({ label: `${it.name} — ${String(d.label ?? "Document")}`, url: String(d.url) }); } catch { /* ignore */ }
  return out;
}
const mergeDocs = (cur: EDoc[], add: EDoc[]) => { const seen = new Set(cur.map((d) => d.url)); return [...cur, ...add.filter((d) => d.url && !seen.has(d.url))]; };

function ItemPicker({ inv, value, onChange, disabled }: { inv: Inv[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const sel = inv.find((i) => i.id === value);
  const list = inv.filter((i) => `${i.name} ${i.type}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <div className="relative">
      <input className={inputCls} disabled={disabled} placeholder="Search item…"
        value={open ? q : sel ? `${sel.name} (${tlabel(sel.type)})` : ""}
        onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {list.map((i) => {
            const qty = Number(i.quantity ?? 0);
            return (
            <button type="button" key={i.id} onMouseDown={() => { onChange(i.id); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50">
              <span>{i.name} <span className="text-gray-400">({tlabel(i.type)})</span></span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${qty > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{qty > 0 ? `${qty} in stock` : "out of stock"}</span>
            </button>
            );
          })}
          {list.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No match</p>}
        </div>
      )}
    </div>
  );
}

export function ExperimentsModule({ token, role }: { token: string; role: string }) {
  const canWrite = WRITE.includes(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [facultyReg, setFacultyReg] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [labFilter, setLabFilter] = useState("ALL");
  const [facFilter, setFacFilter] = useState("ALL");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/experiments");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
      api("/api/schedule/labs").then((l) => { if (l.ok) l.json().then(setLabs); }).catch(() => {});
      api("/api/subjects").then((s) => { if (s.ok) s.json().then(setSubjects); }).catch(() => {});
      api("/api/inventory").then((i) => { if (i.ok) i.json().then(setInv); }).catch(() => {});
      api("/api/experiments/people").then((x) => { if (x.ok) x.json().then((l: { name: string }[]) => setFacultyReg(l.map((p) => p.name))); }).catch(() => {});
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const faculties = Array.from(new Set(facultyReg.filter(Boolean))); // FACULTY users only
  const filtered = rows.filter((r) => (labFilter === "ALL" || r.labId === labFilter) && (facFilter === "ALL" || r.facultyName === facFilter));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Experiments</h1><p className="text-sm text-gray-500">{filtered.length} experiment{filtered.length === 1 ? "" : "s"}</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={labFilter} onChange={(e) => setLabFilter(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700">
            <option value="ALL">All labs</option>
            {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={facFilter} onChange={(e) => setFacFilter(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700">
            <option value="ALL">All teachers</option>
            {faculties.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
          {canWrite && <Button onClick={() => setActive("new")}>+ New Experiment</Button>}
        </div>
      </div>

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : filtered.length === 0 ? <p className="text-gray-400">No experiments yet. {canWrite && "Click “+ New Experiment”."}</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <button key={String(e.id)} onClick={() => setActive(e)} className="group overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2" style={{ background: "#00C9A7" }} />
              <div className="p-5">
                <h3 className="font-semibold text-[#0A1628]">{String(e.title)}</h3>
                <p className="mt-1 text-xs text-gray-500">{[(e.subject as Subject)?.code || (e.subject as Subject)?.name, e.facultyName, (e.lab as Lab)?.name].filter(Boolean).join(" · ") || "—"}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500">{(e.items as unknown[])?.length ?? 0} resources</span>
                  <span className="rounded-full bg-[#00C9A7]/15 px-2.5 py-0.5 text-xs font-semibold text-[#0a8d75]">{money(Number(e.costPerGroup ?? 0))}/grp</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {active && <ExpWindow record={active === "new" ? null : active} labs={labs} subjects={subjects} inv={inv} faculties={faculties} token={token} api={api} canWrite={canWrite}
        onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

type ELine = { itemId: string; quantity: number | string; consumed: boolean; unit: string };

function ExpWindow({ record, labs, subjects, inv, faculties, token, api, canWrite, onClose, onSaved }: {
  record: Row | null; labs: Lab[]; subjects: Subject[]; inv: Inv[]; faculties: string[]; token: string;
  api: (p: string, i?: RequestInit) => Promise<Response>; canWrite: boolean;
  onClose: () => void; onSaved: (m: string) => void;
}) {
  const isNew = record === null;
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const dis = !editing;
  const [f, setF] = useState<Row>(() => record ? { ...record } : {});
  const initLines = () => (((record?.items as Row[]) ?? []).map((it) => ({ itemId: String(it.itemId), quantity: Number(it.quantity ?? 1), consumed: !!it.consumed, unit: String(it.unit ?? "PIECE") })));
  const [lines, setLines] = useState<ELine[]>(initLines);
  const initDocs = (): EDoc[] => {
    const out: EDoc[] = [];
    try { const s = JSON.parse(String(record?.documents ?? "[]")); if (Array.isArray(s)) for (const d of s) if (d?.url) out.push({ label: String(d.label ?? "Document"), url: String(d.url) }); } catch { /* ignore */ }
    for (const [k, l] of LEGACY_EXP_DOCS) { const u = String((record as Row)?.[k] ?? ""); if (u && !out.some((d) => d.url === u)) out.push({ label: l, url: u }); }
    return out;
  };
  const [docs, setDocs] = useState<EDoc[]>(initDocs);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const invById = (id: string) => inv.find((i) => i.id === id);
  const [subs, setSubs] = useState<Subject[]>(subjects);
  useEffect(() => { setSubs(subjects); }, [subjects]);
  const [newSub, setNewSub] = useState("");
  async function addSubject() { const name = newSub.trim(); if (!name) return; const r = await api("/api/subjects", { method: "POST", body: JSON.stringify({ name }) }); if (r.ok) { const s = await r.json() as Subject; setSubs((p) => [...p, s]); set("subjectId", s.id); setNewSub(""); } }
  const rate = (l: ELine) => { const it = invById(l.itemId); return l.unit === "BOX" ? (it?.pricePerBox ?? 0) : (it?.pricePerPiece ?? 0); };
  const costPerGroup = lines.filter((l) => l.consumed).reduce((t, l) => t + (Number(l.quantity) || 0) * rate(l), 0);

  function addLine() { setLines([...lines, { itemId: "", quantity: 1, consumed: false, unit: "PIECE" }]); }
  function setLine(i: number, patch: Partial<ELine>) {
    setLines(lines.map((l, j) => {
      if (j !== i) return l;
      const next = { ...l, ...patch };
      if (patch.itemId !== undefined) next.consumed = invById(patch.itemId)?.type === "CONSUMABLE";
      return next;
    }));
    // Auto-pull the chosen item's documents into the experiment.
    if (patch.itemId) { const it = invById(patch.itemId); if (it) setDocs((cur) => mergeDocs(cur, itemDocs(it))); }
  }
  function pullAllDocs() { setDocs((cur) => lines.reduce((acc, l) => { const it = invById(l.itemId); return it ? mergeDocs(acc, itemDocs(it)) : acc; }, cur)); }

  async function save() {
    if (!f.title) { setErr("Title is required"); return; }
    setErr(""); setBusy(true);
    const payload = { ...f, documents: docs, items: lines.filter((l) => l.itemId).map((l) => ({ ...l, quantity: Number(l.quantity) || 1 })) };
    const res = isNew ? await api("/api/experiments", { method: "POST", body: JSON.stringify(payload) })
      : await api(`/api/experiments/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    setBusy(false);
    if (res.ok) onSaved(isNew ? "Experiment created" : "Saved");
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? `Save failed (${res.status})`); }
  }
  async function del() {
    if (!confirm("Delete this experiment?")) return;
    const res = await api(`/api/experiments/${record!.id}`, { method: "DELETE" });
    if (res.ok) onSaved("Deleted"); else setErr("Delete failed");
  }
  async function deduct() {
    if (!confirm("Sync used consumables to inventory?\n\nOnly the CHANGE since the last sync is applied — newly added used items are deducted, and reduced quantities are added back. Save your edits first.")) return;
    setBusy(true); setErr("");
    const res = await api(`/api/experiments/${record!.id}/deduct`, { method: "POST" });
    setBusy(false);
    if (res.ok) { const d = await res.json().catch(() => ({})); const n = Number(d.netDeducted ?? 0); onSaved(n === 0 ? "Inventory already up to date" : `Inventory synced (${n > 0 ? `${n} deducted` : `${-n} added back`})`); }
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Sync failed"); }
  }

  async function uploadDoc(file: File): Promise<string | undefined> {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "experiments"); fd.append("id", (record?.id as string) ?? "new");
    const res = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    return res.ok ? (await res.json()).url : undefined;
  }

  return (
    <Window width="max-w-4xl" title={isNew ? "New Experiment" : String(f.title ?? "Experiment")} subtitle={isNew ? "Create" : editing ? "Editing" : "Experiment"}
      onClose={onClose}
      footer={<>
        {!isNew && canWrite && editing && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setLines(initLines()); setDocs(initDocs()); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Title *</label><input className={inputCls} disabled={dis} value={String(f.title ?? "")} onChange={(e) => set("title", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Subject / course</label>
          <select className={inputCls} disabled={dis} value={String(f.subjectId ?? "")} onChange={(e) => set("subjectId", e.target.value)}><option value="">— select —</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} — ${s.name}` : s.name}</option>)}</select>
          {editing && <div className="mt-1 flex gap-1"><input className={inputCls} placeholder="Add a new subject…" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubject(); } }} /><button type="button" onClick={addSubject} className="shrink-0 rounded border border-gray-300 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100">Add</button></div>}
        </div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Course leader</label><select className={inputCls} disabled={dis} value={String(f.facultyName ?? "")} onChange={(e) => set("facultyName", e.target.value)}><option value="">— select —</option>{faculties.map((ff) => <option key={ff} value={ff}>{ff}</option>)}{String(f.facultyName ?? "") !== "" && !faculties.includes(String(f.facultyName)) && <option value={String(f.facultyName)}>{String(f.facultyName)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Lab</label><select className={inputCls} disabled={dis} value={String(f.labId ?? "")} onChange={(e) => set("labId", e.target.value)}><option value="">— select —</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Course code</label><input className={inputCls} disabled={dis} value={String(f.courseCode ?? "")} onChange={(e) => set("courseCode", e.target.value)} placeholder="e.g. MECH101" /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><textarea rows={2} className={inputCls} disabled={dis} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>

      <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Required resources</h3>
        {editing && <button type="button" onClick={addLine} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add item</button>}
      </div>
      {lines.length === 0 && <p className="text-xs text-gray-400">No resources added.</p>}
      <div className="space-y-2">
        {lines.map((l, i) => {
          const it = invById(l.itemId);
          const qty = Number(it?.quantity ?? 0);
          const need = Number(l.quantity) || 0;
          const stock = !l.itemId ? null : qty <= 0 ? { c: "text-red-600", t: "⛔ Out of stock" } : need > qty ? { c: "text-amber-600", t: `⚠ Only ${qty} in stock (need ${need})` } : { c: "text-emerald-600", t: `✓ ${qty} in stock` };
          return (
            <div key={i}>
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-5"><ItemPicker inv={inv} value={l.itemId} disabled={dis} onChange={(id) => setLine(i, { itemId: id })} /></div>
                <input type="number" min={0} className={`${inputCls} col-span-2`} disabled={dis} value={l.quantity === 0 ? "" : l.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value === "" ? "" : Number(e.target.value) })} title="quantity" />
                <select className={`${inputCls} col-span-2`} disabled={dis} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} title="unit">
                  <option value="PIECE">Piece</option>
                  <option value="BOX">Box/Packet</option>
                </select>
                <label className="col-span-2 flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" disabled={dis} checked={l.consumed} onChange={(e) => setLine(i, { consumed: e.target.checked })} /> used{l.consumed && rate(l) ? ` ${money((Number(l.quantity) || 0) * rate(l))}` : ""}</label>
                {editing && <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="col-span-1 rounded px-1 text-red-600 hover:bg-red-50">✕</button>}
              </div>
              {stock && <p className={`ml-1 mt-0.5 text-[11px] font-medium ${stock.c}`}>{stock.t}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg bg-[#0A1628] p-4 text-white">
        <div className="flex items-center justify-between text-sm"><span>Consumable cost per group</span><span className="font-bold text-[#00C9A7]">{money(costPerGroup)}</span></div>
        <p className="mt-2 text-[11px] text-gray-400">Equipment & tools are reusable (not counted). Groups are set when you schedule it.</p>
      </div>
      {!isNew && canWrite && lines.some((l) => l.consumed) && (
        <div className={`mt-3 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${f.stockDeducted ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-xs ${f.stockDeducted ? "text-emerald-800" : "text-amber-800"}`}>
            {f.stockDeducted
              ? <>✓ <b>Synced to inventory.</b> Added a new used item or changed a quantity? <b>Save</b>, then <b>Re-sync</b> — only the difference is applied (new items deducted, reductions added back).</>
              : <><b>Deduct used consumables from inventory.</b> Reduces the stock count of each used item by the quantity above. You can <b>re-sync after edits</b> — only the change is applied each time.</>}
          </p>
          <button type="button" onClick={deduct} disabled={busy} className="shrink-0 rounded-md bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-[#00C9A7] hover:brightness-110 disabled:opacity-50">{busy ? "Syncing…" : (f.stockDeducted ? "↻ Re-sync" : "⤓ Deduct now")}</button>
        </div>
      )}

      {/* Documents — pulled in automatically from the items you add; remove any you don't need, or add your own. */}
      <div className="mb-2 mt-6 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Documents</h3>
        {editing && <div className="flex items-center gap-2">
          <button type="button" onClick={pullAllDocs} className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100">↻ Pull from items</button>
          <AddDocButton upload={uploadDoc} onAdd={(d) => setDocs((cur) => mergeDocs(cur, [d]))} />
        </div>}
      </div>
      {docs.length === 0 ? <p className="text-xs text-gray-400">No documents yet — they’re pulled in automatically when you add items, or add one manually.</p> : (
        <div className="space-y-1">
          {docs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-gray-200 px-3 py-1.5">
              <a href={d.url.startsWith("http") ? d.url : `${API_URL}${d.url}`} target="_blank" className="flex-1 truncate text-sm font-medium text-[#0a8d75] hover:underline">📎 {d.label}</a>
              {editing && <button type="button" onClick={() => setDocs(docs.filter((_, j) => j !== i))} className="shrink-0 rounded px-1 text-red-600 hover:bg-red-50" title="Remove">✕</button>}
            </div>
          ))}
        </div>
      )}
    </Window>
  );
}

function AddDocButton({ upload, onAdd }: { upload: (f: File) => Promise<string | undefined>; onAdd: (d: EDoc) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); const u = await upload(file); setBusy(false); if (u) onAdd({ label: file.name, url: u });
    if (ref.current) ref.current.value = "";
  }
  return (<>
    <button type="button" onClick={() => ref.current?.click()} className="rounded bg-[#0A1628] px-2.5 py-1 text-xs font-medium text-[#00C9A7] hover:brightness-110">{busy ? "…" : "+ Add document"}</button>
    <input ref={ref} type="file" hidden onChange={pick} />
  </>);
}
