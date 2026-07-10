"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { useOrgLists, supValue } from "@/lib/org-lists";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const LAB_TEAM = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
const DECISION = ["FACULTY", "DEAN", "ADMIN", "LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER"];
type Row = Record<string, unknown>;
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
const parseDocs = (raw: unknown, legacy?: unknown): { label: string; url: string }[] => {
  try { const a = JSON.parse(String(raw ?? "[]")); if (Array.isArray(a) && a.length) return a; } catch { /* fall through */ }
  return legacy ? [{ label: "Attachment", url: String(legacy) }] : [];
};

const JOB_TYPES = [
  { v: "THREE_D_PRINT", l: "3D Print" }, { v: "LASER_CUT", l: "Laser Cut" }, { v: "CNC", l: "CNC / Machining" },
  { v: "SUPERVISED_SESSION", l: "Supervised Session" }, { v: "EQUIPMENT_USE", l: "Equipment Use" }, { v: "OTHER", l: "Other" },
];
const jobTypeLabel = (v: string) => JOB_TYPES.find((t) => t.v === v)?.l ?? v;

const STATUS_META: Record<string, { l: string; c: string }> = {
  PENDING: { l: "Pending review", c: "bg-amber-100 text-amber-800" },
  APPROVED: { l: "Approved · not started", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
  HOLD: { l: "On hold", c: "bg-orange-100 text-orange-700" },
  REJECTED: { l: "Rejected", c: "bg-red-100 text-red-700" },
  IN_PROGRESS: { l: "In progress", c: "bg-blue-100 text-blue-700" },
  COMPLETED: { l: "Finished", c: "bg-gray-100 text-gray-600" },
};
const statusBadge = (s: string) => STATUS_META[s] ?? { l: s, c: "bg-gray-100 text-gray-600" };

// A request "signature" changes when the item is new or gets updated (status /
// approval). Jobs include the approval count; portal + RA use status + timestamp.
const sigJob = (r: Row) => `${r.id}:${r.updatedAt ?? r.createdAt ?? ""}:${r.status ?? ""}:${((r.approvals as unknown[]) ?? []).length}`;
const sigPortal = (r: Row) => `${r.id}:${r.updatedAt ?? r.createdAt ?? ""}:${r.status ?? ""}`;
const sigRa = (r: Row) => `${r.id}:${r.updatedAt ?? r.createdAt ?? ""}:${r.status ?? ""}`;
type ReqKey = "jobs" | "ra" | "ppe" | "resource" | "access";
const REQ_TYPES: { key: ReqKey; path: string; sig: (r: Row) => string }[] = [
  { key: "jobs", path: "/api/requests", sig: sigJob },
  { key: "ra", path: "/api/safety/ra", sig: sigRa },
  { key: "ppe", path: "/api/portal-requests?kind=PPE", sig: sigPortal },
  { key: "resource", path: "/api/portal-requests?kind=RESOURCE", sig: sigPortal },
  { key: "access", path: "/api/portal-requests?kind=ACCESS", sig: sigPortal },
];
const SIG_OF: Record<ReqKey, (r: Row) => string> = { jobs: sigJob, ra: sigRa, ppe: sigPortal, resource: sigPortal, access: sigPortal };

// Cross-tab request NOTIFICATIONS (not a running total). The badge stays (0) until
// something actually needs attention — a brand-new request or an update (status /
// approval change) that the user hasn't opened yet. Opening the tile clears it;
// that specific tile also glows until opened. On the very first load we baseline
// the current state as "seen", so the existing backlog does NOT light up — only
// things that arrive or change afterwards do. Persisted per user; polls to stay
// fresh. Same behaviour for students, faculty and admins.
const SEEN_KEY = "labsynch.reqseen.v3";
function useReqNotifications(api: (p: string, i?: RequestInit) => Promise<Response>) {
  const [data, setData] = useState<Record<ReqKey, Row[]>>({ jobs: [], ra: [], ppe: [], resource: [], access: [] });
  const [seen, setSeen] = useState<Set<string>>(() => { try { return new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set<string>(); } });
  const baselined = useRef<boolean>((() => { try { return localStorage.getItem(SEEN_KEY) !== null; } catch { return false; } })());
  const load = useCallback(async () => {
    const results = await Promise.all(REQ_TYPES.map((t) => api(t.path).then((r) => (r.ok ? r.json() : [])).catch(() => [])));
    setData((prev) => { const next = { ...prev }; REQ_TYPES.forEach((t, i) => { next[t.key] = Array.isArray(results[i]) ? results[i] : []; }); return next; });
  }, [api]);
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    // Also refresh the moment the user returns to this tab/window, so the badges
    // are up to date immediately instead of waiting for the next poll.
    const onWake = () => { if (!document.hidden) load(); };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => { clearInterval(iv); window.removeEventListener("focus", onWake); document.removeEventListener("visibilitychange", onWake); };
  }, [load]);
  // First data load ever → treat everything already there as acknowledged, so the
  // badges start at (0) and only rise for genuinely new/updated items after this.
  useEffect(() => {
    if (baselined.current) return;
    const all = REQ_TYPES.flatMap((t) => data[t.key].map((r) => t.sig(r)));
    if (all.length === 0) return; // wait for the first real data
    baselined.current = true;
    const s = new Set(all);
    setSeen(s);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* quota */ }
  }, [data]);
  const markSeen = useCallback((key: ReqKey, r: Row) => {
    const s = SIG_OF[key](r);
    setSeen((prev) => { if (prev.has(s)) return prev; const n = new Set(prev); n.add(s); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...n])); } catch { /* quota */ } return n; });
  }, []);
  const isUnread = useCallback((key: ReqKey, r: Row) => !seen.has(SIG_OF[key](r)), [seen]);
  const counts: Record<string, number> = {};
  REQ_TYPES.forEach((t) => { counts[t.key] = data[t.key].reduce((n, r) => (seen.has(t.sig(r)) ? n : n + 1), 0); });
  return { counts, markSeen, isUnread, refresh: load };
}

// Tile ring — teal glow when the item needs attention (new/updated), plain otherwise.
const tileGlow = (on?: boolean) => (on ? "ring-2 ring-[#00C9A7] shadow-[0_0_14px_rgba(0,201,167,0.40)]" : "ring-1 ring-black/5");
// Small pulsing dot in a tile corner to flag a new/updated request.
const NewDot = () => (
  <span className="absolute right-2.5 top-2.5 z-10 flex h-2.5 w-2.5">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00C9A7] opacity-75" />
    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00C9A7]" />
  </span>
);

// Friendly timestamp for request cards/detail (e.g. "3 Jul 2026, 14:05"). Empty if no date.
const fmtWhen = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function RequestsModule({ token, role }: { token: string; role: string }) {
  const [tab, setTab] = useState<"jobs" | "ra" | "ppe" | "resource" | "access" | "planner">("jobs");
  const [openId, setOpenId] = useState("");
  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const { counts, markSeen, isUnread, refresh } = useReqNotifications(api);
  const refTypeOf = (key: ReqKey): string => (key === "jobs" ? "JOB" : key === "ra" ? "RA" : key === "ppe" ? "PPE" : key === "resource" ? "RESOURCE" : "ACCESS");
  // Opening a tile: mark it seen locally AND clear its bell notifications on the server, then nudge
  // the bell + sidebar to refresh — so a notification disappears the moment its request is dealt with.
  const seenAndRead = useCallback((key: ReqKey, r: Row) => {
    markSeen(key, r);
    api("/api/notifications/read-ref", { method: "POST", body: JSON.stringify({ refType: refTypeOf(key), refId: String(r.id) }) })
      .then(() => { try { window.dispatchEvent(new Event("labsynch:notif-refresh")); } catch { /* no-op */ } })
      .catch(() => { /* best-effort */ });
  }, [api, markSeen]);
  const searchParams = useSearchParams();

  // Deep-link from a notification: /requests?tab=ra&open=<id> opens the right tab + record.
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && ["jobs", "ra", "ppe", "resource", "access", "planner"].includes(t)) setTab(t as typeof tab);
    const o = searchParams.get("open");
    if (o) setOpenId(o);
  }, [searchParams]);
  const clearOpen = useCallback(() => {
    setOpenId("");
    // Strip ?open= from the URL so a hard refresh doesn't re-open the record.
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.has("open")) { sp.delete("open"); const qs = sp.toString(); window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname); }
    } catch { /* no-op */ }
  }, []);

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => {
    const n = counts[id] ?? 0;
    return (
      <button onClick={() => setTab(id)} className={`select-none rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
        {label} <span className={`ml-0.5 text-sm font-bold ${tab === id ? "text-[#00C9A7]" : n > 0 ? "text-[#0a8d75]" : "text-gray-400"}`}>({n})</span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#0A1628]">Requests</h1>
        <p className="text-sm text-gray-500">Job requests, RA submissions, PPE and resource requests — with an approval planner</p>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <TabBtn id="jobs" label="Job Requests" />
        <TabBtn id="ra" label="RA Submission" />
        <TabBtn id="ppe" label="PPE Request" />
        <TabBtn id="resource" label="Resource Request" />
        <TabBtn id="access" label="Lab Access" />
      </div>

      {tab === "jobs" && <JobRequests api={api} token={token} role={role} openId={openId} clearOpen={clearOpen} markSeen={(r) => seenAndRead("jobs", r)} isUnread={(r) => isUnread("jobs", r)} onChanged={refresh} />}
      {tab === "ppe" && <PortalRequests api={api} token={token} role={role} variant="labcoat" openId={openId} clearOpen={clearOpen} markSeen={(r) => seenAndRead("ppe", r)} isUnread={(r) => isUnread("ppe", r)} onChanged={refresh} />}
      {tab === "ra" && <RaSubmissions api={api} token={token} role={role} openId={openId} clearOpen={clearOpen} markSeen={(r) => seenAndRead("ra", r)} isUnread={(r) => isUnread("ra", r)} onChanged={refresh} />}
      {tab === "resource" && <PortalRequests api={api} token={token} role={role} variant="borrowing" openId={openId} clearOpen={clearOpen} markSeen={(r) => seenAndRead("resource", r)} isUnread={(r) => isUnread("resource", r)} onChanged={refresh} />}
      {tab === "access" && <PortalRequests api={api} token={token} role={role} variant="access" openId={openId} clearOpen={clearOpen} markSeen={(r) => seenAndRead("access", r)} isUnread={(r) => isUnread("access", r)} onChanged={refresh} />}
    </div>
  );
}

// ───────────────────────── Job Requests ─────────────────────────
function JobRequests({ api, token, role, openId, clearOpen, markSeen, isUnread, onChanged }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; openId?: string; clearOpen?: () => void; markSeen: (r: Row) => void; isUnread?: (r: Row) => boolean; onChanged?: () => void }) {
  // Faculty submit their own job requests but do NOT review students' — treat them
  // as a submitter here (own list + "+ New request"), never a decider/processor.
  const canDecide = DECISION.includes(role) && role !== "FACULTY";
  const canProcess = LAB_TEAM.includes(role);
  const [view, setView] = useState<"list" | "board">("list");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("ALL");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/requests");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = await r.json();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const open = useCallback((r: Row) => { markSeen(r); setActive(r); }, [markSeen]);
  useEffect(() => { if (!openId) return; const row = rows.find((r) => String(r.id) === openId); if (row) { markSeen(row); setActive(row); clearOpen?.(); } }, [openId, rows, clearOpen, markSeen]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const ql = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (statusF !== "ALL" && String(r.status) !== statusF) return false;
    if (!ql) return true;
    return [r.title, r.type, (r.user as { name?: string })?.name].filter(Boolean).join(" ").toLowerCase().includes(ql);
  });

  return (
    <div>
      {canProcess && (
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 p-0.5">
          <button onClick={() => setView("list")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Requests</button>
          <button onClick={() => setView("board")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "board" ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>Planner board</button>
        </div>
      )}
      {view === "board" && canProcess ? <Planner api={api} role={role} /> : (
      <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requests…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700">
          <option value="ALL">All status</option>{Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].l}</option>)}
        </select>
        <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
        {!canProcess && <div className="ml-auto"><Button onClick={() => setActive("new")}>+ New request</Button></div>}
      </div>

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : shown.length === 0 ? <p className="text-gray-400">No requests.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => {
            const b = statusBadge(String(r.status));
            return (
              <button key={String(r.id)} onClick={() => open(r)} className={`relative flex w-full select-none flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${tileGlow(isUnread?.(r))}`}>
                {isUnread?.(r) && <NewDot />}
                <div className="h-2 w-full shrink-0" style={{ background: "#00C9A7" }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628]">{String(r.title)}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.c}`}>{b.l}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{[jobTypeLabel(String(r.type)), (r.user as { name?: string })?.name].filter(Boolean).join(" · ")}</p>
                  {r.createdAt ? <p className="mt-0.5 text-[11px] text-gray-400">Submitted {fmtWhen(r.createdAt)}</p> : null}
                  {(() => { const ln = ((r.approvals as Row[]) ?? []).filter((a) => a.comments).slice(-1)[0]?.comments; return ln ? <p className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">💬 {String(ln)}</p> : null; })()}
                </div>
              </button>
            );
          })}
        </div>
      )}
      </>
      )}

      {active && <JobWindow record={active === "new" ? null : active} api={api} token={token} role={role} canDecide={canDecide} canProcess={canProcess}
        onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); onChanged?.(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function JobWindow({ record, api, token, role, canDecide, canProcess, onClose, onSaved }: {
  record: Row | null; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; canDecide: boolean; canProcess: boolean;
  onClose: () => void; onSaved: (m: string) => void;
}) {
  const isNew = record === null;
  const isFaculty = role === "FACULTY";
  const { schools, departments, supervisors } = useOrgLists(token);
  const [f, setF] = useState<Row>(() => record ? { ...record } : { type: "THREE_D_PRINT" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [err, setErr] = useState("");
  const [acting, setActing] = useState(false);
  const [docs, setDocs] = useState<{ label: string; url: string }[]>(() => parseDocs(record?.attachments, record?.fileUrl));
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const status = String(f.status ?? "PENDING");
  async function upload(file: File) {
    setUpBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "requests"); fd.append("id", "job");
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setUpBusy(false);
    if (r.ok) { const d = await r.json(); setDocs((p) => [...p, { label: file.name, url: String(d.url ?? "") }]); } else setErr("Upload failed — is R2 file storage enabled?");
  }

  const approvals = (record?.approvals as Row[]) ?? [];
  const lastNote = approvals.filter((a) => a.comments).slice(-1)[0]?.comments as string | undefined;

  async function create() {
    if (!f.title || !f.description) { setErr("Title and description are required"); return; }
    setBusy(true); setErr("");
    try {
      const r = await api("/api/requests", { method: "POST", body: JSON.stringify({ ...f, attachments: docs, fileUrl: docs[0]?.url ?? null }) });
      if (r.ok) onSaved("Request submitted"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Failed"); }
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm("Remove this request from your list?")) return;
    setBusy(true); setErr("");
    try {
      const r = await api(`/api/requests/${record!.id}`, { method: "DELETE" });
      if (r.ok) onSaved("Removed"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Delete failed"); }
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }
  async function decide(decision: "approve" | "reject" | "hold") {
    if ((decision === "reject" || decision === "hold") && !note.trim()) { setErr("Please add a comment explaining the reason."); return; }
    const ask = decision === "approve" ? "Approve this request?" : decision === "reject" ? "Reject this request?" : "Put this request on hold?";
    if (!confirm(ask)) return;
    setBusy(true); setErr("");
    try {
      const r = await api(`/api/requests/${record!.id}/${decision}`, { method: "POST", body: JSON.stringify({ comments: note }) });
      if (r.ok) onSaved(decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "On hold"); else setErr("Action failed");
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }
  async function advance(to: string, label: string) {
    setBusy(true); setErr("");
    try {
      const r = await api(`/api/requests/${record!.id}/status`, { method: "PATCH", body: JSON.stringify({ status: to }) });
      if (r.ok) onSaved(label); else setErr("Action failed");
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }

  const b = statusBadge(status);
  return (
    <Window width="max-w-4xl" tall title={isNew ? "New job request" : String(f.title ?? "Request")} subtitle={isNew ? "3D print / laser / machining…" : jobTypeLabel(String(f.type))}
      onClose={onClose}
      footer={<>
        {!isNew && (canDecide || canProcess) && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {isNew && <Button onClick={create} disabled={busy}>{busy ? "Submitting…" : "Submit"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {!isNew && <div className="mb-4 flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${b.c}`}>{b.l}</span>{f.createdAt ? <span className="text-xs text-gray-400">Submitted {fmtWhen(f.createdAt)}</span> : null}</div>}
      {isNew && <p className="mb-3 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">When you submit, the lab team will see your name and email.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Category *</label><select className={inputCls} disabled={!isNew} value={String(f.type ?? "")} onChange={(e) => set("type", e.target.value)}>{JOB_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Title *</label><input className={inputCls} disabled={!isNew} value={String(f.title ?? "")} onChange={(e) => set("title", e.target.value)} placeholder="e.g. 3D Printing Prototype" /></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Job description *</label><textarea rows={3} className={inputCls} disabled={!isNew} value={String(f.description ?? "")} onChange={(e) => set("description", e.target.value)} placeholder="What you need help with — materials, equipment, steps." /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Preferred completion date</label><input type="date" className={inputCls} disabled={!isNew} value={String(f.preferredDate ?? "").slice(0, 10)} onChange={(e) => set("preferredDate", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">If urgent, explanation</label><input className={inputCls} disabled={!isNew} value={String(f.urgentReason ?? "")} onChange={(e) => set("urgentReason", e.target.value)} placeholder="Why it's urgent (else leave blank)" /></div>
        {!isFaculty && <div><label className="mb-1 block text-xs font-medium text-gray-600">Student ID</label><input className={inputCls} disabled={!isNew} value={String(f.studentId ?? "")} onChange={(e) => set("studentId", e.target.value)} /></div>}
        {!isFaculty && <div><label className="mb-1 block text-xs font-medium text-gray-600">Course</label><input className={inputCls} disabled={!isNew} value={String(f.course ?? "")} onChange={(e) => set("course", e.target.value)} placeholder="Course name or code" /></div>}
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">{isFaculty ? "Supervisor (Self or another)" : "Course supervisor"}</label><select className={inputCls} disabled={!isNew} value={String(f.supervisor ?? "")} onChange={(e) => set("supervisor", e.target.value)}><option value="">— select supervisor —</option>{isFaculty && <option value="Self">Self</option>}{supervisors.map((s) => <option key={s.email} value={supValue(s)}>{s.name}{s.email ? ` (${s.email})` : ""}</option>)}{!!f.supervisor && f.supervisor !== "Self" && !supervisors.some((s) => supValue(s) === f.supervisor) && <option value={String(f.supervisor)}>{String(f.supervisor)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">School</label><select className={inputCls} disabled={!isNew} value={String(f.school ?? "")} onChange={(e) => set("school", e.target.value)}><option value="">— select —</option>{schools.map((s) => <option key={s} value={s}>{s}</option>)}{!!f.school && !schools.includes(String(f.school)) && <option value={String(f.school)}>{String(f.school)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} disabled={!isNew} value={String(f.department ?? "")} onChange={(e) => set("department", e.target.value)}><option value="">— select —</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!!f.department && !departments.includes(String(f.department)) && <option value={String(f.department)}>{String(f.department)}</option>}</select></div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Attachments <span className="font-normal text-gray-400">(drawings, specs — one or more)</span></label>
          {docs.length > 0 && <div className="mb-2 space-y-1">{docs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs"><a href={fileHref(d.url)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">📎 {d.label}</a>{isNew && <button type="button" onClick={() => setDocs(docs.filter((_, j) => j !== i))} className="text-red-600 hover:underline">remove</button>}</div>
          ))}</div>}
          {isNew ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">{upBusy ? "Uploading…" : "📎 Attach file"}<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} /></label>
              <input className={`${inputCls} flex-1`} placeholder="…or paste a link, then press Enter" onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === "Enter" && v) { setDocs((p) => [...p, { label: "Link", url: v }]); (e.target as HTMLInputElement).value = ""; e.preventDefault(); } }} />
            </div>
          ) : (docs.length === 0 && <span className="text-sm text-gray-400">None</span>)}
        </div>
      </div>

      {!isNew && lastNote && <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700"><span className="font-semibold">Review note:</span> {lastNote}</div>}

      {/* Staff actions — gated behind "Review & decide" so nothing is clicked accidentally */}
      {(() => {
        const canDecideNow = canDecide && ["PENDING", "HOLD"].includes(status);
        const canProcessNow = canProcess && ["APPROVED", "IN_PROGRESS"].includes(status);
        if (isNew || !(canDecideNow || canProcessNow)) return null;
        return (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</p>
              {!acting && <Button onClick={() => setActing(true)}>Review</Button>}
            </div>
            {acting && (
              <>
                {canDecideNow && (
                  <>
                    <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment to the requester (required for Hold / Reject)" className={`${inputCls} mb-2`} />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => decide("approve")} disabled={busy}>Approve</Button>
                      <Button variant="ghost" onClick={() => decide("hold")} disabled={busy}>Hold</Button>
                      <Button variant="danger" onClick={() => decide("reject")} disabled={busy}>Reject</Button>
                    </div>
                  </>
                )}
                {canProcessNow && status === "APPROVED" && <Button onClick={() => advance("IN_PROGRESS", "Started")} disabled={busy}>Start (in progress)</Button>}
                {canProcessNow && status === "IN_PROGRESS" && <Button onClick={() => advance("COMPLETED", "Finished")} disabled={busy}>Mark finished</Button>}
              </>
            )}
          </div>
        );
      })()}

      {!isNew && <Thread api={api} token={token} refType="JOB" refId={String(record!.id)} />}
    </Window>
  );
}

// ───────────────────────── PPE (lab coat) & Resource (borrowing) requests ─────────────────────────
const PURPOSES = ["Course Work", "Project / FYP", "Research", "Other"];
const PR_STATUS: Record<string, { l: string; c: string }> = {
  pending: { l: "Pending", c: "bg-amber-100 text-amber-800" },
  approved: { l: "Approved", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
  rejected: { l: "Rejected", c: "bg-red-100 text-red-700" },
  hold: { l: "On hold", c: "bg-orange-100 text-orange-700" },
  issued: { l: "Issued", c: "bg-blue-100 text-blue-700" },
};
const parseJson = <T,>(s: unknown, fb: T): T => { try { return JSON.parse(String(s ?? "")) as T; } catch { return fb; } };
const prettyKey = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
type Variant = "labcoat" | "borrowing" | "access";

// Admin editor for the PPE item list that students choose from.
function PpeOptionsEditor({ api }: { api: (p: string, i?: RequestInit) => Promise<Response> }) {
  const [options, setOptions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api("/api/safety/ppe-options").then((r) => (r.ok ? r.json() : { options: [] })).then((d: { options?: unknown[] }) => {
      setOptions(Array.isArray(d?.options) ? d.options.map(String) : []); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [api]);
  async function save(next: string[]) {
    setSaving(true); setMsg("");
    const r = await api("/api/safety/ppe-options", { method: "PUT", body: JSON.stringify({ options: next }) });
    setSaving(false);
    if (r.ok) { const d = await r.json().catch(() => ({})); setOptions(Array.isArray(d?.options) ? d.options.map(String) : next); setMsg("Saved ✓"); setTimeout(() => setMsg(""), 1500); }
    else setMsg("Save failed");
  }
  function add() { const v = input.trim(); setInput(""); if (!v || options.some((o) => o.toLowerCase() === v.toLowerCase())) return; save([...options, v]); }
  if (!loaded) return null;
  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#0A1628]">PPE items students can request</p>
        {msg && <span className="text-xs font-medium text-[#0a8d75]">{msg}</span>}
      </div>
      <p className="mt-0.5 text-xs text-gray-500">Add the items students choose from (e.g. Safety glasses, Nitrile gloves, Lab coat). Changes show in the student PPE form instantly.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.length === 0 ? <span className="text-xs text-gray-400">No items yet — add one below.</span>
          : options.map((name) => (
            <span key={name} className="inline-flex items-center gap-1.5 rounded-full bg-[#00C9A7]/10 px-3 py-1 text-sm font-medium text-[#0a8d75]">
              {name}<button onClick={() => save(options.filter((o) => o !== name))} disabled={saving} className="text-[#0a8d75]/70 hover:text-red-600">✕</button>
            </span>
          ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className={inputCls} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="e.g. Safety glasses" />
        <Button onClick={add} disabled={saving || !input.trim()}>Add</Button>
      </div>
    </div>
  );
}

function PortalRequests({ api, token, role, variant, openId, clearOpen, markSeen, isUnread, onChanged }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; variant: Variant; openId?: string; clearOpen?: () => void; markSeen: (r: Row) => void; isUnread?: (r: Row) => boolean; onChanged?: () => void }) {
  const kind = variant === "labcoat" ? "PPE" : variant === "borrowing" ? "RESOURCE" : "ACCESS";
  const canReview = LAB_TEAM.includes(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [submit, setSubmit] = useState(false);
  const [active, setActive] = useState<Row | null>(null);
  const [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api(`/api/portal-requests?kind=${kind}`);
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = await r.json();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api, kind]);
  useEffect(() => { load(); }, [load]);
  const open = useCallback((r: Row) => { markSeen(r); setActive(r); }, [markSeen]);
  useEffect(() => { if (!openId) return; const row = rows.find((r) => String(r.id) === openId); if (row) { markSeen(row); setActive(row); clearOpen?.(); } }, [openId, rows, clearOpen, markSeen]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const hint = variant === "labcoat"
    ? "Request PPE — lab coat, safety shoes, gloves, glasses and more. The lab team reviews and approves."
    : variant === "borrowing"
    ? "Request items to borrow for your work. The lab team checks availability and pushes it to an issuance."
    : "Request access to a laboratory. The lab team reviews and approves.";
  const submitLabel = variant === "labcoat" ? "Request PPE" : variant === "borrowing" ? "Request to borrow" : "Request lab access";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">{hint}</p>
        {!canReview && <Button onClick={() => setSubmit(true)}>+ {submitLabel}</Button>}
      </div>
      {variant === "labcoat" && canReview && <PpeOptionsEditor api={api} />}
      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : rows.length === 0 ? <p className="text-gray-400">Nothing here yet.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const st = PR_STATUS[String(r.status ?? "pending")] ?? PR_STATUS.pending;
            const data = parseJson<Record<string, unknown>>(r.data, {});
            const items = parseJson<unknown[]>(r.items, []);
            const title = variant === "labcoat" ? "PPE request" : variant === "borrowing" ? String(data.purpose ?? "Borrowing") : `Lab access — ${String(data.labName ?? "")}`;
            const sub = variant === "labcoat" ? `${items.length} item(s)` : variant === "borrowing" ? `${String(data.school ?? "")} · ${items.length} item(s)` : String(data.course ?? "");
            return (
              <button key={String(r.id)} onClick={() => open(r)} className={`relative flex w-full select-none flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${tileGlow(isUnread?.(r))}`}>
                {isUnread?.(r) && <NewDot />}
                <div className="h-2 w-full shrink-0" style={{ background: "#00C9A7" }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628]">{title}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${st.c}`}>{st.l}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{sub}</p>
                  {r.submitterName ? <p className="mt-0.5 text-xs text-gray-400">{String(r.submitterName)}</p> : null}
                  {r.createdAt ? <p className="mt-0.5 text-[11px] text-gray-400">Submitted {fmtWhen(r.createdAt)}</p> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {submit && (variant === "labcoat"
        ? <LabCoatForm api={api} token={token} role={role} onClose={() => setSubmit(false)} onSaved={() => { setSubmit(false); flash("Submitted"); load(); onChanged?.(); }} />
        : variant === "borrowing"
        ? <BorrowingForm api={api} token={token} role={role} onClose={() => setSubmit(false)} onSaved={() => { setSubmit(false); flash("Submitted"); load(); onChanged?.(); }} />
        : <AccessForm api={api} token={token} role={role} onClose={() => setSubmit(false)} onSaved={() => { setSubmit(false); flash("Submitted"); load(); onChanged?.(); }} />)}
      {active && <PortalDetail record={active} variant={variant} api={api} token={token} canReview={canReview} onClose={() => setActive(null)} onChanged={(m) => { setActive(null); flash(m); load(); onChanged?.(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function LabCoatForm({ api, token, role, onClose, onSaved }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; onClose: () => void; onSaved: () => void }) {
  const isFaculty = role === "FACULTY";
  const { schools, departments } = useOrgLists(token);
  const [f, setF] = useState<Row>({});
  const [sel, setSel] = useState<Record<string, { size: string; qty: number }>>({});
  const [ppe, setPpe] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/api/safety/ppe-options").then((r) => (r.ok ? r.json() : { options: [] })).then((d: { options?: unknown[] }) => {
      setPpe(Array.isArray(d?.options) ? [...new Set(d.options.map(String).filter(Boolean))] : []);
    }).catch(() => {});
  }, [api]);
  const toggle = (name: string) => setSel((s) => { const n = { ...s }; if (n[name]) delete n[name]; else n[name] = { size: "", qty: 1 }; return n; });
  const setRow = (name: string, p: Partial<{ size: string; qty: number }>) => setSel((s) => ({ ...s, [name]: { ...s[name], ...p } }));
  async function save() {
    if (!isFaculty && !f.degree) { setErr("Degree/Level/Year/Semester is required"); return; }
    const items = Object.entries(sel).map(([name, v]) => ({ name, size: v.size || "", qty: Number(v.qty) || 1 }));
    if (!items.length) { setErr("Select at least one PPE item"); return; }
    setBusy(true); setErr("");
    const data = isFaculty ? { school: f.school, department: f.department } : { degree: f.degree, school: f.school, department: f.department };
    const r = await api("/api/portal-requests", { method: "POST", body: JSON.stringify({ kind: "PPE", data, items }) });
    setBusy(false);
    if (r.ok) onSaved(); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Submit failed"); }
  }
  return (
    <Window width="max-w-4xl" tall title="PPE request" subtitle="Pick the PPE you need. The lab team reviews and approves." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Submitting…" : "Submit"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3">
        {!isFaculty && <div><label className="mb-1 block text-xs font-medium text-gray-600">Degree / Level / Year / Semester *</label><input className={inputCls} value={String(f.degree ?? "")} onChange={(e) => setF({ ...f, degree: e.target.value })} placeholder="e.g. Chemical Engineering/Undergraduate/Y1/S1" /></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-gray-600">School</label><select className={inputCls} value={String(f.school ?? "")} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">— select —</option>{schools.map((s) => <option key={s} value={s}>{s}</option>)}{!!f.school && !schools.includes(String(f.school)) && <option value={String(f.school)}>{String(f.school)}</option>}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} value={String(f.department ?? "")} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">— select —</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!!f.department && !departments.includes(String(f.department)) && <option value={String(f.department)}>{String(f.department)}</option>}</select></div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">PPE items *</label>
          {ppe.length === 0 ? <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">No PPE items available yet — ask the lab team to add them in the PPE tab.</p> : (
            <div className="space-y-2">
              {ppe.map((name) => { const on = !!sel[name]; return (
                <div key={name} className={`rounded-lg border p-2 ${on ? "border-[#00C9A7] bg-[#00C9A7]/5" : "border-gray-200"}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex flex-1 items-center gap-2 text-sm font-medium text-[#0A1628]"><input type="checkbox" checked={on} onChange={() => toggle(name)} />{name}</label>
                    {on && <div className="flex items-center gap-1 text-xs text-gray-500">Size<input className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm" value={sel[name].size} onChange={(e) => setRow(name, { size: e.target.value })} placeholder="if any" /></div>}
                    {on && <div className="flex items-center gap-1 text-xs text-gray-500">Qty<input type="number" min={1} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm" value={sel[name].qty} onChange={(e) => setRow(name, { qty: Number(e.target.value) || 1 })} /></div>}
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}

function BorrowingForm({ api, token, role, onClose, onSaved }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; onClose: () => void; onSaved: () => void }) {
  const isFaculty = role === "FACULTY";
  const { schools, departments, supervisors } = useOrgLists(token);
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [facultyName, setFacultyName] = useState(isFaculty ? "Self" : "");
  const [groupName, setGroupName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [items, setItems] = useState<{ name: string; qty: string; notes: string; link: string; picture: string }[]>([{ name: "", qty: "1", notes: "", link: "", picture: "" }]);
  const [busy, setBusy] = useState(false);
  const [upRow, setUpRow] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const setItem = (i: number, k: string, v: string) => setItems((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function uploadPic(i: number, file: File) {
    setUpRow(i); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "requests"); fd.append("id", "borrow");
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    setUpRow(null);
    if (r.ok) { const d = await r.json(); setItem(i, "picture", String(d.url ?? "")); } else setErr("Upload failed — is R2 file storage enabled?");
  }
  async function save() {
    const clean = items.filter((it) => it.name.trim());
    if (!school) { setErr("School is required"); return; }
    if (!clean.length) { setErr("Add at least one item"); return; }
    setBusy(true); setErr("");
    const r = await api("/api/portal-requests", { method: "POST", body: JSON.stringify({ kind: "RESOURCE", data: { school, department, purpose, facultyName, groupName, courseCode }, items: clean.map((it) => ({ name: it.name, qty: Number(it.qty) || 1, notes: it.notes, link: it.link, picture: it.picture })) }) });
    setBusy(false);
    if (r.ok) onSaved(); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Submit failed"); }
  }
  return (
    <Window width="max-w-4xl" tall title="Borrow equipment / materials" subtitle="When you submit, the lab team will see your name and email." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Submitting…" : "Submit"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">School *</label><select className={inputCls} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">— select —</option>{schools.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">— select —</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{department && !departments.includes(department) && <option value={department}>{department}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Borrowing for</label><select className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>{PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Faculty{isFaculty ? " (you can pick Self or another)" : ""}</label><select className={inputCls} value={facultyName} onChange={(e) => setFacultyName(e.target.value)}><option value="">— select faculty —</option>{isFaculty && <option value="Self">Self</option>}{supervisors.map((s) => <option key={s.email} value={supValue(s)}>{s.name}{s.email ? ` (${s.email})` : ""}</option>)}{facultyName && facultyName !== "Self" && !supervisors.some((s) => supValue(s) === facultyName) && <option value={facultyName}>{facultyName}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Course code <span className="font-normal text-gray-400">(optional)</span></label><input className={inputCls} value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="e.g. MECH1001" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Group name <span className="font-normal text-gray-400">(optional)</span></label><input className={inputCls} value={groupName} onChange={(e) => setGroupName(e.target.value)} /></div>
      </div>
      <div className="mb-2 mt-4 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Items to borrow</h3>
        <button type="button" onClick={() => setItems([...items, { name: "", qty: "1", notes: "", link: "", picture: "" }])} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add item</button>
      </div>
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3">
            <div className="grid grid-cols-12 gap-2">
              <input className={`${inputCls} col-span-8`} placeholder="Item name" value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} />
              <input type="number" min={1} className={`${inputCls} col-span-3`} placeholder="Qty" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="col-span-1 rounded text-red-600 hover:bg-red-50">✕</button>
            </div>
            <input className={`${inputCls} mt-2`} placeholder="Notes" value={it.notes} onChange={(e) => setItem(i, "notes", e.target.value)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {it.picture ? (
                <span className="flex items-center gap-2 text-xs"><a href={fileHref(it.picture)} target="_blank" rel="noreferrer" className="font-medium text-[#0a8d75] hover:underline">📎 picture</a><button type="button" onClick={() => setItem(i, "picture", "")} className="text-red-600 hover:underline">remove</button></span>
              ) : (
                <label className="cursor-pointer rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100">{upRow === i ? "Uploading…" : "📎 Attach picture"}<input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadPic(i, file); }} /></label>
              )}
              <input className={`${inputCls} flex-1`} placeholder="…or paste a picture/link" value={it.link} onChange={(e) => setItem(i, "link", e.target.value)} />
            </div>
          </div>
        ))}
      </div>
    </Window>
  );
}

function AccessForm({ api, token, role, onClose, onSaved }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; onClose: () => void; onSaved: () => void }) {
  const isFaculty = role === "FACULTY";
  const { schools, departments, supervisors } = useOrgLists(token);
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState<Row>(isFaculty ? { supervisor: "Self" } : {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/schedule/labs").then((r) => { if (r.ok) r.json().then(setLabs); }).catch(() => {}); }, [api]);
  async function save() {
    if (!f.labName) { setErr("Please choose a laboratory"); return; }
    setBusy(true); setErr("");
    const r = await api("/api/portal-requests", { method: "POST", body: JSON.stringify({ kind: "ACCESS", data: { labName: f.labName, school: f.school, department: f.department, course: f.course, supervisor: f.supervisor, reason: f.reason, fromDate: f.fromDate, toDate: f.toDate } }) });
    setBusy(false);
    if (r.ok) onSaved(); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Submit failed"); }
  }
  return (
    <Window width="max-w-4xl" tall title="Lab access request" subtitle="When you submit, the lab team will see your name and email." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Submitting…" : "Submit"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Laboratory *</label><select className={inputCls} value={String(f.labName ?? "")} onChange={(e) => setF({ ...f, labName: e.target.value })}><option value="">— choose a lab —</option>{labs.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">School</label><select className={inputCls} value={String(f.school ?? "")} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">— select —</option>{schools.map((s) => <option key={s} value={s}>{s}</option>)}{!!f.school && !schools.includes(String(f.school)) && <option value={String(f.school)}>{String(f.school)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} value={String(f.department ?? "")} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">— select —</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!!f.department && !departments.includes(String(f.department)) && <option value={String(f.department)}>{String(f.department)}</option>}</select></div>
        {!isFaculty && <div><label className="mb-1 block text-xs font-medium text-gray-600">Course</label><input className={inputCls} value={String(f.course ?? "")} onChange={(e) => setF({ ...f, course: e.target.value })} placeholder="Course name or code" /></div>}
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Faculty / supervisor{isFaculty ? " (Self or another)" : ""}</label><select className={inputCls} value={String(f.supervisor ?? "")} onChange={(e) => setF({ ...f, supervisor: e.target.value })}><option value="">— select supervisor —</option>{isFaculty && <option value="Self">Self</option>}{supervisors.map((s) => <option key={s.email} value={supValue(s)}>{s.name}{s.email ? ` (${s.email})` : ""}</option>)}{!!f.supervisor && f.supervisor !== "Self" && !supervisors.some((s) => supValue(s) === f.supervisor) && <option value={String(f.supervisor)}>{String(f.supervisor)}</option>}</select></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Reason</label><textarea rows={2} className={inputCls} value={String(f.reason ?? "")} onChange={(e) => { setF({ ...f, reason: e.target.value }); const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }} placeholder="Why you need access — the box grows as you type" style={{ minHeight: "2.5rem", overflow: "hidden", resize: "none" }} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">From</label><input type="date" className={inputCls} value={String(f.fromDate ?? "")} onChange={(e) => setF({ ...f, fromDate: e.target.value })} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">To</label><input type="date" className={inputCls} value={String(f.toDate ?? "")} onChange={(e) => setF({ ...f, toDate: e.target.value })} /></div>
      </div>
    </Window>
  );
}

function PortalDetail({ record, variant, api, token, canReview, onClose, onChanged }: {
  record: Row; variant: Variant; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; canReview: boolean; onClose: () => void; onChanged: (m: string) => void;
}) {
  const data = parseJson<Record<string, unknown>>(record.data, {});
  const items = parseJson<{ name?: string; qty?: number; size?: string; notes?: string; link?: string; picture?: string }[]>(record.items, []);
  const st = PR_STATUS[String(record.status ?? "pending")] ?? PR_STATUS.pending;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [check, setCheck] = useState<{ name: string; qty: number; inInventory: boolean; available: number | null; ok: boolean }[] | null>(null);
  async function act(p: string, m: string) {
    setBusy(true); setErr("");
    try {
      const r = await api(`/api/portal-requests/${String(record.id)}/${p}`, { method: "POST" });
      if (r.ok) onChanged(m); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Action failed"); }
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }
  async function runCheck() {
    setErr("");
    const r = await api(`/api/portal-requests/${String(record.id)}/check`);
    if (r.ok) { const d = await r.json(); setCheck(d.items ?? []); } else setErr("Check failed");
  }
  async function del() {
    if (!confirm("Remove this request from your list?")) return;
    setBusy(true); setErr("");
    try {
      const r = await api(`/api/portal-requests/${String(record.id)}`, { method: "DELETE" });
      if (r.ok) onChanged("Removed"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Delete failed"); }
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }
  return (
    <Window width="max-w-4xl" tall title={variant === "labcoat" ? "PPE request" : "Borrowing request"} subtitle={`${String(record.submitterName ?? "")} · ${String(record.submitterEmail ?? "")}`} onClose={onClose}
      footer={<>
        {canReview && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {canReview && variant === "borrowing" && String(record.status) === "approved" && <Button onClick={() => { if (confirm("Push this request to an issuance?")) act("convert", "Pushed to issuance"); }} disabled={busy}>Push to issuance</Button>}
        {canReview && String(record.status) === "pending" && <Button onClick={() => { if (confirm("Approve this request?")) act("approve", "Approved"); }} disabled={busy}>Approve</Button>}
        {canReview && String(record.status) === "pending" && <Button variant="danger" onClick={() => { if (confirm("Reject this request?")) act("reject", "Rejected"); }} disabled={busy}>Reject</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="mb-3 flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.c}`}>{st.l}</span>{record.createdAt ? <span className="text-xs text-gray-400">Submitted {fmtWhen(record.createdAt)}</span> : null}</div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="min-w-0"><span className="text-xs font-medium text-gray-400">{prettyKey(k)}</span><p className="whitespace-pre-wrap break-words text-gray-800">{String(v)}</p></div>
        ))}
      </div>

      {variant === "labcoat" && items.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-[#0A1628]">PPE items</h3>
          <div className="overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="px-2 py-1">Item</th><th className="px-2 py-1">Size</th><th className="px-2 py-1">Qty</th></tr></thead>
              <tbody>{items.map((it, i) => (<tr key={i} className="border-t border-gray-100"><td className="px-2 py-1 font-medium text-[#0A1628]">{String(it.name ?? "")}</td><td className="px-2 py-1">{it.size ? String(it.size) : "—"}</td><td className="px-2 py-1">{String(it.qty ?? "")}</td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {variant === "borrowing" && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-1">
            <h3 className="text-sm font-semibold text-[#0A1628]">Items requested</h3>
            {canReview && <button type="button" onClick={runCheck} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">Check inventory</button>}
          </div>
          <div className="overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="px-2 py-1">Item</th><th className="px-2 py-1">Qty</th><th className="px-2 py-1">Notes</th><th className="px-2 py-1">Picture</th><th className="px-2 py-1">Link</th>{check && <th className="px-2 py-1">In stock</th>}</tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const ch = check?.[i];
                  return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1 font-medium text-[#0A1628]">{String(it.name ?? "")}</td>
                      <td className="px-2 py-1">{String(it.qty ?? "")}</td>
                      <td className="px-2 py-1 text-gray-500">{String(it.notes ?? "")}</td>
                      <td className="px-2 py-1">{it.picture ? <a href={fileHref(String(it.picture))} target="_blank" rel="noreferrer" className="text-[#0a8d75] hover:underline">view ↗</a> : "—"}</td>
                      <td className="px-2 py-1">{it.link ? <a href={String(it.link)} target="_blank" rel="noreferrer" className="text-[#0a8d75] hover:underline">open ↗</a> : "—"}</td>
                      {check && <td className="px-2 py-1">{ch ? (ch.inInventory ? <span className={ch.ok ? "text-[#0a8d75]" : "text-red-600"}>{ch.available} avail{ch.ok ? " ✓" : " ⚠"}</span> : <span className="text-gray-400">not in inventory</span>) : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canReview && <p className="mt-2 text-xs text-gray-400">“Push to issuance” creates an issuance with these items (matched to inventory by name).</p>}
        </div>
      )}

      <Thread api={api} token={token} refType="PORTAL" refId={String(record.id)} />
    </Window>
  );
}

// ───────────────────────── RA Submissions ─────────────────────────
const RA_STATUS: Record<string, { l: string; c: string }> = {
  submitted: { l: "Submitted", c: "bg-amber-100 text-amber-800" },
  revise: { l: "Revision requested", c: "bg-orange-100 text-orange-700" },
  hold: { l: "On hold", c: "bg-orange-100 text-orange-700" },
  rejected: { l: "Rejected", c: "bg-red-100 text-red-700" },
  approved: { l: "Approved", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
};
const fileHref = (u: string) => (u && u.startsWith("/") ? `${API_URL}${u}` : u);
const roleWord = (r: string) => (r ? r.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ") : "");

// Two-way communication thread; attach one or more files per message — each is a clickable link.
function Thread({ api, token, refType, refId }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; refType: string; refId: string }) {
  const [msgs, setMsgs] = useState<Row[]>([]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ label: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const load = useCallback(async () => { const r = await api(`/api/comments?refType=${refType}&refId=${refId}`); if (r.ok) setMsgs(await r.json()); }, [api, refType, refId]);
  useEffect(() => { load(); }, [load]);
  async function upload(file: File) {
    setUpBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "requests"); fd.append("id", "msg");
      const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) { const d = await r.json(); setFiles((p) => [...p, { label: file.name, url: String(d.url ?? "") }]); }
    } finally { setUpBusy(false); }
  }
  async function send() {
    if (!body.trim() && files.length === 0) return;
    setBusy(true);
    try {
      const r = await api("/api/comments", { method: "POST", body: JSON.stringify({ refType, refId, body, attachments: files, fileUrl: files[0]?.url ?? null }) });
      if (r.ok) { setBody(""); setFiles([]); load(); }
    } finally { setBusy(false); }
  }
  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <h3 className="mb-2 text-sm font-semibold text-[#0A1628]">Communication</h3>
      <div className="mb-3 max-h-60 space-y-2 overflow-auto">
        {msgs.length === 0 ? <p className="text-xs text-gray-400">No messages yet — start the conversation below.</p> : msgs.map((m) => {
          const atts = parseDocs(m.attachments, m.fileUrl);
          return (
            <div key={String(m.id)} className="rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-xs font-semibold text-[#0A1628]">{String(m.authorName ?? "User")}{m.authorRole ? ` · ${roleWord(String(m.authorRole))}` : ""}</span>
              {m.body ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{String(m.body)}</p> : null}
              {atts.length > 0 && <div className="mt-1 flex flex-col gap-0.5">{atts.map((a, i) => (
                <a key={i} href={fileHref(a.url)} target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-[#0a8d75] hover:underline">📎 {a.label && a.label !== "Attachment" ? a.label : decodeURIComponent(a.url.split("/").pop() || "file")}</a>
              ))}</div>}
            </div>
          );
        })}
      </div>
      {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((f, i) => (
        <span key={i} className="flex items-center gap-1 rounded bg-[#00C9A7]/10 px-2 py-1 text-xs text-[#0a8d75]">📎 {f.label}<button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-red-600">✕</button></span>
      ))}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} flex-1`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" onKeyDown={(e) => { if (e.key === "Enter" && (body.trim() || files.length)) send(); }} />
        <label className="cursor-pointer rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100">{upBusy ? "…" : "📎 Attach"}<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></label>
        <Button onClick={send} disabled={busy || upBusy}>Send</Button>
      </div>
    </div>
  );
}

function RaSubmissions({ api, token, role, openId, clearOpen, markSeen, isUnread, onChanged }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; openId?: string; clearOpen?: () => void; markSeen: (r: Row) => void; isUnread?: (r: Row) => boolean; onChanged?: () => void }) {
  const canReview = LAB_TEAM.includes(role);
  const [subs, setSubs] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [submit, setSubmit] = useState(false);
  const [active, setActive] = useState<Row | null>(null);
  const [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/safety/ra");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    if (r.ok) { const list = await r.json(); setSubs(Array.isArray(list) ? list : []); }
    const d = await api("/api/safety/documents");
    if (d.ok) { const all: Row[] = await d.json(); setTemplates(all.filter((x) => String(x.type) === "TEMPLATE")); }
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const open = useCallback((r: Row) => { markSeen(r); setActive(r); }, [markSeen]);
  useEffect(() => { if (!openId) return; const row = subs.find((s) => String(s.id) === openId); if (row) { markSeen(row); setActive(row); clearOpen?.(); } }, [openId, subs, clearOpen, markSeen]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }
  const [upBusy, setUpBusy] = useState(false);
  async function uploadTemplate(file: File) {
    setUpBusy(true);
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "safety"); fd.append("id", "ra-template");
    const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (r.ok) { const d = await r.json(); await api("/api/safety/documents", { method: "POST", body: JSON.stringify({ title: file.name, type: "TEMPLATE", fileUrl: String(d.url ?? "") }) }); flash("Template added"); load(); }
    setUpBusy(false);
  }
  async function delTemplate(id: string) { if (!confirm("Remove this template?")) return; const r = await api(`/api/safety/documents/${id}`, { method: "DELETE" }); if (r.ok) { flash("Removed"); load(); } }
  const [subTab, setSubTab] = useState<"mine" | "supervising">("mine");
  const supervised = subs.filter((s) => s.relation === "supervisor");
  const owned = subs.filter((s) => s.relation !== "supervisor");
  const displayed = subTab === "supervising" ? supervised : owned;
  const mineLabel = canReview ? "All submissions" : "My submissions";
  const SubTabBtn = ({ id, label, n }: { id: "mine" | "supervising"; label: string; n: number }) => (
    <button onClick={() => setSubTab(id)} className={`select-none rounded-lg px-4 py-2 text-sm font-medium transition ${subTab === id ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
      {label}{n > 0 ? <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${subTab === id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"}`}>{n}</span> : null}
    </button>
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{canReview ? "Review submitted risk assessments. Keep the blank RA template below — students download the same file." : "Download the RA form, fill it for your project, then submit it here for review."}</p>
        {!canReview && <Button onClick={() => setSubmit(true)}>+ Submit RA</Button>}
      </div>

      {canReview && (
      <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0A1628]">RA templates <span className="font-normal text-gray-400">(students download these)</span></h3>
          <label className="cursor-pointer rounded-md bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-[#00C9A7] hover:brightness-110">{upBusy ? "Uploading…" : "+ Add template"}<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadTemplate(file); e.target.value = ""; }} /></label>
        </div>
        {templates.length === 0 ? <p className="text-xs text-gray-400">No template yet. Upload the blank RA form here — students will see it to download.</p> : (
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <span key={String(t.id)} className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs">
                <a href={fileHref(String(t.fileUrl))} target="_blank" rel="noreferrer" className="font-medium text-[#0a8d75] hover:underline">⬇ {String(t.title)}</a>
                <button type="button" onClick={() => delTemplate(String(t.id))} className="text-red-600 hover:underline">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {!canReview && (
      <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-[#0A1628]">Blank forms to download</h3>
        {templates.length === 0 ? <p className="text-xs text-gray-400">No blank forms uploaded yet — ask the lab team to add an RA template in the Document Hub.</p> : (
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <a key={String(t.id)} href={fileHref(String(t.fileUrl))} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-[#0a8d75] hover:bg-gray-100">⬇ {String(t.title)}</a>
            ))}
          </div>
        )}
      </div>
      )}

      {loading ? <p className="text-gray-400">Loading…</p>
        : subs.length === 0 ? <p className="text-gray-400">{canReview ? "No RA submissions yet." : "You haven’t submitted any RAs yet. Use “+ Submit RA”."}</p> : (() => {
          const card = (s: Row) => {
            const st = RA_STATUS[String(s.status ?? "submitted")] ?? RA_STATUS.submitted;
            return (
              <button key={String(s.id)} onClick={() => open(s)} className={`relative flex w-full select-none flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${tileGlow(isUnread?.(s))}`}>
                {isUnread?.(s) && <NewDot />}
                <div className="h-2 w-full shrink-0" style={{ background: "#00C9A7" }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628]">{String(s.title)}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${st.c}`}>{st.l}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{[String(s.project ?? ""), String(s.submittedByName ?? ""), s.supervisor ? `Supervisor: ${String(s.supervisor)}` : ""].filter(Boolean).join(" · ") || "—"}</p>
                  {s.createdAt ? <p className="mt-0.5 text-[11px] text-gray-400">Submitted {fmtWhen(s.createdAt)}</p> : null}
                  <p className="mt-2 text-xs font-semibold text-gray-400">Open ›</p>
                </div>
              </button>
            );
          };
          return (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
                <SubTabBtn id="mine" label={mineLabel} n={owned.length} />
                {supervised.length > 0 && <SubTabBtn id="supervising" label="Supervising" n={supervised.length} />}
              </div>
              {displayed.length === 0
                ? <p className="text-gray-400">{subTab === "supervising" ? "Not supervising any submissions." : "None."}</p>
                : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{displayed.map(card)}</div>}
            </>
          );
        })()}

      {submit && <RaSubmitForm api={api} token={token} role={role} onClose={() => setSubmit(false)} onSaved={() => { setSubmit(false); flash("RA submitted"); load(); onChanged?.(); }} />}
      {active && <RaDetail record={active} api={api} token={token} role={role} onClose={() => setActive(null)} onChanged={(m) => { setActive(null); flash(m); load(); onChanged?.(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function RaDetail({ record, api, token, role, onClose, onChanged }: { record: Row; api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; onClose: () => void; onChanged: (m: string) => void }) {
  const canReview = LAB_TEAM.includes(role);
  const st = RA_STATUS[String(record.status ?? "submitted")] ?? RA_STATUS.submitted;
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  async function decide(decision: string) {
    if (["hold", "reject"].includes(decision) && !note.trim()) { setErr("Please add a comment explaining the reason."); return; }
    const ask = decision === "approve" ? "Approve this risk assessment?" : decision === "reject" ? "Reject this risk assessment?" : "Put this risk assessment on hold?";
    if (!confirm(ask)) return;
    setBusy(true); setErr("");
    try {
      if (note.trim()) await api("/api/comments", { method: "POST", body: JSON.stringify({ refType: "RA", refId: String(record.id), body: note.trim() }) });
      const r = await api(`/api/safety/ra/${String(record.id)}/${decision}`, { method: "POST" });
      if (r.ok) onChanged(decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "On hold");
      else setErr("Action failed");
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm("Remove this RA submission from your list?")) return;
    setBusy(true);
    try {
      const r = await api(`/api/safety/ra/${String(record.id)}`, { method: "DELETE" });
      if (r.ok) onChanged("Removed");
    } finally { setBusy(false); }
  }
  const info: [string, unknown][] = [["Project", record.project], ["Supervisor", record.supervisor], ["School", record.school], ["Department", record.department], ["Equipment", record.equipment], ["Submitted by", record.submittedByName]];
  const needsRevision = String(record.status) === "revise" || String(record.status) === "hold";
  return (
    <Window width="max-w-4xl" tall title={String(record.title ?? "Risk Assessment")} subtitle="Risk assessment" onClose={onClose}
      footer={<>
        {canReview && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="mb-3 flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.c}`}>{st.l}</span>{record.createdAt ? <span className="text-xs text-gray-400">Submitted {fmtWhen(record.createdAt)}</span> : null}</div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {info.filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="text-xs font-medium text-gray-400">{k}</span><p className="text-gray-800">{String(v)}</p></div>)}
      </div>
      <div className="mt-3"><a href={fileHref(String(record.fileUrl))} target="_blank" rel="noreferrer" className="text-sm font-medium text-[#0a8d75] hover:underline">Open current RA file ↗</a></div>
      {!canReview && needsRevision && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">Upload your revised RA in the conversation below — your previous file stays as history and review re-opens.</p>}

      {canReview && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</p>
            {!acting && <Button onClick={() => setActing(true)} disabled={busy}>Review</Button>}
          </div>
          {acting && (
            <>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment to the submitter (required for Hold / Reject)" className={`${inputCls} mb-2`} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => decide("approve")} disabled={busy}>Approve</Button>
                <Button variant="ghost" onClick={() => decide("hold")} disabled={busy}>Hold</Button>
                <Button variant="danger" onClick={() => decide("reject")} disabled={busy}>Reject</Button>
              </div>
            </>
          )}
        </div>
      )}

      <Thread api={api} token={token} refType="RA" refId={String(record.id)} />
    </Window>
  );
}

function RaSubmitForm({ api, token, role, onClose, onSaved }: { api: (p: string, i?: RequestInit) => Promise<Response>; token: string; role: string; onClose: () => void; onSaved: () => void }) {
  const isFaculty = role === "FACULTY";
  const { schools, departments, supervisors } = useOrgLists(token);
  const [f, setF] = useState<Row>({});
  const [uploaded, setUploaded] = useState("");
  const [linkVal, setLinkVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  async function upload(file: File) {
    setUploading(true); setErr("");
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "safety"); fd.append("id", "ra");
      const r = await retryFetch(`${API_URL}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (r.ok) { const d = await r.json(); setUploaded(String(d.url ?? "")); } else setErr("Upload failed — is R2 file storage enabled?");
    } catch { setErr("Upload failed — please try again."); } finally { setUploading(false); }
  }
  async function save() {
    const fileUrl = uploaded || linkVal.trim();
    if (!f.title || !fileUrl) { setErr("Title and a filled RA file (or link) are required"); return; }
    setBusy(true); setErr("");
    try {
      const r = await api("/api/safety/ra", { method: "POST", body: JSON.stringify({ ...f, fileUrl }) });
      if (r.ok) onSaved(); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Submit failed"); }
    } catch { setErr("Network error — please try again."); } finally { setBusy(false); }
  }
  return (
    <Window width="max-w-4xl" tall title="Submit Risk Assessment" subtitle="Upload your completed RA for review" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || uploading}>{busy ? "Submitting…" : "Submit"}</Button></>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Title *</label><input className={inputCls} value={String(f.title ?? "")} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. RA — Drone frame build" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Project / activity</label><input className={inputCls} value={String(f.project ?? "")} onChange={(e) => setF({ ...f, project: e.target.value })} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Supervisor{isFaculty ? " (Self or another)" : ""}</label><select className={inputCls} value={String(f.supervisor ?? "")} onChange={(e) => setF({ ...f, supervisor: e.target.value })}><option value="">— select supervisor —</option>{isFaculty && <option value="Self">Self</option>}{supervisors.map((s) => <option key={s.email} value={supValue(s)}>{s.name}{s.email ? ` (${s.email})` : ""}</option>)}{!!f.supervisor && f.supervisor !== "Self" && !supervisors.some((s) => supValue(s) === f.supervisor) && <option value={String(f.supervisor)}>{String(f.supervisor)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">School</label><select className={inputCls} value={String(f.school ?? "")} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">— select —</option>{schools.map((s) => <option key={s} value={s}>{s}</option>)}{!!f.school && !schools.includes(String(f.school)) && <option value={String(f.school)}>{String(f.school)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} value={String(f.department ?? "")} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">— select —</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!!f.department && !departments.includes(String(f.department)) && <option value={String(f.department)}>{String(f.department)}</option>}</select></div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Equipment / process</label><input className={inputCls} value={String(f.equipment ?? "")} onChange={(e) => setF({ ...f, equipment: e.target.value })} /></div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Upload filled RA</label>
          {uploaded ? (
            <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"><a href={fileHref(uploaded)} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-[#0a8d75] hover:underline">⬇ {decodeURIComponent(uploaded.split("/").pop() || "file")}</a><button type="button" onClick={() => setUploaded("")} className="text-xs text-red-600 hover:underline">remove</button></div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">{uploading ? "Uploading…" : "📎 Attach file"}<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); }} /></label>
          )}
        </div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Or paste a link</label><input className={inputCls} value={linkVal} onChange={(e) => setLinkVal(e.target.value)} placeholder="https://…" /></div>
      </div>
    </Window>
  );
}

// ───────────────────────── Planner ─────────────────────────
function Planner({ api, role }: { api: (p: string, i?: RequestInit) => Promise<Response>; role: string }) {
  const canProcess = LAB_TEAM.includes(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/requests");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    if (r.ok) setRows(await r.json());
    setLoading(false);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  async function advance(id: string, toStatus: string, label: string) {
    const r = await api(`/api/requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: toStatus }) });
    if (r.ok) { flash(label); load(); } else flash("Failed");
  }

  async function exportExcel() {
    const inRange = rows.filter((r) => {
      const d = String(r.createdAt ?? "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Job requests");
    ws.columns = [
      { header: "Created", key: "created", width: 12 }, { header: "Title", key: "title", width: 28 },
      { header: "Type", key: "type", width: 18 }, { header: "Requester", key: "req", width: 22 },
      { header: "Status", key: "status", width: 16 }, { header: "Preferred date", key: "pref", width: 14 },
      { header: "Supervisor", key: "sup", width: 24 }, { header: "Course", key: "course", width: 16 },
      { header: "School", key: "school", width: 18 }, { header: "Department", key: "dept", width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    inRange.forEach((r) => ws.addRow({
      created: String(r.createdAt ?? "").slice(0, 10), title: String(r.title ?? ""), type: jobTypeLabel(String(r.type ?? "")),
      req: (r.user as { name?: string })?.name ?? "", status: statusBadge(String(r.status)).l, pref: String(r.preferredDate ?? "").slice(0, 10),
      sup: String(r.supervisor ?? ""), course: String(r.course ?? ""), school: String(r.school ?? ""), dept: String(r.department ?? ""),
    }));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `job-requests_${from || "all"}_to_${to || "all"}.xlsx`; a.click();
    URL.revokeObjectURL(url);
    flash(`Exported ${inRange.length} job(s)`);
  }

  const COLS: { key: string; label: string; dot: string; col: string; border: string; head: string; text: string }[] = [
    { key: "APPROVED", label: "Not started", dot: "#f59e0b", col: "bg-amber-50", border: "border-amber-200", head: "bg-amber-100", text: "text-amber-800" },
    { key: "IN_PROGRESS", label: "In progress", dot: "#3b82f6", col: "bg-blue-50", border: "border-blue-200", head: "bg-blue-100", text: "text-blue-800" },
    { key: "COMPLETED", label: "Finished", dot: "#10b981", col: "bg-emerald-50", border: "border-emerald-200", head: "bg-emerald-100", text: "text-emerald-800" },
  ];

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">Every approved request lands here. Move cards Not started → In progress → Finished; the requester is notified.</p>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
        <div><label className="block text-xs text-gray-500">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700" /></div>
        <div><label className="block text-xs text-gray-500">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700" /></div>
        <Button variant="ghost" onClick={exportExcel}>⬇ Export Excel</Button>
        <span className="text-xs text-gray-400">Exports all job requests created in the range (leave dates blank for all).</span>
      </div>
      {loading ? <p className="text-gray-400">Loading…</p> : (
        <div className="grid gap-5 md:grid-cols-3">
          {COLS.map((col) => {
            const real = rows.filter((r) => String(r.status) === col.key);
            return (
              <div key={col.key} className={`rounded-xl border ${col.col} ${col.border} p-3`}>
                <div className={`mb-3 flex items-center gap-2 rounded-lg ${col.head} px-3 py-2`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.dot }} />
                  <h3 className={`text-sm font-semibold ${col.text}`}>{col.label}</h3>
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600">{real.length}</span>
                </div>
                <div className="space-y-3">
                  {real.map((r) => (
                    <div key={String(r.id)} className="select-none rounded-lg bg-white p-4 shadow-sm ring-1 ring-black/5">
                      <h4 className="text-sm font-semibold text-[#0A1628]">{String(r.title)}</h4>
                      <p className="mt-1 text-xs text-gray-500">{[jobTypeLabel(String(r.type)), (r.user as { name?: string })?.name].filter(Boolean).join(" · ")}</p>
                      {canProcess && col.key === "APPROVED" && <button onClick={() => advance(String(r.id), "IN_PROGRESS", "Started")} className="mt-3 rounded bg-[#00C9A7] px-3 py-1 text-xs font-semibold text-[#0A1628]">Start →</button>}
                      {canProcess && col.key === "IN_PROGRESS" && <button onClick={() => advance(String(r.id), "COMPLETED", "Finished")} className="mt-3 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Finish →</button>}
                    </div>
                  ))}
                  {real.length === 0 && <p className="px-1 py-4 text-center text-xs text-gray-400">Nothing here.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}
