import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  let payload;
  let topic;
  let shop;

  try {
    const webhook = await authenticate.webhook(request);
    payload = webhook.payload;
    topic = webhook.topic;
    shop = webhook.shop;
  } catch (error) {
    if (error instanceof Response) {
      if (error.status === 401) {
        return new Response("Unauthorized", { status: 401 });
      }
      return error;
    }

    return new Response("Unauthorized", { status: 401 });
  }

  const normalizedTopic = String(topic || request.headers.get("x-shopify-topic") || "").toLowerCase();
  const shopDomain = String(shop || payload?.shop_domain || "").trim();

  if (normalizedTopic === "shop/redact" && shopDomain) {
    await db.session.deleteMany({ where: { shop: shopDomain } });
    await db.productStatDaily.deleteMany({ where: { shop: shopDomain } });
    await db.processedOrder.deleteMany({ where: { shop: shopDomain } });
  }

  if (normalizedTopic === "customers/data_request") {
    console.log(`[compliance] customers/data_request received for ${shopDomain || "unknown shop"}`);
  }

  if (normalizedTopic === "customers/redact") {
    console.log(`[compliance] customers/redact received for ${shopDomain || "unknown shop"}`);
  }

  if (normalizedTopic === "shop/redact") {
    console.log(`[compliance] shop/redact processed for ${shopDomain || "unknown shop"}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
