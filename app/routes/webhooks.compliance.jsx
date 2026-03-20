import crypto from "node:crypto";
import db from "../db.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const rawBody = await request.text();
  const shopifyHmac = request.headers.get("x-shopify-hmac-sha256") || "";
  const secret = process.env.SHOPIFY_API_SECRET || "";

  if (!shopifyHmac || !secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const digestBuffer = Buffer.from(digest);
  const hmacBuffer = Buffer.from(shopifyHmac);
  const isValidHmac =
    digestBuffer.length === hmacBuffer.length &&
    crypto.timingSafeEqual(digestBuffer, hmacBuffer);

  if (!isValidHmac) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const normalizedTopic = String(request.headers.get("x-shopify-topic") || "").toLowerCase();
  const shopDomain = String(request.headers.get("x-shopify-shop-domain") || payload?.shop_domain || "").trim();

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
