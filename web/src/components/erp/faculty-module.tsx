"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
type Fac = { id: string; name: string; email?: string | null; department?: string | null };
const inputCls = "rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

export function FacultyModule({ token, role }: { token: string; role: string }) {
  const canWrite = WRITE.includes(role);
  const [rows, setRows] = useState<Fac[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/faculty");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await api("/api/faculty", { method: "POST", body: JSON.stringify({ name: name.trim(), email, department: dept }) });
    setBusy(false);
    if (res.ok) { setName(""); setEmail(""); setDept(""); load(); }
    else { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Add failed"); }
  }
  async function del(id: string) {
    if (!confirm("Remove this faculty member?")) return;
    const r = await api(`/api/faculty/${id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  return (
    <div>
      <div className="mb-5"><h1 className="text-2xl font-bold text-[#0A1628]">Faculty</h1><p className="text-sm text-gray-500">Names added here appear in the course-leader / faculty pickers across the app</p></div>

      {canWrite && (
        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Name *</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Smith" onKeyDown={(e) => e.key === "Enter" && add()} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Email</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><input className={inputCls} value={dept} onChange={(e) => setDept(e.target.value)} /></div>
          <Button onClick={add} disabled={busy}>{busy ? "Adding…" : "+ Add faculty"}</Button>
        </div>
      )}

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : rows.length === 0 ? <p className="text-gray-400">No faculty added yet.</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((f) => (
            <div key={f.id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2" style={{ background: "#00C9A7" }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-sm font-bold text-[#00C9A7]">{f.name.slice(0, 1).toUpperCase()}</div>
                    <h3 className="font-semibold text-[#0A1628]">{f.name}</h3>
                  </div>
                  {canWrite && <button onClick={() => del(f.id)} className="shrink-0 text-xs text-red-600 hover:underline">Remove</button>}
                </div>
                <p className="mt-2 text-xs text-gray-500">{f.department || "No department"}</p>
                {f.email ? <a href={`mailto:${f.email}`} className="mt-1 inline-block text-xs font-medium text-[#0a8d75] hover:underline">{f.email}</a> : <p className="mt-1 text-xs text-gray-400">No email</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
