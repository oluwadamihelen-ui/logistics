"use client";
/** Charts follow the dataviz method: fixed-order categorical hues, thin marks, recessive grid, legend + tooltip. */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const SERIES = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a" } as const;
const GRID = "#e5e7eb";
const AXIS = { fontSize: 11, fill: "#64748b" };

const fmtDay = (d: string) => { const [, m, day] = d.split("-"); return `${day}/${m}`; };

export function VolumeChart({ data }: { data: { day: string; created: number; delivered: number; failed: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Shipments created, delivered and failed attempts per day">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={(l) => fmtDay(String(l))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="created" name="Created" stroke={SERIES.blue} fill={SERIES.blue} fillOpacity={0.08} strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="delivered" name="Delivered" stroke={SERIES.aqua} fill={SERIES.aqua} fillOpacity={0.08} strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="failed" name="Failed attempts" stroke={SERIES.orange} fill={SERIES.orange} fillOpacity={0.08} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChart({ data, currency }: { data: { day: string; revenue: number }[]; currency: string }) {
  const f = (v: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
  return (
    <div className="h-64 w-full" role="img" aria-label="Delivery revenue per day">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={f} tick={AXIS} tickLine={false} axisLine={false} width={56} />
          <Tooltip formatter={(v) => [f(Number(v)), "Revenue"]} labelFormatter={(l) => fmtDay(String(l))} contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: "rgba(15,98,254,0.06)" }} />
          <Bar dataKey="revenue" name="Revenue" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({ data, dataKey = "count", color = SERIES.orange, label }: { data: { name: string; [k: string]: string | number }[]; dataKey?: string; color?: string; label: string }) {
  return (
    <div className="w-full" style={{ height: Math.max(120, data.length * 34 + 24) }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={120} tick={{ ...AXIS, fill: "#334155" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedPerfChart({ data, label }: { data: { name: string; delivered: number; failed: number }[]; label: string }) {
  return (
    <div className="w-full" style={{ height: Math.max(140, data.length * 36 + 40) }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ ...AXIS, fill: "#334155" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="delivered" name="Delivered" stackId="a" fill={SERIES.aqua} maxBarSize={18} stroke="#fff" strokeWidth={2} />
          <Bar dataKey="failed" name="Failed" stackId="a" fill={SERIES.orange} radius={[0, 4, 4, 0]} maxBarSize={18} stroke="#fff" strokeWidth={2} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
