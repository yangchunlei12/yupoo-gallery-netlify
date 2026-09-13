import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";
export default async (_req: Request, context: Context) => new Response(JSON.stringify((await galleryStore(context).get("status.json", { type: "json" })) || {state:"not_started"}), {headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export const config: Config = { path: "/api/status" };

