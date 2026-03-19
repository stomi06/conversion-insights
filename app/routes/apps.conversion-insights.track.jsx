import { authenticate } from "../shopify.server";
import { buildEventCounters, incrementDailyStats } from "../product-stats.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

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
  const result = await incrementDailyStats({
    shop: session.shop,
    countersByProduct,
  });

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
