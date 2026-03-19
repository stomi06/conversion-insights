import fs from "fs/promises";
import path from "path";
import { authenticate } from "../shopify.server";

const TRACKER_PATH = path.resolve("public/product-tracker.js");

export const loader = async ({ request }) => {
  await authenticate.public.appProxy(request);

  const script = await fs.readFile(TRACKER_PATH, "utf8");

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
