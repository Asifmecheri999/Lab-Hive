"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { pwIssue, PW_HINT } from "@/lib/password";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const inputCls = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [stage, setStage] = useState<"request" | "set">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState(0); // countdown seconds
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const otp = digits.join("");

  useEffect(() => { if (left <= 0) return; const t = setInterval(() => setLeft((s) => s - 1), 1000); return () => clearInterval(t); }, [left]);

  // Already signed in (e.g. opened in a new tab)? Don't allow logging into a second account —
  // go to the app. To use a different account, sign out first. (AbortController so this
  // check can't race with a fresh login when switching accounts in the same browser.)
  useEffect(() => {
    const ctrl = new AbortController();
    retryFetch("/api/auth/session", { signal: ctrl.signal }).then((r) => r.json())
      .then((s) => { if (s?.user && !ctrl.signal.aborted) window.location.replace("/dashboard"); }).catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Bounced here right after setting a new password (forced reset) — make it obvious they should
  // now sign in with the NEW password, so they don't retype the temporary one and get "can't sign in".
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reset") === "1") {
      setInfo("Your new password is set — please sign in with it now (not the temporary one).");
    }
  }, []);

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    setDigits((p) => { const n = [...p]; n[i] = d; return n; });
    if (d && i < 5) boxRefs.current[i + 1]?.focus();
  }
  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) boxRefs.current[i - 1]?.focus();
  }
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!t) return; e.preventDefault();
    const n = ["", "", "", "", "", ""]; for (let i = 0; i < t.length; i++) n[i] = t[i];
    setDigits(n); boxRefs.current[Math.min(t.length, 5)]?.focus();
  }

  function reset() { setError(""); setInfo(""); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); reset(); setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) { setError("Couldn’t sign in — check your email & password, or wait a moment and try again."); setLoading(false); return; }
    window.location.href = "/dashboard";
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault(); reset();
    if (!email) { setError("Enter your email first"); return; }
    setLoading(true);
    const r = await retryFetch(`${API_URL}/api/auth/forgot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setLoading(false);
    if (r.ok) { setStage("set"); setDigits(["", "", "", "", "", ""]); setLeft(120); setInfo("If that email is registered, a 6-digit code has been sent. Check your inbox (and spam)."); }
    else setError("Something went wrong — please try again.");
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault(); reset();
    if (otp.length !== 6) { setError("Enter the 6-digit code"); return; }
    if (left <= 0) { setError("Code expired — tap Resend code"); return; }
    const pe = pwIssue(newPw); if (pe) { setError(pe); return; }
    if (newPw !== confirmPw) { setError("New passwords don't match"); return; }
    setLoading(true);
    const r = await retryFetch(`${API_URL}/api/auth/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp, password: newPw }) });
    setLoading(false);
    if (r.ok) { setMode("login"); setStage("request"); setDigits(["", "", "", "", "", ""]); setNewPw(""); setConfirmPw(""); setPassword(""); setLeft(0); setInfo("Password updated — sign in with your new password."); }
    else { const e2 = await r.json().catch(() => ({})); setError(e2.error ?? "Couldn't reset password"); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0A1628] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 text-2xl font-bold text-[#0A1628]"><span className="h-3 w-3 rounded-full bg-[#00C9A7]" /><span>Lab<span className="text-[#00C9A7]">Synch</span></span></div>
          <p className="mt-1 text-sm text-gray-500">{mode === "login" ? "Lab Operations Platform" : "Reset your password"}</p>
        </div>

        {info && <p className="mb-3 rounded bg-[#00C9A7]/10 px-3 py-2 text-sm text-[#0a8d75]">{info}</p>}
        {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {mode === "login" && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700">Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@email.com" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Password</label><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" /></div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#00C9A7] py-2 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
            <button type="button" onClick={() => { reset(); setMode("reset"); setStage("request"); }} className="w-full text-center text-xs font-medium text-gray-500 hover:text-[#0a8d75]">Forgot password?</button>
            <p className="text-center text-xs text-gray-400">Don&apos;t have an account? <a href="/contact" className="font-semibold text-[#0a8d75] hover:underline">Get free access →</a></p>
          </form>
        )}

        {mode === "reset" && stage === "request" && (
          <form onSubmit={requestOtp} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700">Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@email.com" /></div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#00C9A7] py-2 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:opacity-60">{loading ? "Sending…" : "Send reset code"}</button>
            <button type="button" onClick={() => { reset(); setMode("login"); }} className="w-full text-center text-xs font-medium text-gray-500 hover:text-[#0a8d75]">← Back to sign in</button>
          </form>
        )}

        {mode === "reset" && stage === "set" && (
          <form onSubmit={doReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Enter the 6-digit code</label>
              <div className="mt-2 flex justify-between gap-2" onPaste={onPaste}>
                {digits.map((d, i) => (
                  <input key={i} ref={(el) => { boxRefs.current[i] = el; }} value={d} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
                    inputMode="numeric" autoComplete="one-time-code" maxLength={1}
                    className="h-12 w-11 rounded-lg border border-gray-300 text-center text-lg font-bold text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" />
                ))}
              </div>
              <p className={`mt-1.5 text-xs ${left > 0 ? "text-gray-500" : "text-red-600"}`}>{left > 0 ? `Code expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Code expired — tap Resend code"}</p>
            </div>
            <div><label className="block text-sm font-medium text-gray-700">New password</label><input type="password" required value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} placeholder="New password" /><p className="mt-1 text-[11px] text-gray-400">{PW_HINT}</p></div>
            <div><label className="block text-sm font-medium text-gray-700">Confirm new password</label><input type="password" required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} placeholder="Re-enter new password" /></div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#00C9A7] py-2 text-sm font-semibold text-[#0A1628] transition hover:brightness-95 disabled:opacity-60">{loading ? "Updating…" : "Reset password"}</button>
            <button type="button" onClick={requestOtp} className="w-full text-center text-xs font-medium text-gray-500 hover:text-[#0a8d75]">Resend code</button>
          </form>
        )}
      </div>
    </main>
  );
}
