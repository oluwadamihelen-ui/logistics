"use server";
import { z } from "zod";
import { requireTenant } from "@/lib/platform/context";
import { toFailure, type ActionResult } from "@/lib/platform/errors";
import { askAssistant, confirmProposal, type AssistantReply } from "@/lib/logistics/ai-assistant";

export async function askAction(raw: { text: string; conversationId?: string | null }): Promise<ActionResult<AssistantReply>> {
  try {
    const ctx = await requireTenant("ai.use");
    const i = z.object({ text: z.string().min(1).max(2000), conversationId: z.string().nullish() }).parse(raw);
    return { ok: true, data: await askAssistant(ctx, i.text, i.conversationId) };
  } catch (e) { return toFailure(e); }
}
export async function confirmAction(raw: { messageId: string; proposalId: string; approve: boolean }): Promise<ActionResult<{ status: string; result?: unknown }>> {
  try {
    const ctx = await requireTenant("ai.use");
    const i = z.object({ messageId: z.string(), proposalId: z.string(), approve: z.boolean() }).parse(raw);
    return { ok: true, data: await confirmProposal(ctx, i.messageId, i.proposalId, i.approve) };
  } catch (e) { return toFailure(e); }
}
