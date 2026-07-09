"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { visibleSections, visibleAccount } from "@/lib/nav";
import { retryFetch } from "@/lib/fetch-retry";
import { AssistantWidget } from "@/components/assistant-widget";
import { IdleLogout } from "@/components/idle-logout";
import { API_URL } from "@/lib/api-url";

const STAFF_ROLES = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN", "DEAN", "HEAD_OF_SCHOOL"];
const JOB_STATUS_WORD: Record<string, string> = { APPROVED: "approved", HOLD: "on hold", REJECTED: "rejected", IN_PROGRESS: "in progress", COMPLETED: "completed" };
const kindWord = (k?: string) => (k === "PPE" ? "lab coat" : k === "RESOURCE" ? "borrowing" : k === "ACCESS" ? "lab access" : "request");
const portalTab = (k?: string) => (k === "PPE" ? "ppe" : k === "ACCESS" ? "access" : "resource");
const refTab = (refType?: string, kind?: string) => (refType === "JOB" ? "jobs" : refType === "RA" ? "ra" : portalTab(kind));
type Notif = { id: string; title: string; sub: string; href: string };
type JobRow = { id: string; title?: string; status?: string; user?: { name?: string }; approvals?: { comments?: string }[] };
type PortalRow = { id: string; kind?: string; status?: string; submitterName?: string };
type RaRow = { id: string; title?: string; status?: string; submittedByName?: string };
type CommentRow = { id: string; authorName?: string; body?: string; fileUrl?: string; refType?: string; refId?: string; kind?: string };
type ActRow = { id: string; title?: string; supervisor?: string };
type ProcRow = { id: string; title?: string; status?: string; kind?: string; approverEmail?: string; decisionNote?: string };
const LAB_TEAM_F = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"];
const lastComment = (r: JobRow) => (r.approvals ?? []).filter((a) => a.comments).slice(-1)[0]?.comments ?? "";
function buildAll(jobs: JobRow[], portal: PortalRow[], ra: RaRow[], activities: ActRow[], comments: CommentRow[], proc: ProcRow[], role: string, email: string): Notif[] {
  const staff = STAFF_ROLES.includes(role);
  const out: Notif[] = [];
  // Procurement approvals — both sides.
  proc.filter((p) => String(p.kind ?? "PURCHASE") !== "BUDGET").forEach((p) => {
    const routedToMe = !!p.approverEmail && p.approverEmail.toLowerCase() === String(email ?? "").toLowerCase();
    if (routedToMe && String(p.status) === "submitted") out.push({ id: `pr-ap-${p.id}`, title: `Approval needed: ${p.title ?? ""}`, sub: "Submitted for your decision", href: "/approvals" });
    if (LAB_TEAM_F.includes(role) && ["approved", "rejected", "on_hold"].includes(String(p.status))) out.push({ id: `pr-de-${p.id}-${p.status}`, title: `Request “${p.title ?? ""}” ${String(p.status).replace("_", " ")}`, sub: String(p.decisionNote ?? ""), href: "/procurement" });
  });
  if (staff) {
    jobs.filter((r) => r.status === "PENDING").forEach((r) => out.push({ id: `j-${r.id}-pending`, title: `New job request: ${r.title ?? ""}`, sub: r.user?.name ?? "", href: `/requests?tab=jobs&open=${r.id}` }));
    portal.filter((r) => r.status === "pending").forEach((r) => out.push({ id: `p-${r.id}-pending`, title: `New ${kindWord(r.kind)} request`, sub: r.submitterName ?? "", href: `/requests?tab=${portalTab(r.kind)}&open=${r.id}` }));
    ra.filter((r) => r.status === "submitted").forEach((r) => out.push({ id: `ra-${r.id}-sub`, title: `RA submitted: ${r.title ?? ""}`, sub: r.submittedByName ?? "", href: `/requests?tab=ra&open=${r.id}` }));
  } else {
    jobs.filter((r) => r.status && JOB_STATUS_WORD[r.status]).forEach((r) => out.push({ id: `j-${r.id}-${r.status}`, title: `Your job request “${r.title ?? ""}” is ${JOB_STATUS_WORD[r.status as string]}`, sub: String(lastComment(r)), href: `/requests?tab=jobs&open=${r.id}` }));
    portal.filter((r) => r.status && r.status !== "pending").forEach((r) => out.push({ id: `p-${r.id}-${r.status}`, title: `Your ${kindWord(r.kind)} request is ${r.status}`, sub: "", href: `/requests?tab=${portalTab(r.kind)}&open=${r.id}` }));
    ra.filter((r) => r.status && r.status !== "submitted").forEach((r) => out.push({ id: `ra-${r.id}-${r.status}`, title: `Your RA “${r.title ?? ""}” is ${r.status}`, sub: "", href: `/requests?tab=ra&open=${r.id}` }));
  }
  if (!LAB_TEAM_F.includes(role)) {
    activities.forEach((a) => out.push({ id: `a-${a.id}`, title: `Activity: ${a.title ?? ""}`, sub: a.supervisor ? `Supervisor: ${a.supervisor}` : "Assigned to you", href: "/activities" }));
  }
  comments.forEach((m) => out.push({ id: `c-${m.id}`, title: `New message from ${m.authorName ?? "someone"}`, sub: String(m.body ?? (m.fileUrl ? "Sent a file" : "")), href: m.refId ? `/requests?tab=${refTab(m.refType, m.kind)}&open=${m.refId}` : "/requests" }));
  return out;
}

const roleLabel = (r?: string) => (r ? r.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ") : "");
const planLabel = (p?: string) => (p ? `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()} plan` : "");

// Short in-app chime for new notifications (Web Audio — no asset needed).
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.33);
    o.onended = () => ctx.close();
  } catch { /* audio not available */ }
}

export function AppShell({
  user,
  token,
  children,
}: {
  user: { name?: string | null; email?: string | null; role?: string; plan?: string; superAdmin?: boolean };
  token: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isApprover, setIsApprover] = useState(false);
  const sections = visibleSections(user.role, isApprover);
  const account = visibleAccount(user.role);
  // Groups start collapsed on login (Dashboard + group headings only, like a tidy menu).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.filter((s) => s.heading).map((s) => [s.heading as string, true])));
  const [menu, setMenu] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [bell, setBell] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const prevUnreadRef = useRef(0);
  const initRef = useRef(false);

  // Fresh approver flag (ticked in Users) — controls the Approvals menu without needing a re-login.
  useEffect(() => {
    if (!token) return;
    retryFetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setIsApprover(!!d.isApprover); }).catch(() => {});
  }, [token]);

  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem("labops.notif.seen") ?? "[]")); } catch {}
    try { setDismissed(JSON.parse(localStorage.getItem("labops.notif.dismissed") ?? "[]")); } catch {}
    try { setSoundOn(localStorage.getItem("labsynch.notif.sound") === "1"); } catch {}
    if (!token) return;
    // AbortController so switching accounts (token changes) cancels in-flight
    // requests carrying the OLD token — prevents stale-token "fetch error" noise.
    const ctrl = new AbortController();
    const opt = { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal };
    // Load notifications ONE AT A TIME instead of a 6-wide parallel burst. Firing six
    // DB-querying requests at once — on top of each page's own data — overwhelms the Worker
    // (Prisma spins up per request) and it starts returning 504s. These are background alerts,
    // so fetching them sequentially (slightly slower) keeps peak concurrency low and stable.
    const one = async (path: string): Promise<unknown> => {
      try { const r = await retryFetch(`${API_URL}${path}`, opt); return r.ok ? await r.json() : []; }
      catch { return []; }
    };
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const load = async () => {
      const jobs = await one("/api/requests");
      const portal = await one("/api/portal-requests");
      const ra = await one("/api/safety/ra");
      const acts = await one("/api/activities");
      const cmts = await one("/api/comments/feed");
      const proc = await one("/api/procurement");
      setNotifs(buildAll(arr(jobs), arr(portal), arr(ra), arr(acts), arr(cmts), arr(proc), user.role ?? "", user.email ?? ""));
    };
    load();
    const iv = setInterval(load, 30000); // poll so new alerts (and the sound) arrive without a manual refresh
    const onWake = () => { if (!document.hidden) load(); }; // refresh when returning to the tab
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => { clearInterval(iv); ctrl.abort(); window.removeEventListener("focus", onWake); document.removeEventListener("visibilitychange", onWake); };
  }, [token, user.role, user.email]);
  const visible = notifs.filter((n) => !dismissed.includes(n.id));
  const unread = visible.filter((n) => !seen.includes(n.id)).length;
  // Chime when the unread count goes up (skips the first load so it doesn't ring on every page open).
  useEffect(() => {
    if (!initRef.current) { initRef.current = true; prevUnreadRef.current = unread; return; }
    if (soundOn && unread > prevUnreadRef.current) playChime();
    prevUnreadRef.current = unread;
  }, [unread, soundOn]);
  function toggleBell() {
    setBell((o) => {
      const next = !o;
      if (next && notifs.length) { const ids = notifs.map((n) => n.id); setSeen(ids); try { localStorage.setItem("labops.notif.seen", JSON.stringify(ids)); } catch {} }
      return next;
    });
  }
  function clearNotifs() {
    const ids = notifs.map((n) => n.id);
    setDismissed(ids); setSeen(ids);
    try { localStorage.setItem("labops.notif.dismissed", JSON.stringify(ids)); localStorage.setItem("labops.notif.seen", JSON.stringify(ids)); } catch {}
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const linkCls = (href: string) =>
    `block rounded-lg px-3 py-2 text-sm transition ${isActive(href) ? "bg-[#00C9A7] font-semibold text-[#0A1628]" : "text-gray-300 hover:bg-white/10 hover:text-white"}`;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {navOpen && <div onClick={() => setNavOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />}
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-[#0A1628] text-gray-300 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-5 text-xl font-bold text-white"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#00C9A7]" /><span>Lab<span className="text-[#00C9A7]">Synch</span></span></span><button onClick={() => setNavOpen(false)} className="text-gray-400 hover:text-white lg:hidden" aria-label="Close menu">✕</button></div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {user.superAdmin && <Link href="/platform" onClick={() => setNavOpen(false)} className={linkCls("/platform")}><span className="flex items-center gap-2">🏢 Platform</span></Link>}
          {sections.map((s, i) => {
            if (!s.heading) {
              return <Fragment key={`s${i}`}>{s.items.map((it) => <Link key={it.href} href={it.href} onClick={() => setNavOpen(false)} className={linkCls(it.href)}><span className="flex items-center justify-between">{it.label}{it.href === "/requests" && unread > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}</span></Link>)}</Fragment>;
            }
            const open = collapsed[s.heading] !== true;
            return (
              <div key={s.heading} className="pt-1">
                <button onClick={() => setCollapsed((p) => ({ ...p, [s.heading!]: open }))}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-white">
                  <span>{s.heading}</span><span className="text-base leading-none">{open ? "−" : "+"}</span>
                </button>
                {open && <div className="mt-0.5 space-y-1">{s.items.map((it) => <Link key={it.href} href={it.href} onClick={() => setNavOpen(false)} className={linkCls(it.href)}><span className="flex items-center justify-between">{it.label}{it.href === "/requests" && unread > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}</span></Link>)}</div>}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar with account menu */}
        <header className="sticky top-0 z-30 flex items-center border-b border-gray-200 bg-white/80 px-4 py-2.5 backdrop-blur sm:px-6">
          <button onClick={() => setNavOpen(true)} aria-label="Open menu" className="mr-2 rounded-lg p-2 text-[#0A1628] hover:bg-gray-100 lg:hidden">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => window.dispatchEvent(new Event("labsynch:ask-ai"))} className="flex items-center gap-1.5 rounded-full bg-[#00C9A7]/15 px-3 py-1.5 text-sm font-semibold text-[#0a8d75] transition hover:bg-[#00C9A7]/25">✨ Ask AI</button>
            <div className="relative">
              <button onClick={toggleBell} aria-label="Notifications" className="relative rounded-full p-2 text-[#0A1628] hover:bg-gray-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
              </button>
              {bell && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setBell(false)} />
                  <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5"><span className="text-sm font-semibold text-[#0A1628]">Notifications</span>{visible.length > 0 && <button onClick={clearNotifs} className="text-xs font-medium text-gray-500 hover:text-red-600">Clear all</button>}</div>
                    <div className="max-h-96 overflow-auto">
                      {visible.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-400">You&apos;re all caught up.</p> : visible.map((n) => (
                        <Link key={n.id} href={n.href} onClick={() => setBell(false)} className="block border-b border-gray-50 px-4 py-2.5 hover:bg-gray-50">
                          <p className="text-sm font-medium text-[#0A1628]">{n.title}</p>
                          {n.sub && <p className="mt-0.5 text-xs text-gray-500">{n.sub}</p>}
                        </Link>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2">
                      <span className="text-xs text-gray-500">🔊 Notification sound</span>
                      <button onClick={() => { const v = !soundOn; setSoundOn(v); try { localStorage.setItem("labsynch.notif.sound", v ? "1" : "0"); } catch {} if (v) playChime(); }} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${soundOn ? "bg-[#00C9A7] text-[#0A1628]" : "bg-gray-100 text-gray-500"}`}>{soundOn ? "On" : "Off"}</button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-2.5 text-sm shadow-sm hover:bg-gray-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A1628] text-sm font-bold text-[#00C9A7]">{(user.name ?? "?").slice(0, 1).toUpperCase()}</span>
              <span className="hidden font-medium text-[#0A1628] sm:block">{user.name}</span>
              <span className="text-xs text-gray-400">▾</span>
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl">
                  <div className="bg-[#0A1628] px-4 py-4 text-white">
                    <div className="text-sm font-semibold">{user.name}</div>
                    {user.email && <div className="truncate text-xs text-gray-300">{user.email}</div>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {user.role && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium">{roleLabel(user.role)}</span>}
                      {user.plan && <span className="rounded-full bg-[#00C9A7]/20 px-2 py-0.5 text-[11px] font-medium text-[#00C9A7]">{planLabel(user.plan)}</span>}
                    </div>
                  </div>
                  <div className="py-1">
                    {account.map((a) => (
                      <Link key={a.href} href={a.href} onClick={() => setMenu(false)} className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        {a.label}<span className="text-gray-300">›</span>
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 py-1">
                    <button onClick={() => signOut({ callbackUrl: "/login" })} className="block w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50">Sign out</button>
                  </div>
                </div>
              </>
            )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      <AssistantWidget token={token} role={user.role ?? ""} />
      <IdleLogout idleMinutes={20} />
    </div>
  );
}
