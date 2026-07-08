"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

const PROVIDER_LABEL: Record<string, string> = { anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini" };

type Msg = { role: "user" | "assistant"; text: string };

// Turn the plain-text answer into clickable links. Links to our own site navigate
// in-app (no full reload); anything else opens in a new tab.
const URL_RE = /(https?:\/\/[^\s)]+)/g;
function internalPath(url: string): string | null {
  try {
    const u = new URL(url);
    if (/(^|\.)labsynch\.com$/i.test(u.hostname)) return u.pathname + u.search;
    return null;
  } catch {
    return null;
  }
}
const SEG_LABEL: Record<string, string> = { docs: "Documents", ra: "Risk assessments", capex: "CAPEX / OPEX" };
function pathLabel(path: string): string {
  const seg = path.split("/").filter(Boolean)[0] ?? "";
  return SEG_LABEL[seg] ?? (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : "Open");
}

export function AssistantWidget({ token, role }: { token: string; role?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAdmin = role === "ADMIN";

  // Auto-scroll to the newest message so the user never has to scroll manually.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    retryFetch(`${API_URL}/api/org`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setAiEnabled(!!d?.tenant?.aiEnabled); setAiProvider(d?.tenant?.aiProvider ?? null); })
      .catch(() => {});
  }, [open, isAdmin, token]);

  async function saveKey(clear = false) {
    setSavingKey(true);
    setTestMsg("");
    const r = await retryFetch(`${API_URL}/api/org/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ aiApiKey: clear ? "" : keyInput.trim() }),
    });
    setSavingKey(false);
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      setAiEnabled(!!d?.aiEnabled);
      setAiProvider(d?.aiProvider ?? null);
      setKeyInput("");
    } else {
      const d = await r.json().catch(() => ({}));
      setTestMsg(`❌ ${d.error ?? "Couldn't save the key."}`);
    }
  }

  // Admin: verify the saved Anthropic key actually works, with one tiny live call.
  async function testKey() {
    setTesting(true);
    setTestMsg("");
    try {
      const r = await retryFetch(`${API_URL}/api/agent/test`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      setTestMsg(r.ok && d.ok ? `✅ Working — ${d.providerLabel ?? "Smart AI"} answered a test question.` : `❌ ${d.error ?? "Key test failed."}`);
    } catch {
      setTestMsg("❌ Network error while testing.");
    }
    setTesting(false);
  }

  // Opened from the "✨ Ask AI" button in the top bar (no always-on floating bubble).
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("labsynch:ask-ai", openIt);
    return () => window.removeEventListener("labsynch:ask-ai", openIt);
  }, []);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  // Render an assistant answer, converting any links into clickable elements.
  function renderText(text: string) {
    return text.split(URL_RE).map((part, i) => {
      if (i % 2 === 0) return <span key={i}>{part}</span>;
      const path = internalPath(part);
      if (path) {
        return (
          <button key={i} type="button" onClick={() => go(path)} className="font-semibold text-[#0a8d75] underline underline-offset-2 hover:text-[#00C9A7]">
            {pathLabel(path)} →
          </button>
        );
      }
      return (
        <a key={i} href={part} target="_blank" rel="noreferrer" className="font-semibold text-[#0a8d75] underline underline-offset-2 hover:text-[#00C9A7] break-all">
          {part}
        </a>
      );
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await retryFetch(`${API_URL}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok) setMessages((m) => [...m, { role: "assistant", text: data.error ?? "Something went wrong." }]);
      else {
        setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
        setHistory(data.history ?? []);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Opened from the "✨ Ask AI" button in the top bar. */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-[65] flex w-full max-w-sm flex-col border-l border-black/5 bg-white shadow-2xl">
          <div className="flex items-center gap-3 bg-[#0A1628] px-4 py-3 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00C9A7] text-sm font-bold text-[#0A1628]">L</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">LabSynch Assistant</div>
              <div className="text-[11px] text-[#00C9A7]">{aiEnabled ? `Smart mode (${aiProvider ? PROVIDER_LABEL[aiProvider] ?? "AI" : "AI"}) on` : "Ask me about your lab"}</div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={() => { setMessages([]); setHistory([]); }} className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10 hover:text-white" title="Clear chat">
                  Clear
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setSettings((s) => !s)} className="rounded p-1 text-gray-300 hover:bg-white/10 hover:text-white" title="Smart AI settings">
                  ⚙
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-300 hover:bg-white/10 hover:text-white">
                ✕
              </button>
            </div>
          </div>

          {isAdmin && settings && (
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs">
              <p className="font-semibold text-[#0A1628]">Smart AI {aiEnabled ? `· on ✅${aiProvider ? ` · ${PROVIDER_LABEL[aiProvider] ?? "AI"}` : ""}` : "· off"} <span className="font-normal text-gray-400">· admin only</span></p>
              <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste API key" className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-gray-900 focus:border-[#00C9A7] focus:outline-none" />
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => saveKey(false)} disabled={savingKey || !keyInput.trim()} className="rounded-md bg-[#0A1628] px-3 py-1 font-semibold text-[#00C9A7] disabled:opacity-50">
                  {savingKey ? "Saving…" : "Save key"}
                </button>
                {aiEnabled && (
                  <button onClick={testKey} disabled={testing} className="rounded-md bg-[#00C9A7] px-3 py-1 font-semibold text-[#0A1628] disabled:opacity-50">
                    {testing ? "Testing…" : "Test"}
                  </button>
                )}
                {aiEnabled && (
                  <button onClick={() => saveKey(true)} disabled={savingKey} className="rounded-md border border-gray-300 px-3 py-1 text-gray-600">
                    Turn off
                  </button>
                )}
              </div>
              {testMsg && <p className="mt-2 text-gray-700">{testMsg}</p>}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <span className={`inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-[#00C9A7] text-[#0A1628]" : "bg-gray-100 text-gray-800"}`}>
                  {m.role === "assistant" ? renderText(m.text) : m.text}
                </span>
              </div>
            ))}
            {loading && <p className="text-sm text-gray-400">Thinking…</p>}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="flex gap-2 border-t border-gray-100 p-3">
            <input className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]" placeholder="Ask about your lab…" value={input} onChange={(e) => setInput(e.target.value)} />
            <button type="submit" disabled={loading} className="rounded-lg bg-[#0A1628] px-4 py-2 text-sm font-semibold text-[#00C9A7] hover:brightness-110 disabled:opacity-60">
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
