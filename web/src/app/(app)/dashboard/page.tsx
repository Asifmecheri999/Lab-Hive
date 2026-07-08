import Link from "next/link";
import { auth } from "@/auth";
import { apiFetch } from "@/lib/api";

type Item = Record<string, unknown>;
type Row = Record<string, unknown>;

function dueStatus(v: unknown): "overdue" | "soon" | null {
  if (!v) return null;
  const d = new Date(String(v)).getTime();
  if (isNaN(d)) return null;
  const now = Date.now();
  if (d < now) return "overdue";
  if (d - now <= 30 * 24 * 3600 * 1000) return "soon";
  return null;
}

const STAFF = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN", "HEAD_OF_SCHOOL", "DEAN"];

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";

  // Students & faculty get a personal dashboard of their own things (no inventory/stock).
  if (!STAFF.includes(role)) return <StudentDashboard name={session?.user?.name ?? ""} role={role} />;

  const [items, labs, vendors, requests, schedules] = await Promise.all([
    apiFetch<Item[]>("/api/inventory").catch(() => [] as Item[]),
    apiFetch<Row[]>("/api/schedule/labs").catch(() => [] as Row[]),
    apiFetch<Row[]>("/api/vendors").catch(() => [] as Row[]),
    apiFetch<Row[]>("/api/requests").catch(() => [] as Row[]),
    apiFetch<Row[]>("/api/maintenance/schedules").catch(() => [] as Row[]),
  ]);

  const byType = (t: string) => items.filter((i) => i.type === t).length;
  const lowStock = items.filter((i) => (i.quantity as number) <= (i.minQuantity as number));
  const maintDue = items.filter((i) => dueStatus(i.nextMaintenanceDue));
  const calDue = items.filter((i) => dueStatus(i.calibrationExpiry));
  const pendingReq = requests.filter((r) => r.status === "PENDING").length;
  const overdueSched = schedules.filter((s) => s.overdue).length;

  const kpis = [
    { label: "Total assets", value: items.length, icon: "📦", href: "/inventory", color: "bg-sky-50 text-sky-700" },
    { label: "Equipment", value: byType("EQUIPMENT"), icon: "🔬", href: "/inventory", color: "bg-blue-50 text-blue-700" },
    { label: "Tools", value: byType("TOOL"), icon: "🛠️", href: "/inventory", color: "bg-amber-50 text-amber-700" },
    { label: "PPE", value: byType("PPE"), icon: "🦺", href: "/inventory", color: "bg-emerald-50 text-emerald-700" },
    { label: "Consumables", value: byType("CONSUMABLE"), icon: "🧪", href: "/inventory", color: "bg-violet-50 text-violet-700" },
    { label: "Laboratories", value: labs.length, icon: "🏛️", href: "/facilities", color: "bg-indigo-50 text-indigo-700" },
    { label: "Vendors", value: vendors.length, icon: "🏢", href: "/vendors", color: "bg-teal-50 text-teal-700" },
    { label: "Pending requests", value: pendingReq, icon: "📨", href: "/requests", color: "bg-rose-50 text-rose-700" },
  ];

  const alerts = [
    { label: "Low stock items", value: lowStock.length, tone: lowStock.length ? "red" : "ok" },
    { label: "Maintenance due / overdue", value: maintDue.length, tone: maintDue.length ? "amber" : "ok" },
    { label: "Calibration due / overdue", value: calDue.length, tone: calDue.length ? "amber" : "ok" },
    { label: "Overdue maintenance schedules", value: overdueSched, tone: overdueSched ? "red" : "ok" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#0A1628]">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Welcome back, {session?.user?.name?.split(" ")[0]} · <span className="font-medium text-[#00C9A7]">{role}</span></p>

      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${k.color}`}>{k.icon}</span>
              <span className="text-3xl font-bold text-[#0A1628]">{k.value}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-gray-600">{k.label}</p>
          </Link>
        ))}
      </div>

      {/* Alerts */}
      <h2 className="mt-8 text-lg font-semibold text-[#0A1628]">Alerts</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {alerts.map((a) => (
          <div key={a.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className={`text-3xl font-bold ${a.tone === "red" ? "text-red-600" : a.tone === "amber" ? "text-amber-600" : "text-emerald-600"}`}>{a.value}</p>
            <p className="mt-1 text-sm text-gray-600">{a.label}</p>
          </div>
        ))}
      </div>

      {/* Detail lists */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Maintenance & calibration due" href="/maintenance">
          {[...maintDue.map((i) => ({ i, kind: "Maintenance", due: i.nextMaintenanceDue, st: dueStatus(i.nextMaintenanceDue) })),
            ...calDue.map((i) => ({ i, kind: "Calibration", due: i.calibrationExpiry, st: dueStatus(i.calibrationExpiry) }))]
            .slice(0, 8).map((x, n) => (
              <Line key={n} name={String((x.i as Item).name)} meta={`${x.kind} · ${new Date(String(x.due)).toLocaleDateString()}`} tone={x.st === "overdue" ? "red" : "amber"} tag={x.st === "overdue" ? "Overdue" : "Due soon"} />
            ))}
          {maintDue.length + calDue.length === 0 && <Empty text="Nothing due — all up to date." />}
        </Panel>

        <Panel title="Low stock" href="/inventory">
          {lowStock.slice(0, 8).map((i) => (
            <Line key={String(i.id)} name={String(i.name)} meta={String(i.category)} tone="red" tag={`${i.quantity}${i.unit ? " " + i.unit : ""}`} />
          ))}
          {lowStock.length === 0 && <Empty text="All items above minimum stock." />}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-[#0A1628]">{title}</h3>
        <Link href={href} className="text-xs font-medium text-[#00C9A7] hover:underline">View all →</Link>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Line({ name, meta, tone, tag }: { name: string; meta: string; tone: "red" | "amber"; tag: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <div><p className="text-sm font-medium text-gray-900">{name}</p><p className="text-xs text-gray-500">{meta}</p></div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{tag}</span>
    </div>
  );
}
function Empty({ text }: { text: string }) { return <p className="py-6 text-center text-sm text-gray-400">{text}</p>; }

const REQ_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800", APPROVED: "bg-[#00C9A7]/15 text-[#0a8d75]", HOLD: "bg-orange-100 text-orange-700",
  REJECTED: "bg-red-100 text-red-700", IN_PROGRESS: "bg-blue-100 text-blue-700", COMPLETED: "bg-gray-100 text-gray-600",
};
const ST_BADGE: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-800", pending: "bg-amber-100 text-amber-800", approved: "bg-[#00C9A7]/15 text-[#0a8d75]",
  hold: "bg-orange-100 text-orange-700", revise: "bg-orange-100 text-orange-700", rejected: "bg-red-100 text-red-700", issued: "bg-blue-100 text-blue-700",
};
const stBadge = (s: string) => ST_BADGE[s] ?? "bg-gray-100 text-gray-600";
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const parseJ = <T,>(v: unknown, fb: T): T => { try { return JSON.parse(String(v ?? "")) as T; } catch { return fb; } };

function DashLine({ name, meta, badge, badgeCls }: { name: string; meta?: string; badge?: string; badgeCls?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{name}</p>{meta ? <p className="truncate text-xs text-gray-500">{meta}</p> : null}</div>
      {badge ? <span className={`ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeCls}`}>{badge}</span> : null}
    </div>
  );
}

async function StudentDashboard({ name, role }: { name: string; role: string }) {
  const [requests, issuances, activities, ras, ppe] = await Promise.all([
    apiFetch<Row[]>("/api/requests").catch(() => [] as Row[]),
    apiFetch<Row[]>("/api/issuances").catch(() => [] as Row[]),
    apiFetch<Row[]>("/api/activities").catch(() => [] as Row[]),
    apiFetch<Row[]>("/api/safety/ra").catch(() => [] as Row[]),
    apiFetch<Row[]>("/api/portal-requests?kind=PPE").catch(() => [] as Row[]),
  ]);
  const pending = requests.filter((r) => r.status === "PENDING").length;
  const activeIssued = issuances.filter((i) => String(i.status ?? "") !== "RETURNED").length;
  const roleLabel = role ? role.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ") : "";

  const kpis = [
    { label: "Job requests", value: requests.length, icon: "📨", href: "/requests?tab=jobs", color: "bg-rose-50 text-rose-700" },
    { label: "RA submissions", value: ras.length, icon: "📋", href: "/requests?tab=ra", color: "bg-amber-50 text-amber-700" },
    { label: "PPE requests", value: ppe.length, icon: "🦺", href: "/requests?tab=ppe", color: "bg-emerald-50 text-emerald-700" },
    { label: "Items issued to me", value: activeIssued, icon: "📦", href: "/issuances", color: "bg-sky-50 text-sky-700" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#0A1628]">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Welcome back, {name.split(" ")[0]} · <span className="font-medium text-[#00C9A7]">{roleLabel}</span>{pending ? <> · <span className="font-medium text-amber-600">{pending} awaiting approval</span></> : null}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${k.color}`}>{k.icon}</span>
              <span className="text-3xl font-bold text-[#0A1628]">{k.value}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-gray-600">{k.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Job requests" href="/requests?tab=jobs">
          {requests.slice(0, 6).map((r) => (
            <DashLine key={String(r.id)} name={String(r.title ?? "Request")} meta={String(r.type ?? "")} badge={String(r.status ?? "")} badgeCls={REQ_BADGE[String(r.status ?? "")] ?? "bg-gray-100 text-gray-600"} />
          ))}
          {requests.length === 0 && <Empty text="No job requests yet — submit one from Requests." />}
        </Panel>

        <Panel title="RA submissions" href="/requests?tab=ra">
          {ras.slice(0, 6).map((r) => (
            <DashLine key={String(r.id)} name={String(r.title ?? "Risk assessment")} meta={String(r.project ?? r.equipment ?? "")} badge={titleCase(String(r.status ?? "submitted"))} badgeCls={stBadge(String(r.status ?? "submitted"))} />
          ))}
          {ras.length === 0 && <Empty text="No RA submissions yet." />}
        </Panel>

        <Panel title="PPE requests" href="/requests?tab=ppe">
          {ppe.slice(0, 6).map((r) => { const items = parseJ<unknown[]>(r.items, []); return (
            <DashLine key={String(r.id)} name="PPE request" meta={`${items.length} item(s)`} badge={titleCase(String(r.status ?? "pending"))} badgeCls={stBadge(String(r.status ?? "pending"))} />
          ); })}
          {ppe.length === 0 && <Empty text="No PPE requests yet." />}
        </Panel>

        <Panel title="Items issued to me" href="/issuances">
          {issuances.slice(0, 6).map((i) => (
            <DashLine key={String(i.id)} name={String((i.activity as { title?: string })?.title ?? i.groupName ?? "Issuance")} meta={`${Array.isArray(i.items) ? `${(i.items as unknown[]).length} item(s)` : ""}${i.returnDate ? ` · return by ${new Date(String(i.returnDate)).toLocaleDateString()}` : ""}`} badge={String(i.status ?? "ISSUED")} badgeCls={String(i.status) === "RETURNED" ? "bg-gray-100 text-gray-600" : "bg-[#00C9A7]/15 text-[#0a8d75]"} />
          ))}
          {issuances.length === 0 && <Empty text="Nothing issued to you yet." />}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="My activities" href="/activities">
          {activities.slice(0, 8).map((a) => (
            <DashLine key={String(a.id)} name={String(a.title ?? "Activity")} meta={`${String(a.kind ?? "")}${a.supervisor ? ` · supervisor: ${String(a.supervisor)}` : ""}`} />
          ))}
          {activities.length === 0 && <Empty text="No activities assigned to you yet." />}
        </Panel>
      </div>
    </div>
  );
}
