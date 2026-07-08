"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

// Auto sign-out after a period of inactivity, with a 60-second warning countdown.
// Any real activity (mouse / key / scroll / touch) resets the timer.
export function IdleLogout({ idleMinutes = 20 }: { idleMinutes?: number }) {
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const lastRef = useRef(Date.now());

  useEffect(() => {
    const IDLE = Math.max(1, idleMinutes) * 60_000;
    const WARN = 60_000; // show the warning 60s before logout
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
    let throttled = false;
    const onActivity = () => {
      if (throttled) return;
      throttled = true;
      setTimeout(() => (throttled = false), 1000);
      lastRef.current = Date.now();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const iv = setInterval(() => {
      const idle = Date.now() - lastRef.current;
      if (idle >= IDLE) { clearInterval(iv); signOut({ callbackUrl: "/login" }); return; }
      setWarnLeft(idle >= IDLE - WARN ? Math.max(1, Math.ceil((IDLE - idle) / 1000)) : null);
    }, 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, onActivity)); clearInterval(iv); };
  }, [idleMinutes]);

  const stay = () => { lastRef.current = Date.now(); setWarnLeft(null); };
  if (warnLeft === null) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl ring-1 ring-black/5">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">⏳</div>
        <h2 className="text-lg font-semibold text-[#0A1628]">Still there?</h2>
        <p className="mt-1 text-sm text-gray-600">You&apos;ve been inactive, so you&apos;ll be signed out in <span className="font-bold text-red-600">{warnLeft}s</span> to keep your account secure.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Sign out now</button>
          <button onClick={stay} className="rounded-md bg-[#00C9A7] px-4 py-2 text-sm font-semibold text-[#0A1628] hover:brightness-95">Stay signed in</button>
        </div>
      </div>
    </div>
  );
}
