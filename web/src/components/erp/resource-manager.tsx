"use client";

import { useCallback, useEffect, useState } from "react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";
import { Window, Button } from "./window";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  optionsFrom?: { apiPath: string; valueKey?: string; labelKey: string };
  required?: boolean;
  createOnly?: boolean; // shown only when creating
  help?: string;
};

export type Column = {
  key: string;
  label: string;
  badge?: boolean;
  render?: (row: Record<string, unknown>) => string;
};

export type ActionDef = {
  label: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: (row: Record<string, unknown>) => string;
  body?: (row: Record<string, unknown>) => unknown;
  variant?: "primary" | "ghost" | "danger";
  confirm?: string;
};

export type ResourceConfig = {
  title: string;
  apiPath: string;
  idKey?: string;
  columns: Column[];
  fields: Field[];
  canWrite?: boolean;
  editable?: boolean;
  deletable?: boolean;
  actions?: (row: Record<string, unknown>) => ActionDef[];
  empty?: string;
};

type Row = Record<string, unknown>;

export function ResourceManager({ token, config }: { token: string; config: ResourceConfig }) {
  const idKey = config.idKey ?? "id";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Row | "new" | null>(null);
  const [toast, setToast] = useState("");
  const [optionCache, setOptionCache] = useState<Record<string, { value: string; label: string }[]>>({});

  const api = useCallback(
    (path: string, init?: RequestInit) =>
      retryFetch(`${API_URL}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
      }),
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api(config.apiPath);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setRows(await res.json());
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, [api, config.apiPath]);

  useEffect(() => {
    load();
  }, [load]);

  // Load dynamic select options
  useEffect(() => {
    config.fields
      .filter((f) => f.optionsFrom)
      .forEach(async (f) => {
        const of = f.optionsFrom!;
        if (optionCache[f.name]) return;
        try {
          const res = await api(of.apiPath);
          if (!res.ok) return;
          const data: Row[] = await res.json();
          setOptionCache((c) => ({
            ...c,
            [f.name]: data.map((d) => ({
              value: String(d[of.valueKey ?? "id"]),
              label: String(d[of.labelKey]),
            })),
          }));
        } catch {
          /* ignore */
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const filtered = search
    ? rows.filter((r) =>
        config.columns.some((c) => {
          const v = c.render ? c.render(r) : r[c.key];
          return String(v ?? "").toLowerCase().includes(search.toLowerCase());
        }),
      )
    : rows;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-[#0A1628]">{config.title}</h1>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {filtered.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]"
          />
          <button onClick={load} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
            ↻
          </button>
          {config.canWrite && (
            <Button onClick={() => setActive("new")}>+ New</Button>
          )}
        </div>
      </div>

      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {config.columns.map((c) => (
                <th key={c.key} className="px-4 py-3">{c.label}</th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={config.columns.length + 1} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={config.columns.length + 1} className="px-4 py-8 text-center text-gray-400">{config.empty ?? "No records."}</td></tr>
            )}
            {!loading && filtered.map((r) => (
              <tr
                key={String(r[idKey])}
                onClick={() => setActive(r)}
                className="cursor-pointer hover:bg-[#00C9A7]/5"
              >
                {config.columns.map((c) => {
                  const val = c.render ? c.render(r) : (r[c.key] as React.ReactNode);
                  return (
                    <td key={c.key} className="px-4 py-3 text-gray-700">
                      {c.badge ? <Badge value={String(val ?? "—")} /> : (val ?? "—")}
                    </td>
                  );
                })}
                <td className="px-2 text-gray-300">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Record window */}
      {active && (
        <RecordWindow
          config={config}
          idKey={idKey}
          record={active === "new" ? null : active}
          optionCache={optionCache}
          api={api}
          onClose={() => setActive(null)}
          onSaved={(msg) => { flash(msg); setActive(null); load(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#0A1628] px-4 py-3 text-sm font-medium text-[#00C9A7] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Badge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const cls =
    /approved|completed|delivered|on track/.test(v) ? "bg-emerald-100 text-emerald-800" :
    /pending|submitted|draft|in_progress|in progress/.test(v) ? "bg-amber-100 text-amber-800" :
    /rejected|overdue|low/.test(v) ? "bg-red-100 text-red-700" :
    "bg-gray-100 text-gray-600";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{value.replace(/_/g, " ")}</span>;
}

function RecordWindow({
  config, idKey, record, optionCache, api, onClose, onSaved,
}: {
  config: ResourceConfig;
  idKey: string;
  record: Row | null;
  optionCache: Record<string, { value: string; label: string }[]>;
  api: (path: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isNew = record === null;
  const editable = isNew || config.editable;
  const [form, setForm] = useState<Row>(() => {
    const init: Row = {};
    config.fields.forEach((f) => {
      init[f.name] = record ? record[f.name] ?? "" : f.type === "checkbox" ? false : "";
    });
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const fields = config.fields.filter((f) => (isNew ? true : !f.createOnly));

  async function save() {
    setErr(""); setBusy(true);
    const body: Row = {};
    fields.forEach((f) => {
      let v = form[f.name];
      if (f.type === "number") v = v === "" || v == null ? null : Number(v);
      body[f.name] = v;
    });
    try {
      const res = isNew
        ? await api(config.apiPath, { method: "POST", body: JSON.stringify(body) })
        : await api(`${config.apiPath}/${record![idKey]}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Save failed (${res.status})`);
      }
      onSaved(isNew ? "Created" : "Saved");
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(a: ActionDef) {
    if (a.confirm && !window.confirm(a.confirm)) return;
    setErr(""); setBusy(true);
    try {
      const res = await api(a.path(record!), {
        method: a.method,
        body: a.body ? JSON.stringify(a.body(record!)) : undefined,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Action failed (${res.status})`);
      }
      onSaved(a.label);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    setBusy(true); setErr("");
    try {
      const res = await api(`${config.apiPath}/${record![idKey]}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      onSaved("Deleted");
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7] disabled:bg-gray-50 disabled:text-gray-500";

  const actions = !isNew && config.actions ? config.actions(record!) : [];

  return (
    <Window
      title={isNew ? `New ${config.title.replace(/s$/, "")}` : String(record![config.columns[0].key] ?? config.title)}
      subtitle={isNew ? undefined : `${config.title.replace(/s$/, "")} record`}
      onClose={onClose}
      footer={
        <>
          {!isNew && config.deletable && <Button variant="danger" onClick={del} disabled={busy}>Delete</Button>}
          {actions.map((a) => (
            <Button key={a.label} variant={a.variant ?? "ghost"} onClick={() => runAction(a)} disabled={busy}>{a.label}</Button>
          ))}
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {editable && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>}
        </>
      }
    >
      {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const opts = f.optionsFrom ? optionCache[f.name] ?? [] : f.options ?? [];
          const val = form[f.name];
          const disabled = !editable;
          const wide = f.type === "textarea";
          return (
            <div key={f.name} className={wide ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea rows={3} className={inputCls} disabled={disabled} value={String(val ?? "")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
              ) : f.type === "select" ? (
                <select className={inputCls} disabled={disabled} value={String(val ?? "")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">— select —</option>
                  {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <input type="checkbox" disabled={disabled} checked={!!val} onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              ) : (
                <input type={f.type === "number" ? "number" : "text"} className={inputCls} disabled={disabled} value={String(val ?? "")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
              )}
              {f.help && <p className="mt-1 text-xs text-gray-400">{f.help}</p>}
            </div>
          );
        })}
      </div>
    </Window>
  );
}
