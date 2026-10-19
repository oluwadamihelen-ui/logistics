import { describe, it, expect } from "vitest";
import { DOCS, renderDoc } from "@/lib/docs";

describe("documentation site", () => {
  const slugs = new Set(DOCS.map((d) => d.slug));

  it("renders every page with headings", () => {
    for (const d of DOCS) {
      const { html, headings } = renderDoc(d.slug);
      expect(html.length, d.slug).toBeGreaterThan(500);
      expect(headings.length, d.slug).toBeGreaterThan(1);
    }
  });

  it("internal /docs links resolve", () => {
    for (const d of DOCS) {
      const { html } = renderDoc(d.slug);
      for (const m of html.matchAll(/href="\/docs\/([a-z0-9-]+)(?:#[^"]*)?"/g)) {
        expect(slugs.has(m[1]), `${d.slug} -> ${m[1]}`).toBe(true);
      }
    }
  });
});
