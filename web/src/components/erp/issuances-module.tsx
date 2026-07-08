"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Window, Button } from "./window";
import { ItemLines, emptyLine, lineFromApi, linesCost, rateOf, type ItemLine, type Inv } from "./item-lines";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const WRITE = ["LAB_TECHNICIAN", "LAB_COORDINATOR", "LAB_MANAGER", "ADMIN"]; // students/faculty are read-only (see their own)
type Row = Record<string, unknown>;
type Activity = { id: string; title: string; kind: string; supervisor?: string | null; supervisorEmail?: string | null; courseCode?: string | null; school?: string | null; department?: string | null; userName?: string | null; userEmail?: string | null; groupInfo?: string | null; items?: Row[] };
type Fac = { name: string; email?: string | null };
const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-600";
const fmt = (d?: unknown) => (d ? String(d) : "—");
const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString()} AED`;

export function IssuancesModule({ token, role }: { token: string; role: string }) {
  const canWrite = WRITE.includes(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [faculties, setFaculties] = useState<Fac[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("ALL");
  const [tab, setTab] = useState<"mine" | "supervising">("mine");

  const api = useCallback((p: string, i?: RequestInit) =>
    retryFetch(`${API_URL}${p}`, { ...i, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(i?.headers ?? {}) } }), [token]);

  const loadActs = useCallback(() => { api("/api/activities").then((x) => { if (x.ok) x.json().then(setActivities); }).catch(() => {}); }, [api]);
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api("/api/issuances");
      if (r.status === 401) { signOut({ callbackUrl: "/login" }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
      api("/api/inventory").then((i) => { if (i.ok) i.json().then(setInv); }).catch(() => {});
      api("/api/faculty").then((x) => { if (x.ok) x.json().then(setFaculties); }).catch(() => {});
      loadActs();
    } catch (e) { setErr(String((e as Error).message)); } finally { setLoading(false); }
  }, [api, loadActs]);
  useEffect(() => { load(); }, [load]);
  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (r: Row) => r.status !== "RETURNED" && !!r.returnDate && String(r.returnDate) < today;
  const ql = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (statusF === "OVERDUE") { if (!isOverdue(r)) return false; }
    else if (statusF !== "ALL" && String(r.status || "ISSUED") !== statusF) return false;
    if (!ql) return true;
    const hay = [r.studentName, r.groupName, r.supervisorName, r.courseCode, r.school, r.department, r.studentEmail, (r.activity as { title?: string })?.title]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(ql);
  });
  // Split into the current user's own borrowings vs the ones they supervise.
  // Lab team see everything (relation === "all") — that all lands under the first tab.
  const supervised = shown.filter((r) => r.relation === "supervisor");
  const owned = shown.filter((r) => r.relation !== "supervisor");
  const displayed = tab === "supervising" ? supervised : owned;
  const mineLabel = canWrite ? "All Issuances" : "My Issuances";
  const TabBtn = ({ id, label, n }: { id: "mine" | "supervising"; label: string; n: number }) => (
    <button onClick={() => setTab(id)} className={`select-none rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? "bg-[#0A1628] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
      {label} <span className={`ml-0.5 text-sm font-bold ${tab === id ? "text-[#00C9A7]" : "text-gray-400"}`}>({n})</span>
    </button>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold text-[#0A1628]">Issuances</h1><p className="text-sm text-gray-500">Equipment / item borrowal forms — linked to an activity (project / research)</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search borrower, project, course…" className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-700"><option value="ALL">All status</option><option value="ISSUED">Issued</option><option value="OVERDUE">Overdue</option><option value="RETURNED">Returned</option></select>
          <button onClick={load} aria-label="Refresh" title="Refresh" className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">↻</button>
          {canWrite && <Button onClick={() => setActive("new")}>+ New Issuance</Button>}
        </div>
      </div>

      {err ? <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Couldn’t load: {err}. <button onClick={load} className="font-semibold underline">Retry</button></div>
        : loading ? <p className="text-gray-400">Loading…</p>
        : rows.length === 0 ? <p className="text-gray-400">No issuances yet. {canWrite && "Click “+ New Issuance”."}</p>
        : shown.length === 0 ? <p className="text-gray-400">No issuances match your search.</p> : (() => {
          const tile = (r: Row) => {
            const returned = r.status === "RETURNED";
            const over = isOverdue(r);
            return (
              <button key={String(r.id)} onClick={() => setActive(r)} className="flex w-full flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="h-2 w-full shrink-0" style={{ background: returned ? "#94a3b8" : over ? "#dc2626" : "#00C9A7" }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#0A1628]">{String(r.studentName || r.groupName || "—")}</h3>
                    {over ? <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">⚠ OVERDUE</span>
                      : <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${returned ? "bg-gray-100 text-gray-600" : "bg-[#00C9A7]/15 text-[#0a8d75]"}`}>{String(r.status || "ISSUED")}</span>}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{[(r.activity as { title?: string })?.title, r.courseCode, r.department].filter(Boolean).join(" · ") || "—"}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{(r.items as unknown[])?.length ?? 0} items</span>
                    <span className={over ? "font-semibold text-red-600" : "text-gray-500"}>{r.returnDate ? `Return by ${fmt(r.returnDate)}` : fmt(r.borrowDate)}</span>
                  </div>
                </div>
              </button>
            );
          };
          return (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
                <TabBtn id="mine" label={mineLabel} n={owned.length} />
                {supervised.length > 0 && <TabBtn id="supervising" label="Supervising" n={supervised.length} />}
              </div>
              {displayed.length === 0
                ? <p className="text-gray-400">{tab === "supervising" ? "Not supervising any issuances." : "None."}</p>
                : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{displayed.map(tile)}</div>}
            </>
          );
        })()}

      {active && <IssuanceWindow record={active === "new" ? null : active} inv={inv} activities={activities} faculties={faculties} api={api} canWrite={canWrite}
        onActivitiesChanged={loadActs} onClose={() => setActive(null)} onSaved={(m) => { flash(m); setActive(null); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">{toast}</div>}
    </div>
  );
}

function IssuanceWindow({ record, inv, activities, faculties, api, canWrite, onActivitiesChanged, onClose, onSaved }: {
  record: Row | null; inv: Inv[]; activities: Activity[]; faculties: Fac[];
  api: (p: string, i?: RequestInit) => Promise<Response>; canWrite: boolean;
  onActivitiesChanged: () => void; onClose: () => void; onSaved: (m: string) => void;
}) {
  const isNew = record === null;
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const editing = mode === "edit";
  const dis = !editing;
  const [f, setF] = useState<Row>(() => record ? { ...record } : { status: "ISSUED" });
  const initLines = () => (((record?.items as Row[]) ?? []).map(lineFromApi));
  const [lines, setLines] = useState<ItemLine[]>(initLines);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [schools, setSchools] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [showGroup, setShowGroup] = useState(false);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const over = !isNew && f.status !== "RETURNED" && !!f.returnDate && String(f.returnDate) < new Date().toISOString().slice(0, 10);
  const customLines = lines.filter((l) => !l.itemId && String(l.customName ?? "").trim());
  const hasCustom = customLines.length > 0;
  const noPriceLines = lines.filter((l) => l.consumed && l.itemId && rateOf(l, inv) === 0);
  // Once stock is deducted (and not yet returned) the items are committed to inventory — lock them so edits can't desync stock.
  const itemsLocked = !!f.stockDeducted && !f.stockReturned;
  const reminderHref = `mailto:${String(f.studentEmail ?? "")}?subject=${encodeURIComponent("Overdue lab item return — LabSynch")}&body=${encodeURIComponent(`Dear ${String(f.studentName || "borrower")},\n\nOur records show the lab item(s) you borrowed were due for return by ${String(f.returnDate || "")}. Please return them as soon as possible.\n\nThank you,\nLabSynch`)}`;

  useEffect(() => {
    api("/api/org").then((r) => { if (r.ok) r.json().then((o: { schools?: { name: string }[]; departments?: { name: string }[] }) => { setSchools((o.schools ?? []).map((s) => s.name)); setDepartments((o.departments ?? []).map((d) => d.name)); }); }).catch(() => {});
  }, [api]);

  // Supervisor picked from the Faculty register → email auto-fills.
  function pickSupervisor(name: string) { const fac = faculties.find((x) => x.name === name); setF((s) => ({ ...s, supervisorName: name, supervisorEmail: fac?.email || s.supervisorEmail || "" })); }

  async function deductStock() {
    if (!confirm("Deduct these issued quantities from inventory stock? This reduces the on-hand count.")) return;
    setBusy(true); setErr("");
    const r = await api(`/api/issuances/${record!.id}/deduct`, { method: "POST" });
    setBusy(false);
    if (r.ok) onSaved("Stock updated"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Failed"); }
  }
  async function returnStock() {
    if (!confirm("Mark returned and put the borrowed (non-consumed) items back into stock?")) return;
    setBusy(true); setErr("");
    const r = await api(`/api/issuances/${record!.id}/return`, { method: "POST" });
    setBusy(false);
    if (r.ok) onSaved("Returned — borrowed items restored to stock"); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Failed"); }
  }

  async function save() {
    if (!f.studentName && !f.groupName) { setErr("Enter a borrower name or group"); return; }
    setErr(""); setBusy(true);
    const payload = { ...f, items: lines };
    const res = isNew ? await api("/api/issuances", { method: "POST", body: JSON.stringify(payload) })
      : await api(`/api/issuances/${record!.id}`, { method: "PUT", body: JSON.stringify(payload) });
    setBusy(false);
    if (!res.ok) { const e = await res.json().catch(() => ({})); setErr(e.error ?? "Save failed"); return; }
    if (f.activityId) onActivitiesChanged(); // items auto-synced to the linked activity server-side
    onSaved(isNew ? "Issuance created" : "Saved");
  }
  async function del() {
    if (!confirm("Delete this issuance?")) return;
    const res = await api(`/api/issuances/${record!.id}`, { method: "DELETE" });
    if (res.ok) onSaved("Deleted"); else setErr("Delete failed");
  }

  return (
    <Window width="max-w-4xl" title={isNew ? "New Borrower" : `Borrower — ${String(f.studentName || f.groupName || "")}`} subtitle={isNew ? "Equipment / item borrowal form" : editing ? "Editing" : "Borrowal form"}
      onClose={onClose}
      footer={<>
        {!isNew && canWrite && editing && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
        {!isNew && canWrite && !f.stockDeducted && <Button variant="danger" onClick={deductStock} disabled={busy}>Deduct from stock</Button>}
        {!isNew && canWrite && !!f.stockDeducted && !f.stockReturned && <Button variant="ghost" onClick={returnStock} disabled={busy}>Return to stock</Button>}
        {!isNew && canWrite && !!f.stockReturned && <span className="self-center text-xs text-gray-400">Returned ✓</span>}
        {!isNew && !canWrite && String(f.status) === "RETURNED" && <span className="self-center text-xs text-gray-400">Returned ✓</span>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {!isNew && canWrite && !editing && <Button onClick={() => setMode("edit")}>Edit</Button>}
        {editing && !isNew && <Button variant="ghost" onClick={() => { setF({ ...record! }); setLines(initLines()); setMode("view"); }}>Cancel</Button>}
        {editing && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
      </>}>
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {over && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>⚠ <span className="font-semibold">Overdue</span> — due back on {fmt(f.returnDate)} and not yet returned.</span>
          {String(f.studentEmail ?? "") !== "" && <a href={reminderHref} className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:brightness-110">Send reminder ✉</a>}
        </div>
      )}

      {/* Activity (read-only link indicator) */}
      {!!f.activityId && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
          <span className="text-xs text-gray-600">Activity: <span className="font-medium">{activities.find((a) => a.id === f.activityId)?.title ?? "linked"}</span></span>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Borrower name</label><input className={inputCls} disabled={dis} value={String(f.studentName ?? "")} onChange={(e) => set("studentName", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Borrower email</label><input className={inputCls} disabled={dis} value={String(f.studentEmail ?? "")} onChange={(e) => set("studentEmail", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">School</label><select className={inputCls} disabled={dis} value={String(f.school ?? "")} onChange={(e) => set("school", e.target.value)}><option value="">— select —</option>{schools.map((s) => <option key={s} value={s}>{s}</option>)}{String(f.school ?? "") !== "" && !schools.includes(String(f.school)) && <option value={String(f.school)}>{String(f.school)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Department</label><select className={inputCls} disabled={dis} value={String(f.department ?? "")} onChange={(e) => set("department", e.target.value)}><option value="">— select —</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{String(f.department ?? "") !== "" && !departments.includes(String(f.department)) && <option value={String(f.department)}>{String(f.department)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Supervisor</label><select className={inputCls} disabled={dis} value={String(f.supervisorName ?? "")} onChange={(e) => pickSupervisor(e.target.value)}><option value="">— select faculty —</option>{faculties.map((ff) => <option key={ff.name} value={ff.name}>{ff.name}{ff.email ? ` (${ff.email})` : ""}</option>)}{String(f.supervisorName ?? "") !== "" && !faculties.some((ff) => ff.name === f.supervisorName) && <option value={String(f.supervisorName)}>{String(f.supervisorName)}</option>}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Supervisor email</label><input className={inputCls} disabled={dis} value={String(f.supervisorEmail ?? "")} onChange={(e) => set("supervisorEmail", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Course code</label><input className={inputCls} disabled={dis} value={String(f.courseCode ?? "")} onChange={(e) => set("courseCode", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Status</label><select className={inputCls} disabled={dis} value={String(f.status ?? "ISSUED")} onChange={(e) => set("status", e.target.value)}><option value="ISSUED">Issued</option><option value="RETURNED">Returned</option></select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Borrow date</label><input type="date" className={inputCls} disabled={dis} value={String(f.borrowDate ?? "")} onChange={(e) => set("borrowDate", e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">Return by</label><input type="date" className={inputCls} disabled={dis} value={String(f.returnDate ?? "")} onChange={(e) => set("returnDate", e.target.value)} /></div>
        <div className="sm:col-span-2">
          {(String(f.groupInfo ?? "") !== "" || showGroup) ? (
            <><label className="mb-1 block text-xs font-medium text-gray-600">Group info</label><textarea rows={2} className={inputCls} disabled={dis} value={String(f.groupInfo ?? "")} onChange={(e) => set("groupInfo", e.target.value)} placeholder="Group members / details — shared with the linked activity" /></>
          ) : editing ? (
            <button type="button" onClick={() => setShowGroup(true)} className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">+ Add group info if required</button>
          ) : null}
        </div>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">Notes</label><input className={inputCls} disabled={dis} value={String(f.notes ?? "")} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>

      <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-1">
        <h3 className="text-sm font-semibold text-[#0A1628]">Items issued</h3>
        {editing && !itemsLocked && <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">+ Add item</button>}
      </div>
      {itemsLocked && <p className="mb-2 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">🔒 Stock has been deducted, so the item list is locked. Use <b>Return to stock</b> to put borrowed items back — then it can be edited again.</p>}
      <ItemLines lines={lines} setLines={setLines} inv={inv} editing={editing && !itemsLocked} />
      <p className="mt-2 text-[11px] text-gray-400">Pick from inventory, or type a name and choose “Add as Other” if it isn’t in inventory.</p>
      {canWrite && hasCustom && (
        <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ {customLines.map((l) => l.customName).join(", ")} {customLines.length === 1 ? "is" : "are"} not in inventory — {customLines.length === 1 ? "it" : "they"} won’t be deducted from or returned to stock (recorded as a note only). Your inventory items will still be deducted normally. To stock-track {customLines.length === 1 ? "it" : "them"}, add to Inventory and pick the matching item here.
        </p>
      )}
      {canWrite && noPriceLines.length > 0 && (
        <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          💲 No price set in Inventory for {noPriceLines.map((l) => inv.find((i) => i.id === l.itemId)?.name ?? "item").join(", ")} — set a price in Inventory so the used-up cost is captured.
        </p>
      )}
      {canWrite && (
        <div className="mt-4 rounded-lg bg-[#0A1628] p-4 text-white">
          <div className="flex items-center justify-between text-sm"><span>Consumable cost (used-up items)</span><span className="font-bold text-[#00C9A7]">{money(linesCost(lines, inv))}</span></div>
          <p className="mt-2 text-[11px] text-gray-400">Pulled from each item’s Inventory price; counts only lines ticked “used up”. Used-up items are consumed (not returned); borrowed items go back to stock on Return.</p>
        </div>
      )}

    </Window>
  );
}
