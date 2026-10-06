import { NotConfigured, PageHeader } from "@/components/ui";
import { AssistantChat } from "@/components/client/assistant-chat";
import { requirePageContext } from "@/lib/platform/context";
import { getEntitlements } from "@/lib/platform/entitlements";
import { aiStatus } from "@/lib/platform/ai/provider";
import { toolsFor } from "@/lib/logistics/ai-tools";

export const metadata = { title: "AI assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("ai.use");
  const [ent, status] = [await getEntitlements(ctx.companyId), aiStatus()];
  if (!ent.features.has("ai_assistant")) return <><PageHeader title="AI assistant" /><NotConfigured title="Not included in your plan" description="The AI assistant is available on Professional and above." /></>;
  const names = new Set(toolsFor(ctx).map((t) => t.name));
  const suggestions = [
    names.has("list_shipments") && "Show me today's undelivered shipments", names.has("get_driver_performance") && "Which drivers have the highest failed delivery rate this month?",
    names.has("get_cod_balance") && "How much COD is currently outstanding?", names.has("identify_operational_anomalies") && "Are there any operational anomalies I should know about?",
    names.has("get_failed_deliveries") && "Why are deliveries failing and what should we do?", names.has("forecast_shipment_volume") && "Forecast shipment volume for next week",
  ].filter(Boolean) as string[];
  const convo = sp.c ? await ctx.db.aIConversation.findFirst({ where: { id: sp.c, userId: ctx.user.id }, include: { messages: { where: { role: { in: ["USER", "ASSISTANT"] } }, orderBy: { createdAt: "asc" } } } }) : null;
  const recent = await ctx.db.aIConversation.findMany({ where: { userId: ctx.user.id }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, title: true } });
  return (
    <>
      <PageHeader title="AI assistant" subtitle={status.active ? `Powered by ${status.active} · answers are drawn from your live data, limited to what your role can see` : "Not configured"} />
      {!status.active ? <NotConfigured title="AI provider not configured" description="No API key was found on the server, so the assistant is disabled. Nothing is simulated." steps={["Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the server environment", "Optionally set AI_PROVIDER=anthropic|openai", "Restart the server"]} /> : (
        <div className="grid gap-4 lg:grid-cols-4">
          <aside className="space-y-1 lg:col-span-1"><p className="text-xs font-semibold uppercase text-slate-500">Recent</p>{recent.map((c) => <a key={c.id} href={`/assistant?c=${c.id}`} className="block truncate rounded-lg px-3 py-2 text-sm hover:bg-slate-100">{c.title ?? "Conversation"}</a>)}<a href="/assistant" className="btn-secondary mt-2 w-full">New chat</a></aside>
          <div className="lg:col-span-3"><AssistantChat key={convo?.id ?? "new"} suggestions={suggestions} conversationId={convo?.id ?? null} initial={(convo?.messages ?? []).map((m) => ({ role: m.role === "USER" ? "user" as const : "assistant" as const, text: m.content, messageId: m.id, proposals: (m.toolCalls as any)?.proposals, tools: ((m.toolCalls as any)?.trace ?? []).map((t: any) => t.tool) }))} /></div>
        </div>)}
    </>
  );
}
