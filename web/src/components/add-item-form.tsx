"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const TYPES = ["EQUIPMENT", "CONSUMABLE", "PPE", "TOOL"];

export function AddItemForm({ token }: { token: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    type: "EQUIPMENT",
    category: "",
    quantity: 0,
    minQuantity: 0,
    unit: "",
    location: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await retryFetch(`${API_URL}/api/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...form,
        quantity: Number(form.quantity),
        minQuantity: Number(form.minQuantity),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(`Failed (${res.status})`);
      return;
    }
    setForm({ name: "", type: "EQUIPMENT", category: "", quantity: 0, minQuantity: 0, unit: "", location: "" });
    router.refresh();
  }

  const input =
    "rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input className={input} placeholder="Name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
      <select className={input} value={form.type} onChange={(e) => set("type", e.target.value)}>
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input className={input} placeholder="Category" required value={form.category} onChange={(e) => set("category", e.target.value)} />
      <input className={input} placeholder="Location" value={form.location} onChange={(e) => set("location", e.target.value)} />
      <input className={input} type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
      <input className={input} type="number" placeholder="Min quantity" value={form.minQuantity} onChange={(e) => set("minQuantity", Number(e.target.value))} />
      <input className={input} placeholder="Unit (pcs, ml…)" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[#00C9A7] px-4 py-2 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Add item"}
      </button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
