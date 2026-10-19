import { readFileSync } from "node:fs";
import path from "node:path";
import { marked, Renderer } from "marked";

export interface DocMeta { slug: string; title: string; category: string; description: string; updated: string }

/** Documentation pages. `category` matches the wording marketplaces use for documentation links. */
export const DOCS: DocMeta[] = [
  { slug: "product-documentation", title: "Product documentation", category: "Product documentation", description: "What LogisticOS does, the shipment lifecycle, roles, plans, security and integrations.", updated: "19 October 2026" },
  { slug: "installation-guide", title: "Installation guide", category: "Installation guides", description: "Install locally, then deploy to Vercel and Neon, Docker or any Node server.", updated: "19 October 2026" },
  { slug: "user-manual", title: "User manual", category: "User manuals", description: "Day-to-day use for staff, dispatchers, drivers, accountants and customers.", updated: "19 October 2026" },
  { slug: "tutorials", title: "Tutorials", category: "Tutorials", description: "Step-by-step walkthroughs: first delivery, pricing, hub pickup, COD, driver app, API and billing.", updated: "19 October 2026" },
  { slug: "release-notes", title: "Release notes", category: "Release notes", description: "What is in each version, and known limitations.", updated: "19 October 2026" },
  { slug: "software-update-information", title: "Software update information", category: "Software update information", description: "Versioning, backups, how to update, migrations, rolling back.", updated: "19 October 2026" },
  { slug: "developer-resources", title: "Developer resources", category: "Developer resources", description: "Architecture, conventions, extension points, testing and the driver app wrapper.", updated: "19 October 2026" },
  { slug: "api-reference", title: "API reference", category: "Developer resources", description: "REST endpoints, fields, errors and webhook signature verification.", updated: "19 October 2026" },
];

export const getDoc = (slug: string) => DOCS.find((d) => d.slug === slug) ?? null;

const slugify = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Heading { id: string; text: string; depth: number }

/** Reads a Markdown page and returns trusted HTML (our own content) plus a table of contents. */
export function renderDoc(slug: string): { html: string; headings: Heading[] } {
  const src = readFileSync(path.join(process.cwd(), "content", "docs", `${slug}.md`), "utf8");
  const headings: Heading[] = [];
  const renderer = new Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = slugify(text);
    if (depth === 2 || depth === 3) headings.push({ id, text: text.replace(/<[^>]+>/g, ""), depth });
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  renderer.table = function (token) {
    const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
    const body = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
  };
  const html = marked.parse(src, { renderer, gfm: true, async: false }) as string;
  return { html, headings };
}
