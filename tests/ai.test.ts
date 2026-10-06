import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "@/lib/platform/db";
import { setLlmProvider, type ChatMsg, type LlmProvider } from "@/lib/platform/ai/provider";
import { askAssistant, confirmProposal, generateInsights } from "@/lib/logistics/ai-assistant";
import { toolsFor } from "@/lib/logistics/ai-tools";
import { createShipment, transitionShipment } from "@/lib/logistics/shipments";
import { ctxFor, makeTenant, shipmentInput, type TestTenant } from "./helpers";

let A: TestTenant, B: TestTenant;
let shipA: { id: string; trackingNumber: string }, shipB: { id: string; trackingNumber: string };

/** Scripted stand-in for an LLM: plays a fixed list of tool calls, then returns a final text. Records what it was offered/received. */
function script(calls: { name: string; args: any }[], final = "done"): LlmProvider & { offered: string[]; toolResults: string[] } {
  let step = 0;
  const p: any = {
    name: "anthropic", model: "fake", offered: [] as string[], toolResults: [] as string[], isConfigured: () => true,
    async chat({ messages, tools }: { messages: ChatMsg[]; tools?: { name: string }[] }) {
      if (!p.offered.length) p.offered.push(...(tools ?? []).map((t) => t.name));
      const last = messages[messages.length - 1];
      if (last.role === "tool") p.toolResults.push(...last.results.map((r) => r.content));
      if (step < calls.length) { const c = calls[step++]; return { text: "", toolCalls: [{ id: `c${step}`, name: c.name, args: c.args }], stop: "tool" }; }
      return { text: final, toolCalls: [], stop: "end" };
    },
  };
  return p;
}

beforeAll(async () => {
  A = await makeTenant("AiA"); B = await makeTenant("AiB");
  shipA = await createShipment(A.svc, shipmentInput({ customerId: A.customerId }));
  shipB = await createShipment(B.svc, shipmentInput({ customerId: B.customerId, recipientName: "Secret Bravo Person" }));
  await transitionShipment(A.svc, shipA.id, "CONFIRMED");
});
afterEach(() => setLlmProvider(null));

describe("AI assistant — configuration & gating", () => {
  it("reports not-configured instead of faking an answer", async () => {
    const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };
    delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
    const ctx = await ctxFor(A, "COMPANY_OWNER");
    await expect(askAssistant(ctx, "hello")).rejects.toThrow(/isn't configured/);
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a; if (saved.o) process.env.OPENAI_API_KEY = saved.o;
  });
  it("requires the ai.use permission", async () => {
    setLlmProvider(script([]));
    await expect(askAssistant(await ctxFor(A, "SALES_STAFF"), "hi")).rejects.toThrow(/permission/);
  });
  it("requires the plan feature", async () => {
    const S = await makeTenant("AiStarter", "starter");
    setLlmProvider(script([]));
    await expect(askAssistant(await ctxFor(S, "COMPANY_OWNER"), "hi")).rejects.toThrow(/plan/i);
  });
});

describe("AI assistant — permission enforcement", () => {
  it("the model is only offered tools the user may use", async () => {
    const cs = toolsFor(await ctxFor(A, "CUSTOMER_SERVICE")).map((t) => t.name);
    expect(cs).toContain("get_shipment");
    expect(cs).not.toContain("get_customer_balance"); // needs finance.view
    expect(cs).not.toContain("get_driver_performance");
    expect(cs).not.toContain("assign_driver"); // needs shipments.assign
    const acct = toolsFor(await ctxFor(A, "ACCOUNTANT")).map((t) => t.name);
    expect(acct).toContain("get_customer_balance");
    expect(acct).not.toContain("create_shipment");
  });

  it("a tool call outside the user's permissions is refused server-side even if the model asks for it", async () => {
    const p = script([{ name: "get_customer_balance", args: { query: "Acme" } }, { name: "assign_driver", args: { tracking: shipA.trackingNumber, driver: "Test" } }]);
    setLlmProvider(p);
    const ctx = await ctxFor(A, "CUSTOMER_SERVICE");
    const r = await askAssistant(ctx, "what does Acme owe?");
    expect(r.trace.map((t) => [t.tool, t.ok])).toEqual([["get_customer_balance", false], ["assign_driver", false]]);
    expect(p.toolResults.every((x) => x.includes("permission"))).toBe(true);
    expect(r.proposals).toHaveLength(0);
  });

  it("per-user revoked permissions remove tools", async () => {
    const t = toolsFor(await ctxFor(A, "COMPANY_OWNER", { denied: ["finance.view"] })).map((x) => x.name);
    expect(t).not.toContain("get_customer_balance");
  });
});

describe("AI assistant — tenant isolation", () => {
  it("cannot look up another tenant's shipment, even by exact tracking number", async () => {
    const p = script([{ name: "get_shipment", args: { query: shipB.trackingNumber } }]);
    setLlmProvider(p);
    const r = await askAssistant(await ctxFor(A, "COMPANY_OWNER"), `where is ${shipB.trackingNumber}?`);
    expect(r.trace[0]).toMatchObject({ tool: "get_shipment", ok: false });
    expect(p.toolResults.join()).not.toContain("Secret Bravo Person");
  });
  it("list tools only return the caller's tenant", async () => {
    const p = script([{ name: "list_shipments", args: { filter: "undelivered", limit: 25 } }]);
    setLlmProvider(p);
    await askAssistant(await ctxFor(A, "COMPANY_OWNER"), "undelivered?");
    expect(p.toolResults.join()).toContain(shipA.trackingNumber);
    expect(p.toolResults.join()).not.toContain(shipB.trackingNumber);
  });
  it("conversations are private to their user and tenant", async () => {
    setLlmProvider(script([], "hello"));
    const u1 = await ctxFor(A, "COMPANY_OWNER"); const u2 = await ctxFor(A, "COMPANY_ADMIN"); const b1 = await ctxFor(B, "COMPANY_OWNER");
    const r = await askAssistant(u1, "hi");
    await expect(askAssistant(u2, "hi again", r.conversationId)).rejects.toThrow(/not found/i);
    await expect(askAssistant(b1, "hi again", r.conversationId)).rejects.toThrow(/not found/i);
  });
});

describe("AI assistant — writes are proposals until a human confirms", () => {
  it("proposal doesn't change data; confirm executes once; others can't confirm", async () => {
    setLlmProvider(script([{ name: "assign_driver", args: { tracking: shipA.trackingNumber, driver: "Test Driver" } }], "Prepared the assignment for review."));
    const ctx = await ctxFor(A, "DISPATCH_MANAGER");
    const r = await askAssistant(ctx, `assign ${shipA.trackingNumber} to Test Driver`);
    expect(r.proposals).toHaveLength(1);
    expect((await prisma.shipment.findUnique({ where: { id: shipA.id } }))?.driverId).toBeNull(); // nothing happened yet

    const intruder = await ctxFor(A, "DISPATCH_MANAGER");
    await expect(confirmProposal(intruder, r.messageId, r.proposals[0].id, true)).rejects.toThrow(/not found/i);

    const done = await confirmProposal(ctx, r.messageId, r.proposals[0].id, true);
    expect(done.status).toBe("executed");
    expect((await prisma.shipment.findUnique({ where: { id: shipA.id } }))?.driverId).toBe(A.driverId);
    await expect(confirmProposal(ctx, r.messageId, r.proposals[0].id, true)).rejects.toThrow(/already/);
    expect(await prisma.auditLog.count({ where: { companyId: A.companyId, action: "ai.action_executed" } })).toBeGreaterThan(0);
  });

  it("confirmation re-checks permissions at execution time", async () => {
    setLlmProvider(script([{ name: "reschedule_delivery", args: { tracking: shipA.trackingNumber, date: new Date(Date.now() + 86400_000).toISOString() } }]));
    const ctx = await ctxFor(A, "DISPATCH_MANAGER");
    const r = await askAssistant(ctx, "reschedule it");
    const revoked = { ...ctx, can: () => false, require: () => { throw new Error("FORBIDDEN"); } } as any; // permission revoked in between
    await expect(confirmProposal(revoked, r.messageId, r.proposals[0].id, true)).rejects.toThrow();
  });

  it("dismissing a proposal executes nothing", async () => {
    setLlmProvider(script([{ name: "assign_driver", args: { tracking: shipA.trackingNumber, driver: "Test Driver" } }]));
    const ctx = await ctxFor(A, "DISPATCH_MANAGER");
    const r = await askAssistant(ctx, "assign");
    expect((await confirmProposal(ctx, r.messageId, r.proposals[0].id, false)).status).toBe("rejected");
  });

  it("invalid tool arguments are rejected, not executed", async () => {
    setLlmProvider(script([{ name: "get_delivery_statistics", args: { days: 99999 } }]));
    const r = await askAssistant(await ctxFor(A, "COMPANY_OWNER"), "stats");
    expect(r.trace[0].ok).toBe(false);
  });
});

describe("AI insights", () => {
  it("says nothing (no filler insights) when there is not enough data", async () => {
    const E = await makeTenant("AiEmpty");
    setLlmProvider(script([], '{"insights":[{"analysis":"made up","recommendation":"made up"}]}'));
    const out = await generateInsights(await ctxFor(E, "COMPANY_OWNER"), { withAi: true });
    expect(out.facts.anomalies).toHaveLength(0);
    expect(out.ai).toBeNull();
    expect(out.aiStatus).toBe("insufficient_data");
    expect(out.facts.insufficientData.length).toBeGreaterThan(0);
    expect(out.forecast.available).toBe(false);
  });
  it("without a provider only real-data facts are returned", async () => {
    const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };
    delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
    const out = await generateInsights(await ctxFor(A, "COMPANY_OWNER"), { withAi: true });
    expect(out.ai).toBeNull(); expect(out.aiStatus).toBe("not_configured");
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a; if (saved.o) process.env.OPENAI_API_KEY = saved.o;
  });
});
