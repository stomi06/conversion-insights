import {
  buildEventCounters,
  getStatsTotalsByProducts,
  incrementDailyStats,
} from "../product-stats.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const action = async ({ request }) => {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const shop = body?.shop ? String(body.shop).trim() : "";
  if (!shop) {
    return new Response(JSON.stringify({ error: "Missing shop" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const events = Array.isArray(body?.events)
    ? body.events
    : body?.product_id && body?.event
      ? [body]
      : [];

  const countersByProduct = buildEventCounters(events);
  const result = await incrementDailyStats({ shop, countersByProduct });

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim() || "";
  const productIds = url.searchParams.getAll("product_id");

  if (!shop || productIds.length === 0) {
    return new Response(JSON.stringify({}), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const stats = await getStatsTotalsByProducts({ shop, productIds });
  const payload = Object.fromEntries(stats);

  return new Response(JSON.stringify(payload), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
};

