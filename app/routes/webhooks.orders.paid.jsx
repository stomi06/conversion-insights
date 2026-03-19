import { authenticate } from "../shopify.server";
import { applyOrderPurchases } from "../product-stats.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await applyOrderPurchases({
    shop,
    orderId: payload?.id,
    lineItems: payload?.line_items,
  });

  return new Response();
};
