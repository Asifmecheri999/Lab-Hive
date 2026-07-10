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

// Server-persisted notification (from /api/notifications). readAt === null means unread.
type Notif = { id: string; type?: string; event?: string; title: string; body?: string | null; refType?: string | null; refId?: string | null; url?: string | null; readAt?: string | null; createdAt?: string };

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
  const [unread, setUnread] = useState(0);
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
    try { setSoundOn(localStorage.getItem("labsynch.notif.sound") === "1"); } catch {}
    if (!token) return;
    // AbortController so switching accounts (token changes) cancels in-flight
    // requests carrying the OLD token — prevents stale-token "fetch error" noise.
    const ctrl = new AbortController();
    const opt = { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal };
    // One lightweight call to the server-persisted notification store — the reliable source of
    // truth for the bell + sidebar. No more deriving from six endpoints (that hammered the Worker).
    const load = async () => {
      try {
        const r = await retryFetch(`${API_URL}/api/notifications`, opt);
        if (!r.ok) return;
        const d = await r.json();
        setNotifs(Array.isArray(d.items) ? d.items : []);
        setUnread(typeof d.unread === "number" ? d.unread : 0);
      } catch { /* background poll — ignore transient errors */ }
    };
    load();
    const iv = setInterval(load, 30000); // poll so new alerts (and the sound) arrive without a manual refresh
    const onWake = () => { if (!document.hidden) load(); }; // refresh when returning to the tab
    // Pages dispatch this after they mark a request's notifications read (e.g. opening a tile),
    // so the bell + sidebar badges update immediately instead of waiting for the next poll.
    const onRefresh = () => load();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("labsynch:notif-refresh", onRefresh);
    return () => { clearInterval(iv); ctrl.abort(); window.removeEventListener("focus", onWake); document.removeEventListener("visibilitychange", onWake); window.removeEventListener("labsynch:notif-refresh", onRefresh); };
  }, [token]);
  // Chime when the unread count goes up (skips the first load so it doesn't ring on every page open).
  useEffect(() => {
    if (!initRef.current) { initRef.current = true; prevUnreadRef.current = unread; return; }
    if (soundOn && unread > prevUnreadRef.current) playChime();
    prevUnreadRef.current = unread;
  }, [unread, soundOn]);
  function toggleBell() { setBell((o) => !o); }
  // "Clear all" deletes every notification server-side, so the bell stays empty after logout/login.
  async function clearNotifs() {
    setNotifs([]); setUnread(0);
    try { await fetch(`${API_URL}/api/notifications`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); } catch {}
  }
  // Opening a notification marks just that one read (badge ticks down) before navigating.
  async function openNotif(n: Notif) {
    setBell(false);
    if (n.readAt) return;
    setUnread((u) => Math.max(0, u - 1));
    setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    try { await fetch(`${API_URL}/api/notifications/${n.id}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); } catch {}
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const linkCls = (href: string) =>
    `block rounded-lg px-3 py-2 text-sm transition ${isActive(href) ? "bg-[#00C9A7] font-semibold text-[#0A1628]" : "text-gray-300 hover:bg-white/10 hover:text-white"}`;
  // Unread notifications whose destination is this sidebar link (Requests / Approvals /
  // Procurement / Activities …), matched on the notification's url path. Powers the green blink badge.
  const countForHref = (href: string) => notifs.filter((n) => !n.readAt && (n.url || "").split("?")[0] === href).length;
  const sectionBadge = (href: string) => {
    const n = countForHref(href);
    return n > 0 ? <span className="ml-2 animate-pulse rounded-full bg-[#00C9A7] px-1.5 text-[10px] font-bold text-[#0A1628]">{n}</span> : null;
  };

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
              return <Fragment key={`s${i}`}>{s.items.map((it) => <Link key={it.href} href={it.href} onClick={() => setNavOpen(false)} className={linkCls(it.href)}><span className="flex items-center justify-between">{it.label}{sectionBadge(it.href)}</span></Link>)}</Fragment>;
            }
            const open = collapsed[s.heading] !== true;
            return (
              <div key={s.heading} className="pt-1">
                <button onClick={() => setCollapsed((p) => ({ ...p, [s.heading!]: open }))}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-white">
                  <span>{s.heading}</span>
                  <span className="flex items-center gap-1.5">
                    {!open && (() => { const hc = s.items.reduce((a, it) => a + countForHref(it.href), 0); return hc > 0 ? <span className="animate-pulse rounded-full bg-[#00C9A7] px-1.5 text-[10px] font-bold text-[#0A1628]">{hc}</span> : null; })()}
                    <span className="text-base leading-none">{open ? "−" : "+"}</span>
                  </span>
                </button>
                {open && <div className="mt-0.5 space-y-1">{s.items.map((it) => <Link key={it.href} href={it.href} onClick={() => setNavOpen(false)} className={linkCls(it.href)}><span className="flex items-center justify-between">{it.label}{sectionBadge(it.href)}</span></Link>)}</div>}
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
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5"><span className="text-sm font-semibold text-[#0A1628]">Notifications</span>{notifs.length > 0 && <button onClick={clearNotifs} className="text-xs font-medium text-gray-500 hover:text-red-600">Clear all</button>}</div>
                    <div className="max-h-96 overflow-auto">
                      {notifs.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-400">You&apos;re all caught up.</p> : notifs.map((n) => (
                        <Link key={n.id} href={n.url || "/requests"} onClick={() => openNotif(n)} className={`block border-b border-gray-50 px-4 py-2.5 hover:bg-gray-50 ${!n.readAt ? "bg-[#00C9A7]/5" : ""}`}>
                          <p className="flex items-start gap-2 text-sm font-medium text-[#0A1628]">{!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00C9A7]" />}<span>{n.title}</span></p>
                          {n.body && <p className="mt-0.5 text-xs text-gray-500">{n.body}</p>}
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
      <IdleLogout idleMinutes={10} />
    </div>
  );
}
