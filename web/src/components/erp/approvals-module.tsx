"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { retryFetch } from "@/lib/fetch-retry";
import { Button } from "./window";
import { API_URL } from "@/lib/api-url";

type Row = Record<string, unknown>;
const money = (n: unknown) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED`;

const STATUS: Record<string, { l: string; c: string }> = {
  submitted: { l: "Awaiting your decision", c: "bg-amber-100 text-amber-800" },
  on_hold: { l: "On hold", c: "bg-orange-100 text-orange-800" },
  approved: { l: "Approved", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
  rejected: { l: "Rejected", c: "bg-red-100 text-red-700" },
  ordered: { l: "Approved · ordered", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
  delivered: { l: "Approved · delivered", c: "bg-[#00C9A7]/15 text-[#0a8d75]" },
};
const LOG_STATUSES = ["on_hold", "approved", "rejected", "ordered", "delivered"];

export function ApprovalsModule({ token, email }: { token: string; role?: string; email: string }) {
  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [isApprover, setIsApprover] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/procurement");
    if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
    const all: Row[] = r.ok ? await r.json() : [];
    // Only requests routed to THIS approver (picked from the ticked-approver list when the request was raised).
    const mine = all.filter((x) => String(x.kind ?? "PURCHASE") !== "BUDGET"
      && ["submitted", ...LOG_STATUSES].includes(String(x.status))
      && String(x.approverEmail ?? "").toLowerCase() === String(email ?? "").toLowerCase());
    setRows(mine);
    setLoading(false);
  }, [api, email]);
  useEffect(() => { load(); }, [load]);
  // Opening the Approvals page clears its bell notifications (the approver has now seen them).
  useEffect(() => {
    api("/api/notifications/read-url", { method: "POST", body: JSON.stringify({ urlPrefix: "/approvals" }) })
      .then(() => { try { window.dispatchEvent(new Event("labsynch:notif-refresh")); } catch { /* no-op */ } })
      .catch(() => { /* best-effort */ });
  }, [api]);
  useEffect(() => { api("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => setIsApprover(!!d?.isApprover)).catch(() => setIsApprover(false)); }, [api]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  async function decide(id: string, status: string) {
    setBusy(id);
    const r = await api(`/api/procurement/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, note: notes[id] || "" }) });
    setBusy(null);
    if (r.ok) { flash(status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Put on hold"); load(); }
    else { const e = await r.json().catch(() => ({})); flash(e.error ?? "Couldn't update"); }
  }

  const itemsOf = (r: Row) => (r.items as Row[]) ?? [];
  const totalOf = (r: Row) => itemsOf(r).reduce((t, it) => t + (Number(it.quantity) || 0) * (Number(it.estPrice) || 0), 0);
  const vatOf = (r: Row) => (r.vatPercent === undefined || r.vatPercent === null ? 5 : Number(r.vatPercent) || 0);
  const quotesOf = (r: Row): Row[] => { try { const a = JSON.parse(String(r.vendorQuotes ?? "[]")); return Array.isArray(a) ? a : []; } catch { return []; } };
  const docsOf = (r: Row): { label: string; url: string }[] => { try { const a = JSON.parse(String(r.documents ?? "[]")); return Array.isArray(a) ? a : []; } catch { return []; } };
  const fileHref = (u: string) => (u && u.startsWith("/") ? `${API_URL}${u}` : u);
  const pending = rows.filter((r) => String(r.status) === "submitted");

  return (
    <div>
      <div className="mb-5"><h1 className="text-2xl font-bold text-[#0A1628]">Approvals</h1><p className="text-sm text-gray-500">Purchase requests routed to you — approve, hold or reject with a message back to the requester.</p></div>

      {isApprover === false ? (
        <div className="rounded-xl bg-amber-50 px-4 py-8 text-center text-sm text-amber-800">You’re not set up as an approver. Ask an admin to tick <b>“Can be selected as a procurement approver”</b> on your account in <b>Users</b>.</div>
      ) : (loading || isApprover === null) ? <p className="text-gray-400">Loading…</p> : (
        <>
        <h2 className="mb-2 text-sm font-semibold text-[#0A1628]">Awaiting your decision ({pending.length})</h2>
        {pending.length === 0 ? <p className="mb-6 rounded-xl bg-[#00C9A7]/10 px-4 py-6 text-center text-sm text-[#0a8d75]">🎉 Nothing waiting on you right now.</p> : (
        <div className="mb-8 space-y-4">
          {pending.map((r) => {
            const id = String(r.id); const items = itemsOf(r); const total = totalOf(r); const vat = vatOf(r); const quotes = quotesOf(r); const docs = docsOf(r);
            const st = STATUS[String(r.status)] ?? { l: String(r.status), c: "bg-gray-100 text-gray-600" };
            return (
              <div key={id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="h-2" style={{ background: "#F5A623" }} />
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-[#0A1628]">{String(r.title)}</h3>
                      <p className="mt-1 text-xs text-gray-500">{[r.budgetYear ? `Budget ${String(r.budgetYear)}` : null, (r.vendor as { name?: string })?.name ?? String(r.supplier ?? ""), r.department ? String(r.department) : null].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.c}`}>{st.l}</span>
                  </div>

                  {items.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-black/5">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-1.5 font-semibold">Item</th><th className="px-3 py-1.5 font-semibold">Qty</th><th className="px-3 py-1.5 font-semibold">Price/qty</th><th className="px-3 py-1.5 text-right font-semibold">Line</th></tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {items.map((it, i) => (
                            <tr key={i}><td className="px-3 py-1.5 text-gray-700">{String((it.item as { name?: string })?.name ?? it.customName ?? "item")}</td><td className="px-3 py-1.5 text-gray-500">{String(it.quantity ?? "")} {String(it.unit ?? "")}</td><td className="px-3 py-1.5 text-gray-500">{it.estPrice != null && it.estPrice !== "" ? money(it.estPrice) : "—"}</td><td className="px-3 py-1.5 text-right font-medium text-gray-700">{money((Number(it.quantity) || 0) * (Number(it.estPrice) || 0))}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#0A1628] px-4 py-2 text-sm text-white">
                    <span>Subtotal {money(total)} · VAT {vat}% {money(total * vat / 100)}</span>
                    <span className="font-bold text-[#00C9A7]">Total {money(total * (1 + vat / 100))}</span>
                  </div>

                  {r.description ? <p className="mt-3 text-sm text-gray-600"><span className="font-medium text-gray-500">Notes:</span> {String(r.description)}</p> : null}

                  {quotes.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-[#0A1628]">Vendor quotes ({quotes.length})</p>
                      <div className="overflow-x-auto rounded-lg ring-1 ring-black/5">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-1.5 font-semibold">Vendor</th><th className="px-3 py-1.5 text-right font-semibold">Amount</th><th className="px-3 py-1.5 font-semibold">Note</th><th className="px-3 py-1.5 font-semibold">Quote</th><th className="px-3 py-1.5 font-semibold"></th></tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {quotes.map((q, i) => (
                              <tr key={i} className={q.preferred ? "bg-[#00C9A7]/5" : ""}>
                                <td className="px-3 py-1.5 font-medium text-[#0A1628]">{String(q.vendorName ?? "—")}</td>
                                <td className="px-3 py-1.5 text-right text-gray-700">{q.amount != null && q.amount !== "" ? money(q.amount) : "—"}</td>
                                <td className="px-3 py-1.5 text-gray-500">{String(q.note ?? "")}</td>
                                <td className="px-3 py-1.5">{q.fileUrl ? <a href={fileHref(String(q.fileUrl))} target="_blank" rel="noreferrer" className="font-medium text-[#0a8d75] hover:underline">View</a> : <span className="text-gray-300">—</span>}</td>
                                <td className="px-3 py-1.5">{q.preferred ? <span className="rounded-full bg-[#00C9A7]/15 px-2 py-0.5 text-[10px] font-semibold text-[#0a8d75]">Preferred</span> : null}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {docs.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-[#0A1628]">Attachments</p>
                      <div className="flex flex-wrap gap-2">{docs.map((d, i) => <a key={i} href={fileHref(d.url)} target="_blank" rel="noreferrer" className="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-[#0a8d75] hover:bg-gray-50">📎 {d.label}</a>)}</div>
                    </div>
                  )}

                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600">Message to the requester <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" value={notes[id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))} placeholder="e.g. Approved — proceed with vendor X / On hold: please add a second quote" />
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="danger" onClick={() => decide(id, "rejected")} disabled={busy === id}>Reject</Button>
                    <Button variant="ghost" onClick={() => decide(id, "on_hold")} disabled={busy === id}>Hold</Button>
                    <Button onClick={() => decide(id, "approved")} disabled={busy === id}>{busy === id ? "Saving…" : "Approve"}</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}

        </>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}
