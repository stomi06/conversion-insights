import { authenticate } from "../shopify.server";
import { getStatsTotalsByProducts } from "../product-stats.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const csvProductIds = url.searchParams.get("productIds") || "";
  const queryProductIds = url.searchParams.getAll("product_id");

  const productIds = [
    ...queryProductIds,
    ...csvProductIds
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  if (!productIds.length) {
    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const stats = await getStatsTotalsByProducts({
    shop: session.shop,
    productIds,
  });

  return new Response(JSON.stringify(Object.fromEntries(stats)), {
    headers: { "Content-Type": "application/json" },
  });
};
