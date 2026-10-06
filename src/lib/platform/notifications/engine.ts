/**
 * Centralised notification engine.
 *
 *   EVENT → RULE → AFFECTED USERS → PERMISSION CHECK → PRIORITY → PREFERENCES/CHANNELS
 *         → DEDUPLICATION → PERSIST → DELIVERY
 *
 * Domain code never writes notifications directly; it calls `emit()`.
 */
import type { Channel, NotificationCategory, NotificationPriority, Role } from "@prisma/client";
import { permissionsFor, type Permission } from "../permissions";
import type { ServiceCtx } from "../service";
import { EVENT_RULES, PRIORITY_CHANNELS, type EventType } from "./rules";
import { getProvider } from "./providers";

export interface DomainEvent {
  type: EventType;
  title: string;
  body: string;
  entity?: { type: string; id: string };
  actionUrl?: string;
  /** Branch the event belongs to — branch-scoped roles only see their own branch. */
  branchId?: string | null;
  /** Explicit recipients (e.g. the assigned driver's user). Still permission/tenant checked. */
  userIds?: string[];
  dedupeKey?: string;
  priority?: NotificationPriority;
  category?: NotificationCategory;
  aiGenerated?: boolean;
  /** Override the rule's dedupe window (minutes). */
  dedupeMinutes?: number;
}

const BRANCH_SCOPED: Role[] = ["BRANCH_MANAGER", "WAREHOUSE_STAFF"];
const PRIORITY_RANK: Record<NotificationPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

export interface EmitResult { created: number; skippedDuplicates: number; recipients: number }

export async function emit(svc: Pick<ServiceCtx, "db" | "companyId">, event: DomainEvent): Promise<EmitResult> {
  const rule = EVENT_RULES[event.type];
  const priority = event.priority ?? rule.priority;
  const category = event.category ?? rule.category;
  const { db } = svc;

  // 1+2. Affected users
  const users = await db.user.findMany({
    where: {
      isActive: true,
      role: { notIn: ["CUSTOMER", "SENDER", "RECIPIENT", "PLATFORM_SUPER_ADMIN"] },
    },
    select: { id: true, email: true, phone: true, role: true, branchId: true, extraPermissions: true, deniedPermissions: true },
  });

  const explicit = new Set(event.userIds ?? []);
  const audience = users.filter((u) => {
    // 3. permission check — also applies to explicitly addressed users
    const perms = permissionsFor({ role: u.role, extraPermissions: u.extraPermissions, deniedPermissions: u.deniedPermissions });
    const isExplicit = explicit.has(u.id);
    if (explicit.size && !isExplicit) {
      // explicit audience given: only those (plus nobody else) — e.g. driver-targeted alerts
      return false;
    }
    if (!explicit.size && !perms.has(rule.permission as Permission)) return false;
    if (!explicit.size && event.branchId && BRANCH_SCOPED.includes(u.role) && u.branchId && u.branchId !== event.branchId) return false;
    return true;
  });
  if (!audience.length) return { created: 0, skippedDuplicates: 0, recipients: 0 };

  // Preferences + company channels
  const [prefs, settings] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId: { in: audience.map((u) => u.id) }, category } }),
    db.companySettings.findFirst({ select: { enabledChannels: true } }),
  ]);
  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
  const companyChannels = new Set<Channel>(settings?.enabledChannels ?? ["IN_APP"]);
  companyChannels.add("IN_APP");

  // 5. Deduplication
  const dedupeKey = event.dedupeKey ?? (event.entity ? `${event.type}:${event.entity.id}` : undefined);
  let recentSet = new Set<string>();
  const windowMin = event.dedupeMinutes ?? rule.dedupeMinutes;
  if (dedupeKey && windowMin > 0) {
    const since = new Date(Date.now() - windowMin * 60_000);
    const recent = await db.notification.findMany({
      where: { userId: { in: audience.map((u) => u.id) }, dedupeKey, createdAt: { gte: since } },
      select: { userId: true },
    });
    recentSet = new Set(recent.map((r) => r.userId));
  }

  const toCreate: { u: (typeof audience)[number]; channels: Channel[] }[] = [];
  let skipped = 0;
  for (const u of audience) {
    if (recentSet.has(u.id)) { skipped++; continue; }
    const pref = prefByUser.get(u.id);
    if (pref?.muted && priority !== "CRITICAL") continue;
    const wanted = (pref?.channels?.length ? pref.channels : PRIORITY_CHANNELS[priority]) as Channel[];
    const channels = Array.from(new Set<Channel>(["IN_APP", ...wanted])).filter((c) => companyChannels.has(c));
    toCreate.push({ u, channels });
  }
  if (!toCreate.length) return { created: 0, skippedDuplicates: skipped, recipients: audience.length };

  // 6. Persist
  const created = await db.notification.createManyAndReturn({
    data: toCreate.map(({ u }) => ({
      userId: u.id,
      category,
      priority,
      title: event.title,
      body: event.body,
      entityType: event.entity?.type,
      entityId: event.entity?.id,
      actionUrl: event.actionUrl,
      dedupeKey,
      isAiGenerated: event.aiGenerated ?? false,
    })) as any,
  });

  // 7. Delivery — IN_APP is the persisted row itself; other channels go through providers.
  const byUser = new Map(toCreate.map((t) => [t.u.id, t]));
  for (const n of created) {
    const t = byUser.get(n.userId);
    if (!t) continue;
    for (const channel of t.channels) {
      if (channel === "IN_APP") continue;
      const provider = getProvider(channel);
      const to = channel === "EMAIL" ? t.u.email : t.u.phone;
      if (!provider || !provider.isConfigured() || !to) {
        await db.notificationDelivery.create({
          data: { notificationId: n.id, channel, state: "SKIPPED", error: !provider || !provider.isConfigured() ? "provider not configured" : "no destination" } as any,
        }).catch(() => undefined);
        continue;
      }
      try {
        await provider.send({ to, subject: event.title, body: event.body });
        await db.notificationDelivery.create({ data: { notificationId: n.id, channel, state: "SENT", sentAt: new Date() } as any });
      } catch (e) {
        await db.notificationDelivery.create({
          data: { notificationId: n.id, channel, state: "FAILED", error: (e instanceof Error ? e.message : "send failed").slice(0, 200) } as any,
        }).catch(() => undefined);
      }
    }
  }
  return { created: created.length, skippedDuplicates: skipped, recipients: audience.length };
}

/** Safe wrapper: notification problems must never fail the business operation that triggered them. */
export async function emitSafe(svc: Pick<ServiceCtx, "db" | "companyId">, event: DomainEvent): Promise<void> {
  try {
    await emit(svc, event);
  } catch (e) {
    console.error("[notifications] emit failed", event.type, e instanceof Error ? e.message : e);
  }
}

export { PRIORITY_RANK };
