"use client";
import * as React from "react";

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height }; };
  const start = (e: React.PointerEvent) => { drawing.current = true; const c = ref.current!.getContext("2d")!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); ref.current!.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const c = ref.current!.getContext("2d")!; c.lineWidth = 3; c.lineCap = "round"; c.strokeStyle = "#0f172a"; const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); dirty.current = true; };
  const end = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL("image/png")); };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); };

  return (
    <div>
      <canvas ref={ref} width={600} height={220} className="w-full touch-none rounded-lg border border-line bg-white" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} aria-label="Signature pad" />
      <button type="button" className="mt-1 text-xs font-medium text-brand" onClick={clear}>Clear signature</button>
    </div>
  );
}
