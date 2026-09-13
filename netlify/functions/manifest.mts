import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";
export default async (req: Request, context: Context) => {
  const csv = new URL(req.url).pathname.endsWith(".csv");
  const key = csv ? "manifest.csv" : "manifest.json";
  const data = await galleryStore(context).get(key);
  if (!data) return new Response("Manifest not ready", {status:404});
  return new Response(data, {headers:{"content-type":csv?"text/csv; charset=utf-8":"application/json; charset=utf-8","content-disposition":csv?'attachment; filename="yupoo-august-gallery.csv"':'inline'}});
};
export const config: Config = { path: ["/api/manifest.csv","/api/manifest.json"] };
