"use client";

import Link from "next/link";
import { useState } from "react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

export default function Contact() {
  const [f, setF] = useState({ name: "", email: "", organisation: "", plan: "Free access", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    if (!f.name || !f.email || !f.message) { setErr("Please fill in your name, email and a message."); return; }
    setBusy(true); setErr("");
    try {
      const r = await retryFetch(`${API_URL}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (r.ok) setDone(true); else { const e = await r.json().catch(() => ({})); setErr(e.error ?? "Couldn't send — please try again."); }
    } catch { setErr("Couldn't send — please try again."); }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0A1628]/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold"><span className="h-2.5 w-2.5 rounded-full bg-[#00C9A7]" /><span>Lab<span className="text-[#00C9A7]">Synch</span></span></Link>
          <Link href="/login" className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">Sign in</Link>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#00C9A7]">Free access</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Get free access</h1>
        <p className="mt-3 text-gray-300">Tell us about your lab and we&apos;ll set up your workspace and send you a login — <b className="text-white">free, with full access to every module</b>. No card, no catch.</p>

        {done ? (
          <div className="mt-10 rounded-2xl border border-[#00C9A7]/30 bg-[#00C9A7]/10 p-8 text-center">
            <p className="text-2xl">✓</p>
            <h2 className="mt-2 text-xl font-semibold">Thanks, {f.name.split(" ")[0] || "there"}!</h2>
            <p className="mt-1 text-sm text-gray-300">Your message has reached us. We&apos;ll get back to you at <b>{f.email}</b> soon.</p>
            <Link href="/" className="mt-6 inline-block rounded-xl bg-[#00C9A7] px-6 py-3 text-sm font-semibold text-[#0A1628]">Back to home</Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {err && <p className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-300">{err}</p>}
            {/* Honeypot — hidden from people, tempting to bots. Leave empty. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => set("website", e.target.value)} className="absolute left-[-9999px] h-0 w-0 opacity-0" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium text-gray-400">Your name *</label><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-400">Email *</label><input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-400">Lab / organisation</label><input className={inputCls} value={f.organisation} onChange={(e) => set("organisation", e.target.value)} /></div>
            </div>
            <div><label className="mb-1 block text-xs font-medium text-gray-400">Message *</label><textarea rows={5} className={inputCls} value={f.message} onChange={(e) => set("message", e.target.value)} placeholder="How many labs, roughly how many users, what you'd like to do…" /></div>
            <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-[#00C9A7] px-6 py-3.5 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:opacity-50">{busy ? "Sending…" : "Send message"}</button>
            <p className="text-center text-xs text-gray-500">Prefer email? <a href="mailto:info@labsynch.com" className="text-[#00C9A7] hover:underline">info@labsynch.com</a></p>
            <p className="text-center text-[11px] text-gray-500">LabSynch is free and provided as-is — please keep your own backups of anything important.</p>
          </div>
        )}
      </section>
    </div>
  );
}
