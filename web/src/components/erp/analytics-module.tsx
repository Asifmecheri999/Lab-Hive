"use client";

import { useCallback, useEffect, useState } from "react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

type Row = Record<string, unknown>;
const AED = (n: unknown) => `${Math.round(Number(n) || 0).toLocaleString()} AED`;
const PIE = ["#00C9A7", "#2563eb", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#14b8a6", "#64748b", "#ec4899", "#84cc16"];
// Fiscal year: fy = the calendar year the fiscal year STARTS in (startMonth=1 → plain calendar year). Matches finance-module.
const fyOf = (d: unknown, sm: number) => { const dt = new Date(String(d)); return (dt.getMonth() + 1) >= sm ? dt.getFullYear() : dt.getFullYear() - 1; };
const fyLabel = (fy: number, sm: number) => (sm === 1 ? String(fy) : `${fy}/${String((fy + 1) % 100).padStart(2, "0")}`);
const num = (v: unknown) => Number(v) || 0;

function Pie({ data }: { data: { label: string; value: number }[] }) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((t, d) => t + d.value, 0);
  if (total <= 0) return <p className="text-xs text-gray-400">No data yet.</p>;
  const r = 70, cx = 80, cy = 80; let a = -90;
  const arcs = slices.map((d, i) => {
    const f = d.value / total, s = a, e = a + f * 360; a = e;
    const sr = (s * Math.PI) / 180, er = (e * Math.PI) / 180;
    const x1 = cx + r * Math.cos(sr), y1 = cy + r * Math.sin(sr), x2 = cx + r * Math.cos(er), y2 = cy + r * Math.sin(er);
    return { ...d, f, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2} Z`, color: PIE[i % PIE.length] };
  });
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0">{arcs.length === 1 ? <circle cx={cx} cy={cy} r={r} fill={arcs[0].color} /> : arcs.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}</svg>
      <div className="space-y-1">{arcs.map((s, i) => <div key={i} className="flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-sm" style={{ background: s.color }} /><span className="font-medium capitalize text-[#0A1628]">{s.label}</span><span className="text-gray-500">{AED(s.value)} · {Math.round(s.f * 100)}%</span></div>)}</div>
    </div>
  );
}

function Bars({ data, money }: { data: { label: string; value: number }[]; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-xs text-gray-400">No data yet.</p>;
  return (
    <div className="space-y-2">{data.map((d, i) => (
      <div key={d.label} className="text-xs">
        <div className="mb-0.5 flex justify-between"><span className="font-medium capitalize text-[#0A1628]">{d.label}</span><span className="text-gray-500">{money ? AED(d.value) : d.value}</span></div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: PIE[i % PIE.length] }} /></div>
      </div>
    ))}</div>
  );
}

const Card = ({ title, value, sub }: { title: string; value: string; sub?: string }) => (
  <div className="rounded-xl bg-[#0A1628] p-4 text-white"><p className="text-xs text-gray-300">{title}</p><p className="mt-1 text-2xl font-bold text-[#00C9A7]">{value}</p>{sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}</div>
);
const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-gray-100 bg-white p-4"><h3 className="mb-3 text-sm font-semibold text-[#0A1628]">{title}</h3>{children}</div>
);

export function AnalyticsModule({ token }: { token: string }) {
  const api = useCallback((p: string) => retryFetch(`${API_URL}${p}`, { headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [inv, setInv] = useState<Row[]>([]);
  const [opex, setOpex] = useState<Row[]>([]);
  const [budget, setBudget] = useState<Row[]>([]);
  const [proc, setProc] = useState<Row[]>([]);
  const [fiscalStart, setFiscalStart] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const get = async (p: string) => { try { const r = await api(p); return r.ok ? ((await r.json()) as Row[]) : []; } catch { return []; } };
      const [a, b, c, d] = await Promise.all([get("/api/inventory"), get("/api/finance/opex"), get("/api/finance/budget"), get("/api/procurement")]);
      setInv(a); setOpex(b); setBudget(c); setProc(d);
      try { const r = await api("/api/org"); if (r.ok) { const o = await r.json(); setFiscalStart(Number(o?.tenant?.fiscalYearStartMonth) || 1); } } catch { /* keep calendar year */ }
      setLoading(false);
    })();
  }, [api]);

  if (loading) return <div><h1 className="mb-1 text-2xl font-bold text-[#0A1628]">Analytics</h1><p className="text-gray-400">Crunching your data…</p></div>;

  // Inventory
  const invValue = inv.reduce((t, i) => t + num(i.pricePerPiece) * num(i.quantity), 0);
  const lowStock = inv.filter((i) => num(i.quantity) <= num(i.minQuantity)).length;
  const byType = Object.entries(inv.reduce((m: Record<string, number>, i) => { const k = String(i.type || "OTHER"); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([label, value]) => ({ label, value }));
  // OPEX (this fiscal year)
  const fy = fyOf(new Date(), fiscalStart);
  const fyL = fyLabel(fy, fiscalStart);
  const opexY = opex.filter((e) => fyOf(e.date, fiscalStart) === fy);
  const opexTotal = opexY.reduce((t, e) => t + num(e.amount), 0);
  const opexByCat = Object.entries(opexY.reduce((m: Record<string, number>, e) => { const k = String(e.category || "other"); m[k] = (m[k] || 0) + num(e.amount); return m; }, {})).map(([label, value]) => ({ label, value }));
  // Budget vs procured (this fiscal year)
  const allocated = budget.filter((b) => num(b.year) === fy).reduce((t, b) => t + num(b.allocated), 0);
  const validOrders = proc.filter((o) => num(o.budgetYear) === fy && ["approved", "ordered", "delivered"].includes(String(o.status)));
  const committed = validOrders.reduce((t, o) => t + ((o.items as Row[]) ?? []).reduce((s, it) => s + num(it.quantity) * num(it.estPrice), 0), 0);
  // Procurement by status
  const procByStatus = Object.entries(proc.reduce((m: Record<string, number>, o) => { const k = String(o.status || "draft"); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([label, value]) => ({ label, value }));

  return (
    <div>
      <div className="mb-5"><h1 className="text-2xl font-bold text-[#0A1628]">Analytics</h1><p className="text-sm text-gray-500">Insights across inventory, spending and procurement ({fiscalStart === 1 ? fyL : `FY ${fyL}`}).</p></div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Inventory value" value={AED(invValue)} sub={`${inv.length} item(s)`} />
        <Card title="Low / out of stock" value={String(lowStock)} sub="at or below minimum" />
        <Card title="OPEX spent" value={AED(opexTotal)} sub={`${opexY.length} expense(s)`} />
        <Card title="Committed (budget)" value={AED(committed)} sub={`of ${AED(allocated)} allocated`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Inventory by type"><Bars data={byType} /></Panel>
        <Panel title={`OPEX by category — ${fyL}`}><Pie data={opexByCat} /></Panel>
        <Panel title={`Budget vs committed — ${fyL}`}><Bars data={[{ label: "Allocated", value: allocated }, { label: "Committed", value: committed }, { label: "Remaining", value: Math.max(0, allocated - committed) }]} money /></Panel>
        <Panel title="Purchase requests by status"><Bars data={procByStatus} /></Panel>
      </div>
    </div>
  );
}
