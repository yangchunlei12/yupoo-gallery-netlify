import type { Context, Config } from "@netlify/functions";
import { galleryStore } from "./_shared/store.mts";

export default async (_req: Request, context: Context) => {
  const data = await galleryStore(context).get("rekey-status.json");
  return data ? new Response(data, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }) : new Response("Not started", { status: 404 });
};

export const config: Config = { path: "/api/rekey-status" };
