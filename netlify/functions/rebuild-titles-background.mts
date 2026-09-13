import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";

const CATEGORY = "https://lol2021.x.yupoo.com/categories/5324415";
const PAGES = [1];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36";
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g, (_m,d)=>String.fromCodePoint(Number(d))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function titlesFrom(html: string) {
  const found = new Map<string,string>();
  for (const m of html.matchAll(/<a\b([^>]*\bhref=["'][^"']*\/albums\/(\d+)[^"']*["'][^>]*)>/gi)) {
    const title = m[1].match(/\btitle=["']([\s\S]*?)["']/i)?.[1];
    if (title) found.set(m[2], decode(title).replace(/\s+/g," ").trim());
  }
  return found;
}

export default async (_req: Request, context: Context) => {
  const store = galleryStore(context);
  const status = (await store.get("status.json", {type:"json"})) || {};
  await store.setJSON("status.json", {...status, state:"rebuilding_titles"});
  const pages = await Promise.all(PAGES.map(async page => {
    const r = await fetch(`${CATEGORY}?page=${page}`, {headers:{"user-agent":UA}});
    if (!r.ok) throw new Error(`${r.status} page ${page}`);
    return r.text();
  }));
  const names = new Map<string,string>();
  pages.forEach(html => titlesFrom(html).forEach((v,k)=>names.set(k,v)));
  const manifest: any[] = (await store.get("manifest.json", {type:"json"})) || [];
  const updated = manifest.map(r => ({...r, title:names.get(String(r.id)) || r.title}));
  await store.setJSON("manifest.json", updated);
  const csv = ["album_id,product_name,source_album_url,first_image_url,other_image_urls", ...updated.map((r) => [r.id,r.title,r.sourceAlbumUrl,r.firstImageUrl,r.otherImageUrls.join(" | ")].map((v) => `"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
  await store.set("manifest.csv", csv);
  await store.setJSON("status.json", {...status, state:"complete", titlesUpdated:names.size, completedAt:status.completedAt || new Date().toISOString()});
};

export const config: Config = { path: "/api/rebuild-titles" };
