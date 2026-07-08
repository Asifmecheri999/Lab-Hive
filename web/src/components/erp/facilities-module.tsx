"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const SCHEDULERS = ["LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
type Lab = Record<string, unknown>;

const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>{children}</div>;
}
const COLORS = ["#0A1628", "#00C9A7", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#64748b"];

export function FacilitiesModule({ token, role }: { token: string; role: string }) {
  const canWrite = SCHEDULERS.includes(role);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Lab | "new" | null>(null);
  const [toast, setToast] = useState("");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/schedule/labs");
    setLabs(r.ok ? await r.json() : []);
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Facilities</h1><p className="text-sm text-gray-500">{labs.length} laborator{labs.length === 1 ? "y" : "ies"}</p></div>
        <div className="ml-auto flex gap-2">
          <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
          {canWrite && <Button onClick={() => setActive("new")}>+ New Laboratory</Button>}
        </div>
      </div>

      {loading ? <p className="text-gray-400">Loading…</p> : labs.length === 0 ? <p className="text-gray-400">No laboratories yet.</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {labs.map((l) => (
            <button key={String(l.id)} onClick={() => setActive(l)} className="group overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex h-28 items-center justify-center text-3xl text-white" style={{ background: l.color ? String(l.color) : "linear-gradient(135deg,#0A1628,#16304d)" }}>
                {l.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={String(l.pictureUrl).startsWith("http") ? String(l.pictureUrl) : `${API_URL}${l.pictureUrl}`} alt="" className="h-full w-full object-cover" />
                ) : "🏛️"}
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-[#0A1628]">{String(l.name)}</h3>
                <p className="mt-1 text-xs text-gray-500">{[l.building, l.floor && `Floor ${l.floor}`, l.roomNo && `Room ${l.roomNo}`].filter(Boolean).join(" · ") || "—"}</p>
                <p className="mt-2 text-xs text-gray-600">Capacity: {String(l.capacity ?? "—")}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {active && <LabWindow record={active === "new" ? null : active} api={api} token={token} canWrite={canWrite}
        onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function LabWindow({ record, api, token, canWrite, onClose, onSaved }: {
  record: Lab | null; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; canWrite: boolean;
  onClose: () => void; onSaved: (m: string) => void;
}) {
  const isNew = record === null;
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const dis = !editing;
  const [f, setF] = useState<Lab>(() => record ? { ...record } : {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const picRef = useRef<HTMLInputElement>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [docs, setDocs] = useState<{ label: string; url: string }[]>(() => {
    try { const a = JSON.parse(String(record?.labDocuments ?? "[]")); return Array.isArray(a) ? a : []; } catch { return []; }
  });

  async function uploadFile(file: File): Promise<string | undefined> {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "facilities"); fd.append("id", (record?.id as string) ?? "new");
    const res = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    return res.ok ? (await res.json()).url : undefined;
  }

  async function save() {
    if (!f.name) { setErr("Lab name is required"); return; }
    setErr(""); setBusy(true);
    const payload = { ...f, labDocuments: JSON.stringify(docs.filter((d) => d.url || d.label)) };
    const res = isNew
      ? await api("/api/schedule/labs", { method: "POST", body: JSON.stringify(payload) })
      : await api(`/api/schedule/labs/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    setBusy(false);
    if (res.ok) onSaved(isNew ? "Laboratory created" : "Facilities saved");
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function del() {
    if (!confirm(`Delete ${String(f.name ?? "this laboratory")}? It will be removed from lists.`)) return;
    setBusy(true); setErr("");
    const res = await api(`/api/schedule/labs/${record!.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onSaved("Laboratory deleted"); else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Delete failed"); }
  }

  async function pickPicture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUpBusy(true); const url = await uploadFile(file); setUpBusy(false);
    if (url) set("pictureUrl", url);
  }

  const num = (k: string, label: string) => <F label={label}><input type="number" className={inputCls} disabled={dis} value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value)} /></F>;

  return (
    <Window width="max-w-4xl" title={isNew ? "New Laboratory" : String(f.name ?? "Laboratory")} subtitle={isNew ? "Create laboratory" : editing ? "Editing facilities" : "Facilities"}
      onClose={onClose}
      footer={<>
        {!isNew && canWrite && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">Basic details</h3>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <F label="Lab name *"><input className={inputCls} disabled={dis} value={String(f.name ?? "")} onChange={(e) => set("name", e.target.value)} /></F>
        <F label="Building"><input className={inputCls} disabled={dis} value={String(f.building ?? "")} onChange={(e) => set("building", e.target.value)} /></F>
        <F label="Floor"><input className={inputCls} disabled={dis} value={String(f.floor ?? "")} onChange={(e) => set("floor", e.target.value)} /></F>
        <F label="Room no."><input className={inputCls} disabled={dis} value={String(f.roomNo ?? "")} onChange={(e) => set("roomNo", e.target.value)} /></F>
        {num("capacity", "Capacity (people)")}
        <F label="Description"><input className={inputCls} disabled={dis} value={String(f.description ?? "")} onChange={(e) => set("description", e.target.value)} /></F>
      </div>

      <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">Furniture & fixtures</h3>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {num("chairs", "Chairs")}
        {num("tables", "Tables")}
        {num("benches", "Benches")}
        {num("sinks", "Sinks")}
        {num("fumeHoods", "Fume hoods")}
      </div>

      <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">Appearance</h3>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-dashed border-gray-300 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Tile picture</span>
            {!dis && (
              <div className="flex gap-1">
                <button type="button" onClick={() => picRef.current?.click()} className="rounded bg-[#0A1628] px-2.5 py-1 text-xs font-medium text-[#00C9A7] hover:brightness-110">{upBusy ? "Uploading…" : f.pictureUrl ? "Replace" : "Upload"}</button>
                {!!f.pictureUrl && <button type="button" onClick={() => set("pictureUrl", "")} className="rounded border border-gray-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">Remove</button>}
              </div>
            )}
            <input ref={picRef} type="file" accept="image/*" hidden onChange={pickPicture} />
          </div>
          {!dis && <input className={`${inputCls} mt-2`} placeholder="Or paste an image link (https://…)" value={String(f.pictureUrl ?? "").startsWith("http") ? String(f.pictureUrl) : ""} onChange={(e) => set("pictureUrl", e.target.value)} />}
          {f.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={String(f.pictureUrl).startsWith("http") ? String(f.pictureUrl) : `${API_URL}${f.pictureUrl}`} alt="" className="mt-2 h-28 w-full rounded object-cover" />
          ) : <p className="mt-1 text-xs text-gray-400">No picture.</p>}
        </div>
        <F label="Colour code">
          <div className="flex flex-wrap gap-2 pt-1">
            {COLORS.map((c) => (
              <button key={c} type="button" disabled={dis} onClick={() => set("color", c)}
                className={`h-7 w-7 rounded-full ring-2 ${f.color === c ? "ring-[#0A1628]" : "ring-transparent"}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </F>
      </div>

      <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-[#0A1628]">HVAC & notes</h3>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <F label="HVAC details"><textarea rows={3} className={inputCls} disabled={dis} value={String(f.hvacDetails ?? "")} onChange={(e) => set("hvacDetails", e.target.value)} /></F>
        <F label="Facility notes"><textarea rows={3} className={inputCls} disabled={dis} value={String(f.facilityNotes ?? "")} onChange={(e) => set("facilityNotes", e.target.value)} /></F>
      </div>

      <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Attachments <span className="font-normal text-gray-400">(floor plan, lab drawing, MEP drawing…)</span></h3>
        {editing && <button type="button" onClick={() => setDocs([...docs, { label: "", url: "" }])} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add attachment</button>}
      </div>
      {docs.length === 0 && <p className="text-xs text-gray-400">No attachments.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {docs.map((d, i) => (
          <LabDoc key={i} doc={d} editing={editing} upload={uploadFile}
            onLabel={(v) => setDocs(docs.map((x, j) => j === i ? { ...x, label: v } : x))}
            onUrl={(v) => setDocs(docs.map((x, j) => j === i ? { ...x, url: v } : x))}
            onRemove={() => setDocs(docs.filter((_, j) => j !== i))} />
        ))}
      </div>
    </Window>
  );
}

function LabDoc({ doc, editing, upload, onLabel, onUrl, onRemove }: {
  doc: { label: string; url: string }; editing: boolean;
  upload: (f: File) => Promise<string | undefined>;
  onLabel: (v: string) => void; onUrl: (v: string) => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const href = doc.url.startsWith("http") ? doc.url : `${API_URL}${doc.url}`;
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); const url = await upload(file); setBusy(false); if (url) onUrl(url);
  }
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <input className={inputCls} placeholder="Name (e.g. MEP drawing)" disabled={!editing} value={doc.label} onChange={(e) => onLabel(e.target.value)} />
        {editing && <button type="button" onClick={onRemove} className="shrink-0 rounded px-2 text-red-600 hover:bg-red-50">✕</button>}
      </div>
      <div className="flex items-center justify-between">
        {editing && <button type="button" onClick={() => ref.current?.click()} className="rounded bg-[#0A1628] px-2.5 py-1 text-xs font-medium text-[#00C9A7] hover:brightness-110">{busy ? "Uploading…" : doc.url ? "Replace" : "Upload"}</button>}
        {doc.url ? <a href={href} target="_blank" className="flex-1 truncate text-xs text-[#0a8d75] hover:underline">{doc.url.startsWith("http") ? "Open link ↗" : `📎 ${decodeURIComponent(doc.url.split("/").pop() || "file")}`}</a> : <span className="text-xs text-gray-400">No file</span>}
        <input ref={ref} type="file" hidden onChange={pick} />
      </div>
      {editing && <input className={`${inputCls} mt-2`} placeholder="Or paste a link (https://…)" value={doc.url.startsWith("http") ? doc.url : ""} onChange={(e) => onUrl(e.target.value)} />}
    </div>
  );
}
