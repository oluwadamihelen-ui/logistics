import { cn, timeOnly, dateOnly } from "@/lib/utils/format";

export interface TimelineItem { id?: string; at: Date | string; text: string; tone?: "default" | "success" | "danger" | "warning"; meta?: string }

export function Timeline({ items, tz, newestFirst = false }: { items: TimelineItem[]; tz?: string; newestFirst?: boolean }) {
  const list = newestFirst ? [...items].reverse() : items;
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {list.map((i, idx) => (
        <li key={i.id ?? idx} className="relative">
          <span className={cn("absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-white", i.tone === "success" ? "bg-emerald-500" : i.tone === "danger" ? "bg-red-500" : i.tone === "warning" ? "bg-amber-500" : "bg-brand")} />
          <p className="text-sm text-ink">{i.text}</p>
          <p className="text-xs text-slate-500">{dateOnly(i.at, tz)} · {timeOnly(i.at, tz)}{i.meta ? ` · ${i.meta}` : ""}</p>
        </li>
      ))}
    </ol>
  );
}
