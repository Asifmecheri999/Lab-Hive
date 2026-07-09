"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

// LabSynch is free and open source, so this panel is plain workspace management —
// no plans, trials, subscriptions or billing. Each organisation is a self-contained
// workspace with its own owner-admin and full access to every module.
type Row = Record<string, unknown>;
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

export function PlatformModule({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"orgs" | "messages">("orgs");
  const [msgs, setMsgs] = useState<Row[]>([]);
  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const r = await api("/api/tenants");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    if (r.ok) setRows(await r.json()); else setErr(`HTTP ${r.status}`);
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const loadMsgs = useCallback(async () => { const r = await api("/api/contact"); if (r.ok) setMsgs(await r.json()); }, [api]);
  useEffect(() => { loadMsgs(); }, [loadMsgs]);
  async function setHandled(id: string, handled: boolean) { await api(`/api/contact/${id}`, { method: "PATCH", body: JSON.stringify({ handled }) }); loadMsgs(); }
  async function delMsg(id: string) { if (!confirm("Delete this message?")) return; await api(`/api/contact/${id}`, { method: "DELETE" }); loadMsgs(); }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 3000); }

  const ql = q.trim().toLowerCase();
  const shown = rows.filter((t) => !ql || [t.name, t.ownerEmail].filter(Boolean).map(String).join(" ").toLowerCase().includes(ql));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Platform</h1><p className="text-sm text-gray-500">Organisations &amp; contact messages</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-gray-300 text-sm">
            <button onClick={() => setView("orgs")} className={`px-3 py-1.5 font-medium ${view === "orgs" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Organisations</button>
            <button onClick={() => setView("messages")} className={`px-3 py-1.5 font-medium ${view === "messages" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Messages{msgs.length ? ` (${msgs.length})` : ""}</button>
          </div>
          {view === "orgs" ? <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search organisations…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
            <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
            <Button onClick={() => setActive("new")}>+ New organisation</Button>
          </> : <button onClick={loadMsgs} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>}
        </div>
      </div>

      {view === "messages" && (
        msgs.length === 0 ? <p className="text-gray-400">No contact messages yet.</p> : (
          <div className="space-y-3">
            {msgs.map((m) => (
              <div key={String(m.id)} className={`rounded-xl bg-white p-4 shadow-sm ring-1 ${m.handled ? "ring-black/5 opacity-70" : "ring-[#00C9A7]/30"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#0A1628]">{String(m.name)} <a href={`mailto:${String(m.email)}`} className="text-sm font-normal text-[#0a8d75] hover:underline">&lt;{String(m.email)}&gt;</a></p>
                    <p className="text-xs text-gray-500">{String(m.organisation || "—")} · {m.createdAt ? new Date(String(m.createdAt)).toLocaleString() : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <button onClick={() => setHandled(String(m.id), !m.handled)} className="rounded border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-100">{m.handled ? "Mark unhandled" : "Mark handled"}</button>
                    <button onClick={() => delMsg(String(m.id))} className="rounded px-1 text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{String(m.message)}</p>
              </div>
            ))}
          </div>
        )
      )}

      {view === "orgs" && (err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">{rows.length ? "No organisations match your search." : "No organisations yet. Click “+ New organisation”."}</p> : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <button key={String(t.id)} onClick={() => setActive(t)} className="block w-full select-none overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-2" style={{ background: "#00C9A7" }} />
              <div className="p-5">
                <h3 className="font-semibold text-[#0A1628]">{String(t.name)}</h3>
                <p className="mt-1 truncate text-xs text-gray-500">{String(t.ownerEmail ?? "—")}</p>
                <p className="mt-3 text-xs text-gray-400">{String(t.users ?? 0)} user{Number(t.users ?? 0) === 1 ? "" : "s"}</p>
              </div>
            </button>
          ))}
        </div>
      ))}

      {active && <OrgWindow record={active === "new" ? null : active} api={api} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function OrgWindow({ record, api, onClose, onSaved }: { record: Row | null; api: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = record === null;
  const [f, setF] = useState<Row>(() => record ? { ...record } : {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tempPw, setTempPw] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const [showDel, setShowDel] = useState(false);
  const [delName, setDelName] = useState("");

  async function doDelete() {
    if (delName !== String(record?.name)) { setErr("Name doesn't match"); return; }
    setBusy(true);
    const r = await api(`/api/tenants/${String(record!.id)}`, { method: "DELETE", body: JSON.stringify({ confirm: delName }) });
    setBusy(false);
    if (r.ok) onSaved(`Deleted “${String(record?.name)}”`);
    else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Couldn't delete"); }
  }

  async function create() {
    if (!f.orgName || !f.ownerName || !f.ownerEmail) { setErr("Organisation name, owner name and owner email are required"); return; }
    setBusy(true); setErr("");
    const r = await api("/api/tenants", { method: "POST", body: JSON.stringify({ orgName: f.orgName, ownerName: f.ownerName, ownerEmail: f.ownerEmail }) });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setTempPw(String(d.tempPassword ?? "")); }
    else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Couldn't create"); }
  }
  async function save() {
    setBusy(true); setErr("");
    const r = await api(`/api/tenants/${String(record!.id)}`, { method: "PATCH", body: JSON.stringify({ name: f.name, notes: f.notes ?? null }) });
    setBusy(false);
    if (r.ok) onSaved("Saved"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Save failed"); }
  }
  async function resend() {
    if (!confirm("Reset the owner's password and email them new credentials?")) return;
    setBusy(true); setErr("");
    const r = await api(`/api/tenants/${String(record!.id)}/resend`, { method: "POST" });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setTempPw(String(d.tempPassword ?? "")); } else setErr("Couldn't resend");
  }

  if (tempPw) {
    return (
      <Window title={isNew ? "Organisation created" : "New credentials"} subtitle="Temporary password (also emailed to the owner)" onClose={() => onSaved("Done")}
        footer={<Button onClick={() => onSaved("Done")}>Done</Button>}>
        <p className="mb-3 text-sm text-gray-600">A welcome email with sign-in details was sent to <b>{String(f.ownerEmail ?? record?.ownerEmail)}</b>. The temporary password is shown once here:</p>
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3"><code className="flex-1 text-sm font-bold text-[#0A1628]">{tempPw}</code><button onClick={() => navigator.clipboard?.writeText(tempPw)} className="rounded bg-[#0A1628] px-2.5 py-1 text-xs font-semibold text-[#00C9A7]">Copy</button></div>
        <p className="mt-3 text-xs text-gray-400">They'll be asked to set their own password on first sign-in.</p>
      </Window>
    );
  }

  return (
    <Window title={isNew ? "New organisation" : String(f.name)} subtitle={isNew ? "Create a workspace" : "Manage organisation"} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{isNew ? <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create & email owner"}</Button> : <><Button variant="ghost" onClick={resend} disabled={busy}>Resend credentials</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}</>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {isNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Organisation name *</label><input className={inputCls} value={String(f.orgName ?? "")} onChange={(e) => set("orgName", e.target.value)} placeholder="e.g. Meridian University" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Owner name *</label><input className={inputCls} value={String(f.ownerName ?? "")} onChange={(e) => set("ownerName", e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Owner email *</label><input className={inputCls} value={String(f.ownerEmail ?? "")} onChange={(e) => set("ownerEmail", e.target.value)} placeholder="admin@their-org.com" /></div>
          <p className="sm:col-span-2 text-xs text-gray-400">Creates the workspace and an owner-admin account with full access to every module, and emails them sign-in details. Free — no plan or trial.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Organisation name</label><input className={inputCls} value={String(f.name ?? "")} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Owner</label><input className={`${inputCls} bg-gray-50`} value={String(f.ownerEmail ?? "—")} disabled /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><textarea rows={2} className={inputCls} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} placeholder="Internal notes about this workspace" /></div>

          {/* Danger zone — name-confirmed permanent delete */}
          <div className="sm:col-span-2 mt-1 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-700">Danger zone</p>
            {!showDel ? (
              <button type="button" onClick={() => setShowDel(true)} className="mt-1 text-xs font-medium text-red-700 underline">Delete this organisation…</button>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-red-700">This permanently removes <b>{String(record?.name)}</b> and all of <b>its own</b> data — users, inventory, schedule, everything. Other organisations are not affected. This cannot be undone. Type the name to confirm:</p>
                <input value={delName} onChange={(e) => setDelName(e.target.value)} placeholder={String(record?.name)} className={inputCls} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy || delName !== String(record?.name)} onClick={doDelete} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-50">{busy ? "Deleting…" : "Permanently delete"}</button>
                  <button type="button" onClick={() => { setShowDel(false); setDelName(""); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Window>
  );
}
