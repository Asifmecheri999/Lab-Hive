"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { PRIVACY_SECTIONS, POLICY_UPDATED } from "@/lib/privacy-policy";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

// First-login gate: the user must agree to the privacy policy before entering the app.
// Agreement is recorded on their account (timestamp + version) as proof of consent.
export function PolicyConsent({ token, name }: { token: string; name?: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function accept() {
    if (!agreed) return;
    setBusy(true);
    setErr("");
    try {
      const r = await retryFetch(`${API_URL}/api/auth/accept-policy`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) router.refresh();
      else {
        const e = await r.json().catch(() => ({}));
        setErr(e.error ?? "Couldn't save your agreement — please try again.");
        setBusy(false);
      }
    } catch {
      setErr("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A1628]/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-[#0A1628] px-6 py-4 text-white">
          <div className="flex items-center gap-2 text-lg font-bold">
            <span className="h-2.5 w-2.5 rounded-full bg-[#00C9A7]" />
            <span>Lab<span className="text-[#00C9A7]">Synch</span></span>
          </div>
          <h1 className="mt-3 text-lg font-semibold">Before you continue{name ? `, ${name.split(" ")[0]}` : ""}</h1>
          <p className="mt-0.5 text-sm text-gray-300">Please review and agree to our Privacy Policy to use LabSynch.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-gray-600">
          <p className="text-xs text-gray-400">Last updated {POLICY_UPDATED}</p>
          <div className="mt-3 space-y-4">
            {PRIVACY_SECTIONS.map((s) => (
              <section key={s.h}>
                <h2 className="text-sm font-semibold text-[#0A1628]">{s.h}</h2>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {s.body.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
          {err && <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{err}</p>}
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#00C9A7]" />
            <span>I have read and agree to the LabSynch <b>Privacy Policy</b> (version {POLICY_UPDATED}).</span>
          </label>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm font-medium text-gray-500 hover:text-gray-800">
              Sign out
            </button>
            <button onClick={accept} disabled={!agreed || busy} className="rounded-xl bg-[#00C9A7] px-6 py-2.5 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Saving…" : "Agree & continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
