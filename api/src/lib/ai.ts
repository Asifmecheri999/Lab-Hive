// Multi-provider AI helper. We do NOT gatekeep by key format: any key is accepted and saved.
// The provider is guessed from the prefix as a fast path; if the prefix is unknown we simply
// try every provider and use whichever one authenticates.
import { fetchWithTimeout } from './net'

export type AiProvider = 'anthropic' | 'openai' | 'gemini'

export function detectProvider(key: string | null | undefined): AiProvider | null {
  const k = (key ?? '').trim()
  if (k.startsWith('sk-ant-')) return 'anthropic'
  if (k.startsWith('sk-')) return 'openai' // OpenAI keys: sk-… / sk-proj-… (but not sk-ant-…)
  if (k.startsWith('AIza') || k.startsWith('AQ')) return 'gemini' // Google AI Studio keys
  return null
}

export const providerLabel: Record<AiProvider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  gemini: 'Gemini',
}

// Fast, low-cost default model per provider. Gemini Flash is free-tier eligible.
const MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-3-5-haiku-latest',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash-lite', // higher free-tier headroom + separate quota bucket than 2.5-flash
}

async function providerError(r: Response, name: string): Promise<string> {
  if (r.status === 401 || r.status === 403) return `${name} rejected the key (${r.status}).`
  if (r.status === 429) return `${name} rate limit or quota exceeded.`
  const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
  return d.error?.message || `${name} returned ${r.status}.`
}

// One provider call. Returns { text } on success or { error } on failure. Never throws.
async function callOne(provider: AiProvider, key: string, system: string, user: string): Promise<{ text?: string; error?: string }> {
  try {
    if (provider === 'anthropic') {
      const r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL.anthropic, max_tokens: 700, system, messages: [{ role: 'user', content: user }] }),
      }, 20000)
      if (!r.ok) return { error: await providerError(r, 'Claude') }
      const d = (await r.json()) as { content?: { text?: string }[] }
      return { text: (d.content?.map((x) => x.text ?? '').join('') ?? '').trim() }
    }
    if (provider === 'openai') {
      const r = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL.openai, max_tokens: 700, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      }, 20000)
      if (!r.ok) return { error: await providerError(r, 'ChatGPT') }
      const d = (await r.json()) as { choices?: { message?: { content?: string } }[] }
      return { text: (d.choices?.[0]?.message?.content ?? '').trim() }
    }
    // gemini — the key goes in the query string. Retry once on a transient overload (503/429).
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL.gemini}:generateContent?key=${encodeURIComponent(key)}`
    const gBody = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 1024 },
    })
    let gr = await fetchWithTimeout(gUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: gBody }, 20000)
    if (gr.status === 503 || gr.status === 429) {
      await new Promise((res) => setTimeout(res, 900))
      gr = await fetchWithTimeout(gUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: gBody }, 20000)
    }
    if (!gr.ok) return { error: await providerError(gr, 'Gemini') }
    const d = (await gr.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return { text: (d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim() }
  } catch {
    return { error: `Could not reach ${providerLabel[provider]} — check the connection and try again.` }
  }
}

// Accept any key: try the detected provider first, or every provider if the prefix is unknown.
export async function callAI(key: string, system: string, user: string): Promise<{ text?: string; error?: string; provider?: AiProvider }> {
  const detected = detectProvider(key)
  const order: AiProvider[] = detected ? [detected] : ['gemini', 'openai', 'anthropic']
  let lastError = 'The key was not accepted by any supported provider (Gemini, ChatGPT or Claude).'
  for (const p of order) {
    const res = await callOne(p, key, system, user)
    if (res.text) return { provider: p, text: res.text }
    if (res.error) lastError = res.error
  }
  return { provider: detected ?? undefined, error: lastError }
}
