import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";
import sourceAlbums from "./_shared/import-source.json";

const CATEGORIES = [
  "https://lol2024.x.yupoo.com/categories/5332533",
  "https://lol2024.x.yupoo.com/categories/5332478",
  "https://lol2024.x.yupoo.com/categories/5332349",
  "https://lol2024.x.yupoo.com/categories/5224744",
  "https://lol2024.x.yupoo.com/categories/5186338",
  "https://lol2024.x.yupoo.com/categories/5186237",
  "https://lol2024.x.yupoo.com/categories/5186231",
];
const PAGE_COUNT = 7;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length); let cursor = 0;
  async function worker() { while (true) { const index = cursor++; if (index >= items.length) return; output[index] = await fn(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

export default async (_req: Request, context: Context) => {
  const store = galleryStore(context);
  const startedAt = new Date().toISOString();
  let albumsCompleted = 0, imagesSaved = 0;
  let oldImagesDeleted = 0;
  const errors: string[] = [];
  const status = (state: string) => store.setJSON("status.json", { state, startedAt, categories: CATEGORIES, pages: PAGE_COUNT, albumsFound: sourceAlbums.length, albumsCompleted, imagesSaved, oldImagesDeleted, errors, updatedAt: new Date().toISOString() });
  await status("clearing");
  const existing = await store.list({ prefix: "albums/" });
  await mapLimit(existing.blobs, 12, async ({ key }) => { await store.delete(key); oldImagesDeleted++; });
  await Promise.all([store.delete("manifest.json"), store.delete("manifest.csv")]);
  await status("running");
  try {
    const records = await mapLimit(sourceAlbums, 4, async (album) => {
      try {
        const images = await mapLimit(album.images, 5, async (sourceImage, index) => {
          let lastError = "";
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const response = await fetch(sourceImage.sourceUrl, { headers: { "user-agent": UA, referer: album.url } });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const bytes = await response.arrayBuffer();
              if (!bytes.byteLength) throw new Error("Empty image");
              const key = `albums/${album.id}/${String(index + 1).padStart(2, "0")}.jpg`;
              await store.set(key, bytes); imagesSaved++;
              return { index: index + 1, key, sourceUrl: sourceImage.sourceUrl, sourceFilename: sourceImage.alt };
            } catch (error) { lastError = error instanceof Error ? error.message : String(error); if (attempt < 3) await sleep(600 * attempt); }
          }
          throw new Error(lastError);
        });
        albumsCompleted++;
        if (albumsCompleted % 2 === 0 || albumsCompleted === sourceAlbums.length) await status("running");
        return { id: album.id, categoryId: album.categoryId, categoryName: album.categoryName, categoryUrl: album.categoryUrl, title: album.title, sourceAlbumUrl: album.url, images, importStatus: "complete" };
      } catch (error) {
        const message = `${album.id}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(message); albumsCompleted++;
        return { id: album.id, categoryId: album.categoryId, categoryName: album.categoryName, categoryUrl: album.categoryUrl, title: album.title, sourceAlbumUrl: album.url, images: [], importStatus: "error", error: message };
      }
    });
    const site = context.site.url.replace(/\/$/, "");
    const manifest = records.map((record) => ({ ...record, imageCount: record.images.length, firstImageUrl: record.images[0] ? `${site}/image?key=${encodeURIComponent(record.images[0].key)}` : "", otherImageUrls: record.images.slice(1).map((image) => `${site}/image?key=${encodeURIComponent(image.key)}`) }));
    await store.setJSON("manifest.json", manifest);
    const csv = ["category_id,category_name,album_id,product_name,image_count,source_album_url,first_image_url,other_image_urls,import_status,error", ...manifest.map((record) => [record.categoryId, record.categoryName, record.id, record.title, record.imageCount, record.sourceAlbumUrl, record.firstImageUrl, record.otherImageUrls.join(" | "), record.importStatus, record.error || ""].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
    await store.set("manifest.csv", csv);
    await store.setJSON("status.json", { state: "complete", startedAt, completedAt: new Date().toISOString(), categories: CATEGORIES, pages: PAGE_COUNT, albumsFound: sourceAlbums.length, albumsCompleted, imagesSaved, oldImagesDeleted, errors });
  } catch (error) {
    await store.setJSON("status.json", { state: "failed", startedAt, failedAt: new Date().toISOString(), categories: CATEGORIES, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};

export const config: Config = { path: "/api/import" };
