"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const TYPES = ["THREE_D_PRINT", "LASER_CUT", "CNC", "SUPERVISED_SESSION", "EQUIPMENT_USE", "OTHER"];

export function NewRequestForm({ token }: { token: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ type: "THREE_D_PRINT", title: "", description: "", material: "", quantity: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await retryFetch(`${API_URL}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
    });
    setSaving(false);
    if (!res.ok) return setError(`Failed (${res.status})`);
    setForm({ type: "THREE_D_PRINT", title: "", description: "", material: "", quantity: 1 });
    router.refresh();
  }

  const input =
    "rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
        {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
      </select>
      <input className={input} placeholder="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className={input} placeholder="Material" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} />
      <input className={`${input} sm:col-span-2`} placeholder="Description" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <input className={input} type="number" min={1} placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
      <button type="submit" disabled={saving} className="rounded-lg bg-[#00C9A7] px-4 py-2 text-sm font-semibold text-[#0A1628] hover:brightness-95 disabled:opacity-60">
        {saving ? "Submitting…" : "Submit request"}
      </button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
