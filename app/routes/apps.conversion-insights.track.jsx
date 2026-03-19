import { authenticate } from "../shopify.server";
import { buildEventCounters, incrementDailyStats } from "../product-stats.server";

export const action = async ({ request }) => {
  // Try to authenticate the app-proxy request. If signature is missing
  // (some proxies or direct requests), fall back to reading `shop` from the
  // payload. This allows storefronts to POST events even if the signature
  // is not present while keeping normal proxy auth when available.
  let session;
  try {
    const auth = await authenticate.public.appProxy(request);
    session = auth.session;
  } catch (err) {
    // Authentication failed (likely missing signature). We'll fallback below.
    session = null;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const events = Array.isArray(body?.events)
    ? body.events
    : body?.product_id && body?.event
      ? [body]
      : [];

  const countersByProduct = buildEventCounters(events);

  // Determine shop: prefer authenticated session, otherwise use body.shop
  const shop = session?.shop || (body?.shop ? String(body.shop).trim() : null);
  if (!shop) {
    return new Response(JSON.stringify({ error: "Missing shop" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await incrementDailyStats({
    shop,
    countersByProduct,
  });

  if (result.updated > 0) {
    console.log(
      `[conversion-insights] tracked ${result.updated} product aggregates for ${shop}`,
    );
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
