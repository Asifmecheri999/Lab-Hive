import { apiFetch } from "@/lib/api";
import { PageHeader, Card } from "@/lib/ui";

type Bucket = { total: number; committed: number; delivered: number; pending: number; count: number };
type Summary = { currency: string; CAPEX: Bucket; OPEX: Bucket };

function Money({ n, c }: { n: number; c: string }) {
  return <span>{n.toLocaleString()} {c}</span>;
}

function BudgetCard({ title, b, c }: { title: string; b: Bucket; c: string }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#0A1628]">{title}</h2>
      <p className="mt-1 text-3xl font-bold text-[#00C9A7]"><Money n={b.total} c={c} /></p>
      <p className="text-xs text-gray-500">{b.count} request{b.count === 1 ? "" : "s"} total</p>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-gray-500">Pending</dt><dd className="text-gray-900"><Money n={b.pending} c={c} /></dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Committed</dt><dd className="text-gray-900"><Money n={b.committed} c={c} /></dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Delivered</dt><dd className="text-gray-900"><Money n={b.delivered} c={c} /></dd></div>
      </dl>
    </Card>
  );
}

export default async function CapexPage() {
  const s = await apiFetch<Summary>("/api/capex/summary").catch(() => null);

  return (
    <div>
      <PageHeader title="CAPEX / OPEX Planning" subtitle="Budget overview from procurement requests" />
      {!s ? (
        <p className="text-sm text-gray-400">No data or insufficient access.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <BudgetCard title="CAPEX" b={s.CAPEX} c={s.currency} />
          <BudgetCard title="OPEX" b={s.OPEX} c={s.currency} />
        </div>
      )}
    </div>
  );
}
