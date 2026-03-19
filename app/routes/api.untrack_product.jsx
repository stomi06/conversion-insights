import { authenticate } from "../shopify.server";
import db from "../db.server";
import { normalizeProductId } from "../product-stats.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid-json' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const rawProductId = body?.productId ?? body?.product_id;
  const productId = normalizeProductId(rawProductId);
  if (!productId) {
    return new Response(JSON.stringify({ error: 'missing-productId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const result = await db.productStatDaily.deleteMany({ where: { shop: session.shop, productId } });

  return new Response(JSON.stringify({ ok: true, deleted: result.count }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
