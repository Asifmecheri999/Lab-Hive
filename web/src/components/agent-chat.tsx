"use client";

import { useState } from "react";
import { retryFetch } from "@/lib/fetch-retry";
import { API_URL } from "@/lib/api-url";

type Msg = { role: "user" | "assistant"; text: string };

export function AgentChat({ token }: { token: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", text: data.error ?? "Something went wrong." }]);
      } else {
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
    <div className="mx-auto max-w-2xl">
      <div className="min-h-[300px] space-y-3 rounded-xl bg-white p-5 shadow-sm">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">
            Try: “Is there any PLA filament in stock?” or “What’s the schedule for the Fabrication Lab?”
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === "user" ? "bg-[#00C9A7] text-[#0A1628]" : "bg-gray-100 text-gray-800"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        {loading && <p className="text-sm text-gray-400">Assistant is thinking…</p>}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#00C9A7] focus:outline-none focus:ring-1 focus:ring-[#00C9A7]"
          placeholder="Ask the assistant…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#0A1628] px-4 py-2 text-sm font-semibold text-[#00C9A7] hover:brightness-110 disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
