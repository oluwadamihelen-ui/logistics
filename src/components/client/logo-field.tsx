"use client";
import * as React from "react";

/** Logo picker: stores a small (≤200KB) PNG/JPEG/WebP as a data URL, or accepts an https URL. */
export function LogoField({ current }: { current?: string | null }) {
  const [val, setVal] = React.useState(current ?? "");
  const [err, setErr] = React.useState<string | null>(null);
  async function onFile(f?: File) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setErr("Use a PNG, JPEG or WebP image.");
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    setErr(null); setVal(c.toDataURL("image/webp", 0.85));
  }
  return (
    <div className="flex items-center gap-4">
      {val ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={val} alt="Company logo" className="h-14 w-14 rounded-lg border border-line object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line text-xs text-slate-400">Logo</div>}
      <div><label className="label" htmlFor="logoFile">Company logo</label><input id="logoFile" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />{err && <p className="text-xs text-red-600">{err}</p>}</div>
      <input type="hidden" name="logoUrl" value={val} />
    </div>
  );
}
