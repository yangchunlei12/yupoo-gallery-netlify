import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36";
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function orderedImages(html: string) {
  const result: Array<{ sourceUrl: string; sourceNumber: string }> = [];
  for (const tagMatch of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const source = tag.match(/data-origin-src=["'](https:\/\/photo\.yupoo\.com\/[^"']+)["']/i)?.[1];
    if (!source) continue;
    const alt = decode(tag.match(/alt=["']([^"']*)["']/i)?.[1] || "");
    const number = alt.match(/(?:^|\s)(\d{1,3})(?=[,._-]*(?:jpe?g|png|webp)(?:\.[a-z0-9]+)?\s*$)/i)?.[1];
    result.push({ sourceUrl: decode(source), sourceNumber: number ? number.padStart(2, "0") : "" });
  }
  return result.filter((item, index, all) => all.findIndex((other) => other.sourceUrl === item.sourceUrl) === index);
}

export default async (_req: Request, context: Context) => {
  const store = galleryStore(context);
  const startedAt = new Date().toISOString();
  const manifest = await store.get("manifest.json", { type: "json" }) as any[] | null;
  if (!manifest) throw new Error("Manifest not found");
  await store.setJSON("rekey-status.json", { state: "running", startedAt, albumsFound: manifest.length, albumsCompleted: 0, imagesRekeyed: 0, errors: [] });

  let completed = 0;
  let imagesRekeyed = 0;
  const errors: string[] = [];
  const site = context.site.url.replace(/\/$/, "");

  for (const album of manifest) {
    try {
      const response = await fetch(album.sourceAlbumUrl, { headers: { "user-agent": UA } });
      if (!response.ok) throw new Error(`Album fetch ${response.status}`);
      const visual = orderedImages(await response.text()).map((item, visualIndex) => ({ ...item, visualIndex }));
      const desired = visual.sort((a, b) => {
        const an = a.sourceNumber ? Number(a.sourceNumber) : (a.visualIndex === 0 ? -1 : Number.MAX_SAFE_INTEGER);
        const bn = b.sourceNumber ? Number(b.sourceNumber) : (b.visualIndex === 0 ? -1 : Number.MAX_SAFE_INTEGER);
        return an - bn || a.visualIndex - b.visualIndex;
      });
      const existingBySource = new Map(album.images.map((image: any) => [image.sourceUrl, image]));
      if (desired.length !== album.images.length) throw new Error(`Image count mismatch ${desired.length}/${album.images.length}`);

      const loaded = await Promise.all(desired.map(async (item, index) => {
        const existing: any = existingBySource.get(item.sourceUrl);
        if (!existing) throw new Error(`Missing source image ${item.sourceUrl}`);
        const bytes = await store.get(existing.key, { type: "arrayBuffer" });
        if (!bytes) throw new Error(`Missing blob ${existing.key}`);
        return { ...item, bytes, displayIndex: index + 1 };
      }));

      const rewritten = [];
      for (const item of loaded) {
        const label = String(item.displayIndex).padStart(2, "0");
        const key = `albums/${album.id}/${label}.jpg`;
        await store.set(key, item.bytes);
        rewritten.push({ index: item.displayIndex, key, sourceUrl: item.sourceUrl, sourceNumber: item.sourceNumber || null });
        imagesRekeyed++;
      }
      album.images = rewritten;
      album.firstImageUrl = rewritten[0] ? `${site}/image?key=${encodeURIComponent(rewritten[0].key)}` : "";
      album.otherImageUrls = rewritten.slice(1).map((image: any) => `${site}/image?key=${encodeURIComponent(image.key)}`);
    } catch (error) {
      errors.push(`${album.id}: ${String(error)}`);
    }
    completed++;
    if (completed % 5 === 0 || completed === manifest.length) {
      await store.setJSON("rekey-status.json", { state: "running", startedAt, albumsFound: manifest.length, albumsCompleted: completed, imagesRekeyed, errors });
    }
  }

  await store.setJSON("manifest.json", manifest);
  const csv = ["album_id,product_name,image_count,source_album_url,first_image_url,other_image_urls,import_status", ...manifest.map((album) => [album.id, album.title, album.images.length, album.sourceAlbumUrl, album.firstImageUrl, album.otherImageUrls.join(" | "), album.error ? `Error: ${album.error}` : "Complete"].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
  await store.set("manifest.csv", csv);
  await store.setJSON("rekey-status.json", { state: errors.length ? "complete_with_errors" : "complete", startedAt, completedAt: new Date().toISOString(), albumsFound: manifest.length, albumsCompleted: completed, imagesRekeyed, errors });
};

export const config: Config = { path: "/api/rekey" };
