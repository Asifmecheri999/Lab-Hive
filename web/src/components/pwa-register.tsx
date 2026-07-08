"use client";

import { useEffect } from "react";

// Registers the service worker (installable PWA) AND keeps it fresh so a stale cached worker
// can't keep serving an old build — the #1 cause of "works in incognito but not my normal browser".
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Whether a SW already controls this page. If so, a NEW worker taking over means an update → reload once.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded || !hadController) return; // don't reload on the very first install
      reloaded = true;
      window.location.reload();
    });
    // updateViaCache:"none" → always fetch sw.js fresh (never from HTTP cache), so updates land promptly.
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update().catch(() => {});
        // Check for a newer worker whenever the tab regains focus.
        const onFocus = () => reg.update().catch(() => {});
        window.addEventListener("focus", onFocus);
      })
      .catch(() => {});
  }, []);
  return null;
}
