import fs from "fs/promises";
import path from "path";

const TRACKER_PATH = path.resolve("public/product-tracker.js");

export const loader = async ({ request }) => {
  // Serve the tracker script without requiring app-proxy signature.
  // The script is public JS and should be loadable by storefront pages.
  const script = await fs.readFile(TRACKER_PATH, "utf8");

  // Try to infer the shop domain so the client script can include it in payloads.
  let shop = null;
  try {
    const url = new URL(request.url);
    shop = url.searchParams.get("shop") || null;
  } catch {
    shop = null;
  }

  if (!shop) {
    const referer = String(request.headers.get("referer") || "");
    try {
      const refUrl = new URL(referer);
      if (refUrl.hostname) shop = refUrl.hostname;
    } catch {
      // ignore
    }
  }

  let prefix = "";
  if (shop) {
    prefix += `window.CONVERSION_INSIGHTS_SHOP = ${JSON.stringify(shop)};\n`;
    prefix += `window.CONVERSION_INSIGHTS_TRACK_URL = ${JSON.stringify("/apps/conversion-insights/track")};\n`;
  }

  const finalScript = prefix + script;

  return new Response(finalScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
};
