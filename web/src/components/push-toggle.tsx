"use client";

import { useEffect, useState } from "react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const b64ToUint8 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
};

// "Enable phone alerts" control shown in the notifications dropdown.
export function PushToggle({ token }: { token: string }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "busy" | "error">("off");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setState(sub ? "on" : "off")).catch(() => {});
  }, []);

  async function enable() {
    setState("busy"); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("off"); setMsg("Permission blocked in the browser."); return; }
      const reg = await navigator.serviceWorker.ready;
      const res = await retryFetch(`${API_URL}/api/push/key`);
      const { key } = await res.json().catch(() => ({}));
      if (!key) { setState("error"); setMsg("Push not set up yet (VAPID keys missing on the server)."); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const r = await retryFetch(`${API_URL}/api/push/subscribe`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
      if (!r.ok) { setState("error"); setMsg("Couldn't register this device."); return; }
      setState("on");
    } catch { setState("error"); setMsg("Couldn't enable alerts on this device."); }
  }

  async function test() { await retryFetch(`${API_URL}/api/push/test`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); }

  if (state === "unsupported") return <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">Phone alerts: add this app to your home screen to enable.</div>;
  return (
    <div className="border-t border-gray-100 px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        {state === "on"
          ? <><span className="text-xs font-medium text-[#0a8d75]">🔔 Phone alerts on</span><button onClick={test} className="text-xs font-medium text-gray-500 hover:text-[#0a8d75]">Send test</button></>
          : <><span className="text-xs text-gray-500">Get alerts on this device</span><button onClick={enable} disabled={state === "busy"} className="rounded-md bg-[#0A1628] px-2.5 py-1 text-xs font-semibold text-[#00C9A7] disabled:opacity-50">{state === "busy" ? "…" : state === "error" ? "Retry" : "Enable"}</button></>}
      </div>
      {msg && <p className="mt-1 text-[11px] text-amber-600">{msg}</p>}
    </div>
  );
}
