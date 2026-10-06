"use client";
import * as React from "react";
import { askAction, confirmAction } from "@/app/(app)/assistant/actions";
import { useToast } from "./toast";

interface Proposal { id: string; summary: string; status: string }
interface Msg { role: "user" | "assistant"; text: string; messageId?: string; proposals?: Proposal[]; tools?: string[] }

export function AssistantChat({ suggestions, initial, conversationId: initialConvo }: { suggestions: string[]; initial: Msg[]; conversationId: string | null }) {
  const toast = useToast();
  const [msgs, setMsgs] = React.useState<Msg[]>(initial);
  const [convo, setConvo] = React.useState<string | null>(initialConvo);
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    const r = await askAction({ text, conversationId: convo });
    setBusy(false);
    if (!r.ok) { setMsgs((m) => [...m, { role: "assistant", text: `⚠ ${r.error}` }]); return; }
    setConvo(r.data.conversationId);
    setMsgs((m) => [...m, { role: "assistant", text: r.data.text, messageId: r.data.messageId, proposals: r.data.proposals, tools: r.data.trace.map((t) => `${t.tool}${t.ok ? "" : " ✗"}`) }]);
  }
  async function decide(mi: number, p: Proposal, approve: boolean) {
    const m = msgs[mi];
    const r = await confirmAction({ messageId: m.messageId!, proposalId: p.id, approve });
    if (!r.ok) { toast.push("error", r.error); setMsgs((all) => all.map((x, i) => i === mi ? { ...x, proposals: x.proposals?.map((q) => q.id === p.id ? { ...q, status: "failed" } : q) } : x)); return; }
    toast.push("success", approve ? "Action executed" : "Action dismissed");
    setMsgs((all) => all.map((x, i) => i === mi ? { ...x, proposals: x.proposals?.map((q) => q.id === p.id ? { ...q, status: r.data.status } : q) } : x));
  }

  return (
    <div className="card flex h-[72vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
        {msgs.length === 0 && (
          <div className="py-8 text-center"><p className="text-sm text-slate-500">Ask about shipments, drivers, COD or performance. Answers come from your live data.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">{suggestions.map((s) => <button key={s} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" onClick={() => send(s)}>{s}</button>)}</div></div>)}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-brand text-white" : "bg-slate-100 text-ink"}`}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.tools && m.tools.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Data used: {m.tools.join(", ")}</p>}
              {m.proposals?.map((p) => (
                <div key={p.id} className="mt-3 rounded-lg border border-line bg-white p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Proposed action</p><p className="text-sm">{p.summary}</p>
                  {p.status === "pending" ? <div className="mt-2 flex gap-2"><button className="btn-primary btn-sm" onClick={() => decide(i, p, true)}>Confirm</button><button className="btn-secondary btn-sm" onClick={() => decide(i, p, false)}>Dismiss</button></div> : <p className="mt-1 text-xs font-medium text-slate-500">{p.status === "executed" ? "✓ Executed" : p.status === "rejected" ? "Dismissed" : "Failed — see notification"}</p>}
                </div>))}
            </div>
          </div>))}
        {busy && <div className="flex justify-start"><div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500">Looking at your data…</div></div>}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const v = (f.elements.namedItem("q") as HTMLInputElement).value; f.reset(); void send(v); }}>
        <input name="q" className="input" placeholder="Ask anything about your operations…" maxLength={2000} autoComplete="off" aria-label="Message" disabled={busy} />
        <button className="btn-primary" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
