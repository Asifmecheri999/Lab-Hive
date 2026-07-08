"use client";

import { useCallback, useEffect, useState } from "react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

type Row = Record<string, unknown>;
type Overview = {
  plan: string;
  campuses: Row[]; schools: Row[]; departments: Row[];
  usage: Record<string, number>;
  limits: Record<string, number | null>;
};
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

export function OrgModule({ token, role }: { token: string; role: string }) {
  const isAdmin = role === "ADMIN";
  const [o, setO] = useState<Overview | null>(null);
  const [add, setAdd] = useState<null | "campuses" | "schools" | "departments">(null);
  const [edit, setEdit] = useState<{ kind: "campuses" | "schools" | "departments"; row: Row } | null>(null);
  const [toast, setToast] = useState("");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const load = useCallback(async () => { const r = await api("/api/org"); if (r.ok) setO(await r.json()); }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }
  if (!o) return <p className="text-gray-400">Loading…</p>;

  const cap = (k: string) => o.limits[k] == null ? "∞" : o.limits[k];
  const usageRows = [
    { k: "campuses", label: "Campuses" }, { k: "schools", label: "Schools" }, { k: "departments", label: "Departments" },
    { k: "labs", label: "Labs" }, { k: "inventory", label: "Inventory items" }, { k: "users", label: "Users" },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1628]">Organisation</h1>
          <p className="text-sm text-gray-500">Campus → School → Department hierarchy &amp; plan usage</p>
        </div>
        <span className="ml-auto rounded-full bg-[#0A1628] px-3 py-1 text-xs font-semibold text-[#00C9A7]">{o.plan} plan</span>
      </div>

      {/* Usage */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {usageRows.map((u) => {
          const used = o.usage[u.k] ?? 0; const limit = o.limits[u.k];
          const full = limit != null && used >= limit;
          return (
            <div key={u.k} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className={`text-2xl font-bold ${full ? "text-red-600" : "text-[#0A1628]"}`}>{used}<span className="text-sm font-normal text-gray-400"> / {cap(u.k)}</span></p>
              <p className="mt-1 text-xs text-gray-500">{u.label}</p>
            </div>
          );
        })}
      </div>

      {/* Hierarchy lists */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ListCard title="Campuses" rows={o.campuses} isAdmin={isAdmin} onAdd={() => setAdd("campuses")} onEdit={isAdmin ? (r) => setEdit({ kind: "campuses", row: r }) : undefined} render={(r) => String(r.name)} sub={(r) => String(r.location ?? "")} />
        <ListCard title="Schools" rows={o.schools} isAdmin={isAdmin} onAdd={() => setAdd("schools")} onEdit={isAdmin ? (r) => setEdit({ kind: "schools", row: r }) : undefined} render={(r) => String(r.name)} sub={(r) => campusName(o, r.campusId)} />
        <ListCard title="Departments" rows={o.departments} isAdmin={isAdmin} onAdd={() => setAdd("departments")} onEdit={isAdmin ? (r) => setEdit({ kind: "departments", row: r }) : undefined} render={(r) => String(r.name)} sub={(r) => schoolName(o, r.schoolId)} />
      </div>

      {add && <AddDialog kind={add} o={o} api={api} onClose={() => setAdd(null)} onSaved={() => { flash("Added"); setAdd(null); load(); }} />}
      {edit && <AddDialog kind={edit.kind} record={edit.row} o={o} api={api} onClose={() => setEdit(null)} onSaved={() => { flash("Saved"); setEdit(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function campusName(o: Overview, id: unknown) { return String(o.campuses.find((c) => c.id === id)?.name ?? "—"); }
function schoolName(o: Overview, id: unknown) { return String(o.schools.find((s) => s.id === id)?.name ?? "—"); }

function ListCard({ title, rows, isAdmin, onAdd, onEdit, render, sub }: {
  title: string; rows: Row[]; isAdmin: boolean; onAdd: () => void; onEdit?: (r: Row) => void;
  render: (r: Row) => string; sub: (r: Row) => string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-[#0A1628]">{title}</h3>
        {isAdmin && <Button onClick={onAdd}>+ Add</Button>}
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-gray-400">None yet.</p>}
        {rows.map((r) => onEdit ? (
          <button key={String(r.id)} onClick={() => onEdit(r)} className="block w-full rounded-lg bg-gray-50 px-3 py-2 text-left hover:bg-gray-100">
            <p className="text-sm font-medium text-gray-900">{render(r)} <span className="font-normal text-gray-300">›</span></p>
            <p className="text-xs text-gray-500">{sub(r)}</p>
          </button>
        ) : (
          <div key={String(r.id)} className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-sm font-medium text-gray-900">{render(r)}</p>
            <p className="text-xs text-gray-500">{sub(r)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddDialog({ kind, o, api, record, onClose, onSaved }: {
  kind: "campuses" | "schools" | "departments"; o: Overview; record?: Row;
  api: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!record;
  const [f, setF] = useState<Row>(() => (record ? { ...record } : {}));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const title = kind === "campuses" ? "Campus" : kind === "schools" ? "School" : "Department";
  async function save() {
    if (!f.name) { setErr("Name is required"); return; }
    setBusy(true); setErr("");
    const res = isEdit
      ? await api(`/api/org/${kind}/${String(record!.id)}`, { method: "PUT", body: JSON.stringify(f) })
      : await api(`/api/org/${kind}`, { method: "POST", body: JSON.stringify(f) });
    setBusy(false);
    if (res.ok) onSaved(); else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Failed"); }
  }
  async function del() {
    if (!confirm(`Delete this ${title.toLowerCase()}?`)) return;
    setBusy(true); setErr("");
    const res = await api(`/api/org/${kind}/${String(record!.id)}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onSaved(); else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Delete failed"); }
  }
  return (
    <Window width="max-w-3xl" title={`${isEdit ? "Edit" : "Add"} ${title}`} onClose={onClose} footer={<>{isEdit && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save" : "Add"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Name *</label><input className={inputCls} value={String(f.name ?? "")} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        {kind === "campuses" && <div><label className="mb-1 block text-xs font-medium text-gray-600">Location</label><input className={inputCls} value={String(f.location ?? "")} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>}
        {kind === "schools" && <div><label className="mb-1 block text-xs font-medium text-gray-600">Campus</label><select className={inputCls} value={String(f.campusId ?? "")} onChange={(e) => setF({ ...f, campusId: e.target.value })}><option value="">— select —</option>{o.campuses.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}</select></div>}
        {kind === "departments" && <>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">School</label><select className={inputCls} value={String(f.schoolId ?? "")} onChange={(e) => setF({ ...f, schoolId: e.target.value })}><option value="">— select —</option>{o.schools.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Code</label><input className={inputCls} value={String(f.code ?? "")} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
        </>}
      </div>
    </Window>
  );
}
