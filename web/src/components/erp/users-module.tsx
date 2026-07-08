"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";
import { Window, Button } from "./window";

type Row = Record<string, unknown>;
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";
const ROLES = ["STUDENT", "FACULTY", "LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "HEAD_OF_SCHOOL", "DEAN", "ADMIN"];
const roleLabel = (r: string) => r.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
const roleColor = (r: string) =>
  r === "ADMIN" ? "bg-[#0A1628] text-[#00C9A7]" :
  /MANAGER|HEAD|DEAN/.test(r) ? "bg-[#2563eb]/10 text-[#2563eb]" :
  /LAB_/.test(r) ? "bg-[#00C9A7]/15 text-[#0a8d75]" :
  r === "FACULTY" ? "bg-[#8b5cf6]/15 text-[#7c3aed]" :
  "bg-gray-100 text-gray-600";

type Org = { campuses: Row[]; schools: Row[]; departments: Row[] };
// Cascading Campus → School → Department selects, sourced from the org hierarchy (stores names).
function OrgSelects({ f, set, org, dis }: { f: Row; set: (k: string, v: unknown) => void; org: Org; dis?: boolean }) {
  const campus = org.campuses.find((c) => c.name === f.campus);
  const schools = campus ? org.schools.filter((s) => s.campusId === campus.id) : org.schools;
  const school = org.schools.find((s) => s.name === f.school);
  const depts = school ? org.departments.filter((d) => d.schoolId === school.id) : org.departments;
  return (<>
    <div><label className="mb-1 block text-xs font-medium text-gray-600">Campus *</label><select disabled={dis} className={inputCls} value={String(f.campus ?? "")} onChange={(e) => { set("campus", e.target.value); set("school", ""); set("department", ""); }}><option value="">— select —</option>{org.campuses.map((c) => <option key={String(c.id)} value={String(c.name)}>{String(c.name)}</option>)}</select></div>
    <div><label className="mb-1 block text-xs font-medium text-gray-600">School *</label><select disabled={dis} className={inputCls} value={String(f.school ?? "")} onChange={(e) => { set("school", e.target.value); set("department", ""); }}><option value="">— select —</option>{schools.map((s) => <option key={String(s.id)} value={String(s.name)}>{String(s.name)}</option>)}</select></div>
    <div><label className="mb-1 block text-xs font-medium text-gray-600">Department *</label><select disabled={dis} className={inputCls} value={String(f.department ?? "")} onChange={(e) => set("department", e.target.value)}><option value="">— select —</option>{depts.map((d) => <option key={String(d.id)} value={String(d.name)}>{String(d.name)}</option>)}</select></div>
  </>);
}

export function UsersModule({ token }: { token: string; role: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState("ALL");
  const [modal, setModal] = useState(false);
  const [active, setActive] = useState<Row | null>(null);
  const [toast, setToast] = useState("");
  const [org, setOrg] = useState<Org>({ campuses: [], schools: [], departments: [] });
  const [domains, setDomains] = useState("");
  const [domMsg, setDomMsg] = useState("");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  useEffect(() => { api("/api/org").then((r) => (r.ok ? r.json() : null)).then((o) => { if (o) { setOrg({ campuses: o.campuses ?? [], schools: o.schools ?? [], departments: o.departments ?? [] }); setDomains(String((o.tenant as Row)?.allowedEmailDomains ?? "")); } }).catch(() => {}); }, [api]);

  async function saveDomains() {
    setDomMsg("");
    const r = await api("/api/org/settings", { method: "PATCH", body: JSON.stringify({ allowedEmailDomains: domains }) });
    if (r.ok) { const d = await r.json().catch(() => ({})); setDomains(String(d?.allowedEmailDomains ?? "")); setDomMsg("Saved ✓"); setTimeout(() => setDomMsg(""), 1500); }
    else setDomMsg("Save failed");
  }

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/users");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const ql = q.trim().toLowerCase();
  const shown = rows.filter((u) => (roleF === "ALL" || String(u.role) === roleF) && (!ql || [u.name, u.email, u.department].filter(Boolean).join(" ").toLowerCase().includes(ql)));

  return (
    <div>
      <div className="mb-5"><h1 className="text-2xl font-bold text-[#0A1628]">Users</h1><p className="text-sm text-gray-500">People and their roles (a role can be Faculty, Student, Lab team, Admin…)</p></div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#0A1628]">Allowed email domains</p>
          {domMsg && <span className="text-xs font-medium text-[#0a8d75]">{domMsg}</span>}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">Only users whose email ends in one of these domains can be added. Enter the part <b>after the @</b>, comma-separated — e.g. for <b>name@youruniversity.edu</b> enter <b>youruniversity.edu</b>. Leave blank to allow any.</p>
        <div className="mt-2 flex gap-2">
          <input className={inputCls} value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="youruniversity.edu, example.com" />
          <Button onClick={saveDomains}>Save</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
        <select value={roleF} onChange={(e) => setRoleF(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700"><option value="ALL">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
        <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
        <div className="ml-auto"><Button onClick={() => setModal(true)}>+ Add user</Button></div>
      </div>

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">No users.</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((u) => (
            <button key={String(u.id)} onClick={() => setActive(u)} className="w-full select-none overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2" style={{ background: "#00C9A7" }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-sm font-bold text-[#00C9A7]">{String(u.name ?? "?").slice(0, 1).toUpperCase()}</div>
                    <div>
                      <h3 className="font-semibold text-[#0A1628]">{String(u.name)}</h3>
                      <p className="text-xs text-gray-500">{String(u.email)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleColor(String(u.role))}`}>{roleLabel(String(u.role))}</span>
                    {!!u.isApprover && <span className="rounded-full bg-[#00C9A7]/15 px-2 py-0.5 text-[10px] font-semibold text-[#0a8d75]">✓ Approver</span>}
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">{[u.school, u.department, u.studentId].filter(Boolean).join(" · ") || "—"}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {modal && <UserForm api={api} org={org} onClose={() => setModal(false)} onSaved={() => { setModal(false); flash("User added"); load(); }} />}
      {active && <UserWindow record={active} api={api} org={org} onClose={() => setActive(null)} onSaved={(m) => { setActive(null); flash(m); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function UserWindow({ record, api, org, onClose, onSaved }: { record: Row; api: (p: string, i?: RequestInit) => Promise<Response>; org: Org; onClose: () => void; onSaved: (m: string) => void }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const editing = mode === "edit";
  const dis = !editing;
  const [f, setF] = useState<Row>({ name: record.name ?? "", email: record.email ?? "", campus: record.campus ?? "", school: record.school ?? "", department: record.department ?? "", studentId: record.studentId ?? "", role: record.role ?? "STUDENT", isApprover: record.isApprover ?? false, password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name || !f.email) { setErr("Name and email are required"); return; }
    setBusy(true); setErr("");
    const r = await api(`/api/users/${String(record.id)}`, { method: "PUT", body: JSON.stringify(f) });
    setBusy(false);
    if (r.ok) onSaved("Saved"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function del() {
    if (!confirm(`Delete ${String(record.name)}? This cannot be undone.`)) return;
    setBusy(true); setErr("");
    const r = await api(`/api/users/${String(record.id)}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onSaved("Deleted"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Delete failed"); }
  }
  return (
    <Window width="max-w-3xl" title={String(record.name)} subtitle={editing ? "Editing" : roleLabel(String(record.role))} onClose={onClose}
      footer={<>
        {!editing && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && <Button variant="ghost" onClick={() => { setF({ name: record.name ?? "", email: record.email ?? "", campus: record.campus ?? "", school: record.school ?? "", department: record.department ?? "", studentId: record.studentId ?? "", role: record.role ?? "STUDENT", isApprover: record.isApprover ?? false, password: "" }); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Name *</label><input className={inputCls} disabled={dis} value={String(f.name ?? "")} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Email *</label><input className={inputCls} disabled={dis} value={String(f.email ?? "")} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Role / posting</label><select className={inputCls} disabled={dis} value={String(f.role ?? "STUDENT")} onChange={(e) => set("role", e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Student / staff ID</label><input className={inputCls} disabled={dis} value={String(f.studentId ?? "")} onChange={(e) => set("studentId", e.target.value)} /></div>
        <OrgSelects f={f} set={set} org={org} dis={dis} />
        {editing && <div><label className="mb-1 block text-xs font-medium text-gray-600">New password</label><input type="password" name="lh-edit-user-password" autoComplete="new-password" className={inputCls} value={String(f.password ?? "")} onChange={(e) => set("password", e.target.value)} placeholder="Leave blank to keep current" /></div>}
        <div className="sm:col-span-2"><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" disabled={dis} checked={!!f.isApprover} onChange={(e) => set("isApprover", e.target.checked)} /> Can be selected as a procurement approver</label></div>
      </div>
      <p className="mt-3 text-xs text-gray-400">Editing your own name/role updates the top-right menu after you sign out and back in.</p>
    </Window>
  );
}

function UserForm({ api, org, onClose, onSaved }: { api: (p: string, i?: RequestInit) => Promise<Response>; org: Org; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Row>({ role: "STUDENT" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name || !f.email || !f.password) { setErr("Name, email and password are required"); return; }
    if (!f.campus || !f.school || !f.department) { setErr("Campus, school and department are required"); return; }
    setBusy(true); setErr("");
    const r = await api("/api/users", { method: "POST", body: JSON.stringify(f) });
    setBusy(false);
    if (r.ok) onSaved(); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  return (
    <Window width="max-w-3xl" title="Add user" subtitle="Create an account and set the role / posting" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Add user"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Name *</label><input className={inputCls} value={String(f.name ?? "")} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Email *</label><input name="lh-new-user-email" autoComplete="off" className={inputCls} value={String(f.email ?? "")} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Password *</label><input type="password" name="lh-new-user-password" autoComplete="new-password" className={inputCls} value={String(f.password ?? "")} onChange={(e) => set("password", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Role / posting</label><select className={inputCls} value={String(f.role ?? "STUDENT")} onChange={(e) => set("role", e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Student / staff ID</label><input className={inputCls} value={String(f.studentId ?? "")} onChange={(e) => set("studentId", e.target.value)} /></div>
        <OrgSelects f={f} set={set} org={org} />
        <div className="sm:col-span-2"><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={!!f.isApprover} onChange={(e) => set("isApprover", e.target.checked)} /> Can be selected as a procurement approver</label></div>
      </div>
    </Window>
  );
}
