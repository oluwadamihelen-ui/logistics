/**
 * LLM provider abstraction. The orchestrator speaks one normalised message format; each provider
 * adapts it. Only providers with API keys in the environment are considered configured.
 */
export type ChatMsg =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; toolCalls?: { id: string; name: string; args: Record<string, unknown> }[] }
  | { role: "tool"; results: { id: string; name: string; content: string }[] };

export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
export interface ChatResult { text: string; toolCalls: { id: string; name: string; args: Record<string, unknown> }[]; stop: "end" | "tool" | "length" | "other" }
export interface LlmProvider {
  name: "anthropic" | "openai";
  model: string;
  isConfigured(): boolean;
  chat(input: { system: string; messages: ChatMsg[]; tools?: ToolSpec[]; maxTokens?: number }): Promise<ChatResult>;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`LLM provider responded ${res.status}`); // never include the body: it may echo prompt data
  return res.json();
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  get model() { return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"; },
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY,
  async chat({ system, messages, tools, maxTokens = 1500 }) {
    const msgs = messages.map((m) => {
      if (m.role === "user") return { role: "user", content: m.text };
      if (m.role === "assistant") return { role: "assistant", content: [...(m.text ? [{ type: "text", text: m.text }] : []), ...(m.toolCalls ?? []).map((t) => ({ type: "tool_use", id: t.id, name: t.name, input: t.args }))] };
      return { role: "user", content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })) };
    });
    const j = await post("https://api.anthropic.com/v1/messages", { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" }, {
      model: this.model, max_tokens: maxTokens, system, messages: msgs,
      ...(tools?.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    });
    const blocks: any[] = j.content ?? [];
    return {
      text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
      toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
      stop: j.stop_reason === "tool_use" ? "tool" : j.stop_reason === "max_tokens" ? "length" : j.stop_reason === "end_turn" ? "end" : "other",
    };
  },
};

export const openaiProvider: LlmProvider = {
  name: "openai",
  get model() { return process.env.OPENAI_MODEL ?? "gpt-4o"; },
  isConfigured: () => !!process.env.OPENAI_API_KEY,
  async chat({ system, messages, tools, maxTokens = 1500 }) {
    const msgs: any[] = [{ role: "system", content: system }];
    for (const m of messages) {
      if (m.role === "user") msgs.push({ role: "user", content: m.text });
      else if (m.role === "assistant") msgs.push({ role: "assistant", content: m.text ?? null, ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })) } : {}) });
      else for (const r of m.results) msgs.push({ role: "tool", tool_call_id: r.id, content: r.content });
    }
    const j = await post("https://api.openai.com/v1/chat/completions", { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, {
      model: this.model, max_tokens: maxTokens, messages: msgs,
      ...(tools?.length ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
    });
    const c = j.choices?.[0];
    const calls = (c?.message?.tool_calls ?? []).map((t: any) => { let args = {}; try { args = JSON.parse(t.function.arguments || "{}"); } catch { /* invalid args handled by validation */ } return { id: t.id, name: t.function.name, args }; });
    return { text: (c?.message?.content ?? "").trim(), toolCalls: calls, stop: calls.length ? "tool" : c?.finish_reason === "length" ? "length" : "end" };
  },
};

let override: LlmProvider | null = null;
export function setLlmProvider(p: LlmProvider | null) { override = p; }

/** AI_PROVIDER=anthropic|openai forces a choice; otherwise the first configured provider is used. */
export function getLlmProvider(): LlmProvider | null {
  if (override) return override;
  const want = process.env.AI_PROVIDER;
  const all = [anthropicProvider, openaiProvider];
  if (want) { const p = all.find((x) => x.name === want); return p?.isConfigured() ? p : null; }
  return all.find((p) => p.isConfigured()) ?? null;
}

export function aiStatus() {
  return { anthropic: anthropicProvider.isConfigured(), openai: openaiProvider.isConfigured(), active: getLlmProvider()?.name ?? null, model: getLlmProvider()?.model ?? null };
}
