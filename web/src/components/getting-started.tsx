"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

type Step = { key: string; title: string; desc: string; href: string; done: boolean };

export function GettingStarted({ token }: { token: string }) {
  const api = useCallback((p: string) => retryFetch(`${API_URL}${p}`, { headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [loading, setLoading] = useState(true);
  const [c, setC] = useState({ labs: 0, users: 0, inventory: 0, budget: 0, procurement: 0, experiments: 0, terms: 0 });

  useEffect(() => {
    (async () => {
      const len = async (p: string) => { try { const r = await api(p); return r.ok ? ((await r.json()) as unknown[]).length : 0; } catch { return 0; } };
      let labs = 0, users = 0, inventory = 0;
      try { const r = await api("/api/org"); if (r.ok) { const d = await r.json(); labs = d?.usage?.labs ?? 0; users = d?.usage?.users ?? 0; inventory = d?.usage?.inventory ?? 0; } } catch { /* ignore */ }
      const [budget, procurement, experiments, terms] = await Promise.all([len("/api/finance/budget"), len("/api/procurement"), len("/api/experiments"), len("/api/timetable/terms")]);
      setC({ labs, users, inventory, budget, procurement, experiments, terms });
      setLoading(false);
    })();
  }, [api]);

  const steps: Step[] = [
    { key: "org", title: "Set up your organisation & labs", desc: "Add your campus, school, department and laboratories — these feed every picker.", href: "/organisation", done: c.labs > 0 },
    { key: "team", title: "Invite your team", desc: "Add staff and assign their roles.", href: "/users", done: c.users > 1 },
    { key: "inv", title: "Add inventory", desc: "Enter equipment (set Track in Finance = CAPEX + useful life) and consumables with a price.", href: "/inventory", done: c.inventory > 0 },
    { key: "budget", title: "Plan the annual budget", desc: "Add budget lines per category for the year in Finance → Budget Planner.", href: "/finance", done: c.budget > 0 },
    { key: "proc", title: "Raise a purchase order", desc: "Order against a budget year, approve it, then record the delivery & invoice cost.", href: "/procurement", done: c.procurement > 0 },
    { key: "exp", title: "Define experiments", desc: "List the items/consumables each experiment needs.", href: "/experiments", done: c.experiments > 0 },
    { key: "term", title: "Build the timetable", desc: "Create a term and book sessions — clashes are checked automatically.", href: "/timetable", done: c.terms > 0 },
  ];
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  const ongoing = [
    { title: "Issue & return items", desc: "Borrow/return or consume stock — usage posts to OPEX by date.", href: "/issuances" },
    { title: "Record usage", desc: "Use the “Use” button on an item when stock is used or broken.", href: "/inventory" },
    { title: "Log maintenance", desc: "Service costs flow into OPEX on the service date.", href: "/maintenance" },
    { title: "Review the finances", desc: "CAPEX depreciation, OPEX, budget vs actual, and downloadable statements.", href: "/finance" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5"><h1 className="text-2xl font-bold text-[#0A1628]">Getting started</h1><p className="text-sm text-gray-500">Set LabSynch up in the right order — each step opens the page you need.</p></div>

      <div className="mb-6 rounded-xl bg-[#0A1628] p-5 text-white">
        <div className="flex items-center justify-between text-sm"><span>Setup progress</span><span className="font-bold text-[#00C9A7]">{done}/{steps.length}</span></div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#00C9A7] transition-all" style={{ width: `${pct}%` }} /></div>
        {done === steps.length && <p className="mt-2 text-xs text-[#00C9A7]">🎉 All set — your workspace is ready.</p>}
      </div>

      {loading ? <p className="text-gray-400">Loading…</p> : (
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.key} className={`flex items-start gap-3 rounded-xl border p-4 ${s.done ? "border-[#00C9A7]/30 bg-[#00C9A7]/5" : "border-gray-200 bg-white"}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? "bg-[#00C9A7] text-[#0A1628]" : "bg-gray-100 text-gray-500"}`}>{s.done ? "✓" : i + 1}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#0A1628]">{s.title}</p>
                <p className="text-sm text-gray-500">{s.desc}</p>
              </div>
              <Link href={s.href} className="shrink-0 self-center rounded-lg bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110">{s.done ? "Open" : "Start"}</Link>
            </li>
          ))}
        </ol>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-gray-400">Then, day to day</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {ongoing.map((o) => (
          <Link key={o.title} href={o.href} className="rounded-xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="font-semibold text-[#0A1628]">{o.title}</p>
            <p className="mt-1 text-sm text-gray-500">{o.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
