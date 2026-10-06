"use client";
import * as React from "react";
import { cn } from "@/lib/utils/format";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };
const Ctx = React.createContext<{ push: (kind: Toast["kind"], message: string) => void }>({ push: () => undefined });

export function useToast() {
  return React.useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg", t.kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900", t.kind === "error" && "border-red-200 bg-red-50 text-red-900", t.kind === "info" && "border-blue-200 bg-blue-50 text-blue-900")}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
