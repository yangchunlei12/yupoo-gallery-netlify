import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";

export default async (_req: Request, context: Context) => {
  const store = galleryStore(context);
  const manifest = await store.get("manifest.json", { type: "json" }) as any[] | null;
  if (!manifest) return new Response("Manifest not found", { status: 404 });

  const site = context.site.url.replace(/\/$/, "");
  let sortedProducts = 0;
  for (const album of manifest) {
    album.images.sort((a: any, b: any) => {
      const an = Number(a.sourceNumber || a.key.match(/\/(\d+)\.jpg$/)?.[1]);
      const bn = Number(b.sourceNumber || b.key.match(/\/(\d+)\.jpg$/)?.[1]);
      return an - bn;
    });
    album.images = album.images.map((image: any, index: number) => ({ ...image, index: index + 1 }));
    album.firstImageUrl = album.images[0] ? `${site}/image?key=${encodeURIComponent(album.images[0].key)}` : "";
    album.otherImageUrls = album.images.slice(1).map((image: any) => `${site}/image?key=${encodeURIComponent(image.key)}`);
    sortedProducts++;
  }

  await store.setJSON("manifest.json", manifest);
  const csv = ["album_id,product_name,image_count,source_album_url,first_image_url,other_image_urls,import_status", ...manifest.map((album) => [album.id, album.title, album.images.length, album.sourceAlbumUrl, album.firstImageUrl, album.otherImageUrls.join(" | "), album.error ? `Error: ${album.error}` : "Complete"].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
  await store.set("manifest.csv", csv);

  return Response.json({ state: "complete", products: sortedProducts, images: manifest.reduce((sum, album) => sum + album.images.length, 0), rule: "source image number ascending" });
};

export const config: Config = { path: "/api/sort-manifest" };
