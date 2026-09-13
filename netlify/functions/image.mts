import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";
export default async (req: Request, context: Context) => {
  const key = new URL(req.url).searchParams.get("key");
  if (!key || !/^albums\/\d+\/\d+\.jpg$/.test(key)) return new Response("Invalid key", {status:400});
  const data = await galleryStore(context).get(key, {type:"arrayBuffer"});
  if (!data) return new Response("Not found", {status:404});
  const bytes = new Uint8Array(data);
  const contentType = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "image/png" : "image/jpeg";
  return new Response(data, {headers:{"content-type":contentType,"cache-control":"public, max-age=31536000, immutable"}});
};
export const config: Config = { path: "/image" };
