import fs from "fs/promises";
import path from "path";

const TRACKER_PATH = path.resolve("public/product-tracker.js");

export const loader = async ({ request }) => {
  // Serve the tracker script without requiring app-proxy signature.
  // The script is public JS and should be loadable by storefront pages.
  const script = await fs.readFile(TRACKER_PATH, "utf8");

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
};
