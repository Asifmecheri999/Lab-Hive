"use client";

import { useState } from "react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

export function SupportForm({ name, email }: { name: string; email: string }) {
  const [f, setF] = useState({ subject: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    if (!f.message.trim()) {
      setErr("Please describe the issue.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await retryFetch(`${API_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, category: "complaint", subject: f.subject, message: f.message, website: f.website }),
      });
      if (r.ok) setDone(true);
      else {
        const e = await r.json().catch(() => ({}));
        setErr(e.error ?? "Couldn't send — please try again.");
      }
    } catch {
      setErr("Couldn't send — please try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-[#00C9A7]/30 bg-[#00C9A7]/10 p-8 text-center">
        <p className="text-2xl">✓</p>
        <h2 className="mt-2 text-lg font-semibold text-[#0A1628]">Thanks — we&apos;ve got it.</h2>
        <p className="mt-1 text-sm text-gray-600">
          Your report has reached our team. We&apos;ll follow up at <b>{email}</b> if we need more detail.
        </p>
        <button
          onClick={() => {
            setDone(false);
            setF({ subject: "", message: "", website: "" });
          }}
          className="mt-5 rounded-xl bg-[#0A1628] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Report another
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      {err && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600">{err}</p>}
      {/* Honeypot — hidden from people, tempting to bots. Leave empty. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => set("website", e.target.value)} className="absolute left-[-9999px] h-0 w-0 opacity-0" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Your name</label>
          <input className={`${inputCls} bg-gray-50`} value={name} readOnly />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Reply email</label>
          <input className={`${inputCls} bg-gray-50`} value={email} readOnly />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Subject</label>
        <input className={inputCls} placeholder="e.g. Can't upload a risk assessment" value={f.subject} onChange={(e) => set("subject", e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">What went wrong? *</label>
        <textarea rows={6} className={inputCls} placeholder="Tell us what happened, what you expected, and which page you were on…" value={f.message} onChange={(e) => set("message", e.target.value)} />
      </div>
      <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-[#00C9A7] px-6 py-3 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:opacity-50">
        {busy ? "Sending…" : "Send report"}
      </button>
      <p className="text-center text-xs text-gray-400">
        Urgent? Email <a href="mailto:info@labsynch.com" className="text-[#0a8d75] hover:underline">info@labsynch.com</a>
      </p>
    </div>
  );
}
