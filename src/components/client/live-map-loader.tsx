"use client";
import dynamic from "next/dynamic";
const LiveMap = dynamic(() => import("./live-map"), { ssr: false, loading: () => <div className="h-[68vh] animate-pulse rounded-xl bg-slate-200" /> });
export function LiveMapLoader({ attribution }: { attribution: string }) { return <LiveMap attribution={attribution} />; }
