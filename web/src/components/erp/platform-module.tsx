"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

type Row = Record<string, unknown>;
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";
const PLANS = ["FREE", "SCHOOL", "ENTERPRISE", "MULTICAMPUS"];
const STATUSES = ["trial", "active", "suspended", "expired"];
const fmtDate = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString() : "—");
const dateVal = (d: unknown) => (d ? new Date(String(d)).toISOString().slice(0, 10) : "");
const statusColor: Record<string, string> = { trial: "bg-amber-100 text-amber-800", active: "bg-[#00C9A7]/15 text-[#0a8d75]", suspended: "bg-red-100 text-red-700", expired: "bg-gray-200 text-gray-600" };

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

  const daysLeft = (d: unknown) => (d ? Math.ceil((new Date(String(d)).getTime() - Date.now()) / 86400000) : null);
  async function runReminders() {
    const r = await api("/api/tenants/run-reminders", { method: "POST" });
    if (r.ok) { const d = await r.json(); flash(`Reminders: ${d.reminded ?? 0} sent · ${d.expired ?? 0} expired`); load(); } else flash("Couldn't run reminders");
  }
  const ql = q.trim().toLowerCase();
  const shown = rows.filter((t) => !ql || [t.name, t.ownerEmail, t.plan].filter(Boolean).map(String).join(" ").toLowerCase().includes(ql));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Platform</h1><p className="text-sm text-gray-500">Customer workspaces &amp; contact messages</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-gray-300 text-sm">
            <button onClick={() => setView("orgs")} className={`px-3 py-1.5 font-medium ${view === "orgs" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Organisations</button>
            <button onClick={() => setView("messages")} className={`px-3 py-1.5 font-medium ${view === "messages" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Messages{msgs.length ? ` (${msgs.length})` : ""}</button>
          </div>
          {view === "orgs" ? <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search organisations…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
            <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
            <Button variant="ghost" onClick={runReminders}>Run reminders</Button>
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
                    <p className="text-xs text-gray-500">{[m.organisation, m.plan].filter(Boolean).join(" · ") || "—"} · {m.createdAt ? new Date(String(m.createdAt)).toLocaleString() : ""}</p>
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
          {shown.map((t) => {
            const dl = daysLeft(t.trialEndsAt);
            return (
              <button key={String(t.id)} onClick={() => setActive(t)} className="block w-full select-none overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="h-2" style={{ background: "#00C9A7" }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628]">{String(t.name)}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[String(t.status)] ?? "bg-gray-100 text-gray-600"}`}>{String(t.status ?? "trial")}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{String(t.ownerEmail ?? "—")} · {String(t.users ?? 0)} user(s)</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">{String(t.plan)}</span>
                    <span className={dl != null && dl <= 7 ? "font-semibold text-red-600" : "text-gray-500"}>{t.trialEndsAt ? `ends ${fmtDate(t.trialEndsAt)}${dl != null ? ` (${dl}d)` : ""}` : "no end date"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {active && <OrgWindow record={active === "new" ? null : active} api={api} token={token} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

type Att = { label: string; url: string };
type Pay = { amount: number; currency?: string; date?: string; note?: string };
const fileHref = (u: string) => (u && u.startsWith("/") ? `${API_URL}${u}` : u);

function OrgWindow({ record, api, token, onClose, onSaved }: { record: Row | null; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = record === null;
  const [f, setF] = useState<Row>(() => record ? { ...record } : { plan: "FREE", trialDays: 30 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tempPw, setTempPw] = useState("");
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const [atts, setAtts] = useState<Att[]>(() => { try { return JSON.parse(String(record?.attachments ?? "[]")); } catch { return []; } });
  const [pays, setPays] = useState<Pay[]>(() => { try { return JSON.parse(String(record?.payments ?? "[]")); } catch { return []; } });
  const [np, setNp] = useState<Pay>({ amount: 0, currency: "USD", date: "", note: "" });
  const [showDel, setShowDel] = useState(false);
  const [delName, setDelName] = useState("");
  const total = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  async function doDelete() {
    if (delName !== String(record?.name)) { setErr("Name doesn't match"); return; }
    setBusy(true);
    const r = await api(`/api/tenants/${String(record!.id)}`, { method: "DELETE", body: JSON.stringify({ confirm: delName }) });
    setBusy(false);
    if (r.ok) onSaved(`Deleted “${String(record?.name)}”`);
    else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Couldn't delete"); }
  }
  async function uploadFile(file: File) {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "tenants"); fd.append("id", String(record?.id ?? "new"));
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (r.ok) { const d = await r.json(); setAtts((p) => [...p, { label: file.name, url: String(d.url ?? "") }]); } else setErr("Upload failed — is R2 enabled?");
  }
  function addPay() { if (!np.amount) return; setPays((p) => [...p, { ...np, amount: Number(np.amount) }]); setNp({ amount: 0, currency: np.currency, date: "", note: "" }); }

  async function create() {
    if (!f.orgName || !f.ownerName || !f.ownerEmail) { setErr("Organisation name, owner name and owner email are required"); return; }
    setBusy(true); setErr("");
    const r = await api("/api/tenants", { method: "POST", body: JSON.stringify({ orgName: f.orgName, ownerName: f.ownerName, ownerEmail: f.ownerEmail, plan: f.plan, trialDays: Number(f.trialDays) || 30 }) });
    setBusy(false);
    if (r.ok) { const d = await r.json(); setTempPw(String(d.tempPassword ?? "")); }
    else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Couldn't create"); }
  }
  async function save() {
    setBusy(true); setErr("");
    const r = await api(`/api/tenants/${String(record!.id)}`, { method: "PATCH", body: JSON.stringify({ name: f.name, plan: f.plan, status: f.status, trialEndsAt: f.trialEndsAt || null, notes: f.notes ?? null, attachments: atts, payments: pays }) });
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
    <Window title={isNew ? "New organisation" : String(f.name)} subtitle={isNew ? "Create a customer workspace" : "Manage organisation"} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{isNew ? <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create & email owner"}</Button> : <><Button variant="ghost" onClick={resend} disabled={busy}>Resend credentials</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}</>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {isNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Organisation name *</label><input className={inputCls} value={String(f.orgName ?? "")} onChange={(e) => set("orgName", e.target.value)} placeholder="e.g. Meridian University" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Owner name *</label><input className={inputCls} value={String(f.ownerName ?? "")} onChange={(e) => set("ownerName", e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Owner email *</label><input className={inputCls} value={String(f.ownerEmail ?? "")} onChange={(e) => set("ownerEmail", e.target.value)} placeholder="admin@their-org.com" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Plan</label><select className={inputCls} value={String(f.plan ?? "FREE")} onChange={(e) => set("plan", e.target.value)}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Trial length (days)</label><input type="number" min={1} className={inputCls} value={String(f.trialDays ?? 30)} onChange={(e) => set("trialDays", e.target.value)} /></div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Organisation name</label><input className={inputCls} value={String(f.name ?? "")} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Plan</label><select className={inputCls} value={String(f.plan ?? "FREE")} onChange={(e) => set("plan", e.target.value)}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Status</label><select className={inputCls} value={String(f.status ?? "trial")} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Trial / subscription ends</label><input type="date" className={inputCls} value={dateVal(f.trialEndsAt)} onChange={(e) => set("trialEndsAt", e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Owner</label><input className={`${inputCls} bg-gray-50`} value={String(f.ownerEmail ?? "—")} disabled /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><textarea rows={2} className={inputCls} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} placeholder="Internal notes about this customer" /></div>

          {/* Payments */}
          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center justify-between"><label className="text-xs font-semibold text-[#0A1628]">Payment log</label><span className="text-xs text-gray-500">Total: {total.toLocaleString()} {pays[0]?.currency ?? ""}</span></div>
            {pays.length > 0 && <div className="mb-2 space-y-1">{pays.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs"><span className="font-semibold text-[#0A1628]">{Number(p.amount).toLocaleString()} {p.currency ?? ""}</span><span className="text-gray-500">{p.date || ""}</span><span className="flex-1 truncate text-gray-500">{p.note || ""}</span><button type="button" onClick={() => setPays(pays.filter((_, j) => j !== i))} className="text-red-600 hover:underline">remove</button></div>
            ))}</div>}
            <div className="grid grid-cols-12 gap-2">
              <input type="number" placeholder="Amount" className={`${inputCls} col-span-3`} value={np.amount || ""} onChange={(e) => setNp({ ...np, amount: Number(e.target.value) })} />
              <input placeholder="Cur" className={`${inputCls} col-span-2`} value={np.currency ?? ""} onChange={(e) => setNp({ ...np, currency: e.target.value })} />
              <input type="date" className={`${inputCls} col-span-3`} value={np.date ?? ""} onChange={(e) => setNp({ ...np, date: e.target.value })} />
              <input placeholder="Note" className={`${inputCls} col-span-3`} value={np.note ?? ""} onChange={(e) => setNp({ ...np, note: e.target.value })} />
              <button type="button" onClick={addPay} className="col-span-1 rounded-md bg-[#0A1628] text-xs font-bold text-[#00C9A7]">+</button>
            </div>
          </div>

          {/* Attachments */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[#0A1628]">Attachments <span className="font-normal text-gray-400">(contracts, invoices…)</span></label>
            {atts.length > 0 && <div className="mb-2 space-y-1">{atts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs"><a href={fileHref(a.url)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">📎 {a.label}</a><button type="button" onClick={() => setAtts(atts.filter((_, j) => j !== i))} className="text-red-600 hover:underline">remove</button></div>
            ))}</div>}
            <label className="inline-block cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">📎 Attach file<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadFile(file); }} /></label>
          </div>

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
