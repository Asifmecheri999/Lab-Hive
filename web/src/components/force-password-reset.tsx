"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { pwIssue, PW_HINT } from "@/lib/password";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const inputCls = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

// Shown on first sign-in (temp password) — user must set their own password before continuing.
export function ForcePasswordReset({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const pe = pwIssue(pw); if (pe) { setErr(pe); return; }
    if (pw !== confirm) { setErr("Passwords don't match"); return; }
    setBusy(true);
    const r = await retryFetch(`${API_URL}/api/auth/change-password`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    // Sign out so the next login mints a fresh session (mustResetPassword now cleared). Flag the
    // login page so it tells them to use their NEW password — otherwise people retype the temp one.
    if (r.ok) { await signOut({ callbackUrl: "/login?reset=1" }); }
    else { const e2 = await r.json().catch(() => ({})); setErr(e2.error ?? "Couldn't set password"); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0A1628] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 text-2xl font-bold text-[#0A1628]"><span className="h-3 w-3 rounded-full bg-[#00C9A7]" /><span>Lab<span className="text-[#00C9A7]">Synch</span></span></div>
          <p className="mt-1 text-sm text-gray-500">Set your password to continue</p>
        </div>
        {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700">New password</label><input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} placeholder="New password" /><p className="mt-1 text-[11px] text-gray-400">{PW_HINT}</p></div>
          <div><label className="block text-sm font-medium text-gray-700">Confirm new password</label><input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="Re-enter new password" /></div>
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#00C9A7] py-2 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:opacity-60">{busy ? "Saving…" : "Set password & continue"}</button>
        </form>
      </div>
    </main>
  );
}
