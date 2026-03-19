import db from "./db.server";

const ALLOWED_EVENTS = new Set(["view", "add_to_cart", "purchase"]);

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function normalizeProductId(rawProductId) {
  if (rawProductId === null || rawProductId === undefined) return null;
  const value = String(rawProductId).trim();
  if (!value) return null;

  if (value.includes("gid://shopify/Product/")) {
    const match = value.match(/gid:\/\/shopify\/Product\/(\d+)/);
    return match?.[1] ?? null;
  }

  const trailingNumeric = value.match(/(\d+)$/);
  return trailingNumeric?.[1] ?? value;
}

function emptyCounters() {
  return { views: 0, addToCart: 0, purchases: 0 };
}

export function buildEventCounters(events = []) {
  const grouped = new Map();

  for (const entry of events) {
    const event = entry?.event;
    const productId = normalizeProductId(entry?.product_id ?? entry?.productId);

    if (!productId || !ALLOWED_EVENTS.has(event)) {
      continue;
    }

    const count = Number.isFinite(entry?.count) ? Number(entry.count) : 1;
    const safeCount = Math.max(0, Math.floor(count));

    if (safeCount === 0) continue;

    if (!grouped.has(productId)) {
      grouped.set(productId, emptyCounters());
    }

    const counters = grouped.get(productId);

    if (event === "view") counters.views += safeCount;
    if (event === "add_to_cart") counters.addToCart += safeCount;
    if (event === "purchase") counters.purchases += safeCount;
  }

  return grouped;
}

export async function incrementDailyStats({ shop, countersByProduct }) {
  if (!shop || !countersByProduct || countersByProduct.size === 0) {
    return { updated: 0 };
  }

  const day = startOfUtcDay();

  const operations = [];
  for (const [productId, counters] of countersByProduct.entries()) {
    operations.push(
      db.productStatDaily.upsert({
        where: {
          shop_productId_day: {
            shop,
            productId,
            day,
          },
        },
        create: {
          shop,
          productId,
          day,
          views: counters.views,
          addToCart: counters.addToCart,
          purchases: counters.purchases,
        },
        update: {
          views: { increment: counters.views },
          addToCart: { increment: counters.addToCart },
          purchases: { increment: counters.purchases },
        },
      }),
    );
  }

  await db.$transaction(operations);
  return { updated: operations.length };
}

export async function getStatsTotalsByProducts({ shop, productIds }) {
  if (!shop || !productIds?.length) {
    return new Map();
  }

  const normalized = productIds.map((productId) => normalizeProductId(productId)).filter(Boolean);
  if (!normalized.length) return new Map();

  const grouped = await db.productStatDaily.groupBy({
    by: ["productId"],
    where: {
      shop,
      productId: { in: normalized },
    },
    _sum: {
      views: true,
      addToCart: true,
      purchases: true,
    },
  });

  return new Map(
    grouped.map((item) => [
      item.productId,
      {
        views: item._sum.views ?? 0,
        addToCart: item._sum.addToCart ?? 0,
        purchases: item._sum.purchases ?? 0,
      },
    ]),
  );
}

export async function applyOrderPurchases({ shop, orderId, lineItems }) {
  if (!shop || !orderId || !Array.isArray(lineItems) || lineItems.length === 0) {
    return { applied: false, reason: "missing-data" };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.processedOrder.create({
        data: {
          shop,
          orderId: String(orderId),
        },
      });

      const countersByProduct = new Map();
      for (const lineItem of lineItems) {
        const productId = normalizeProductId(lineItem?.product_id ?? lineItem?.productId);
        const quantity = Math.max(0, Number(lineItem?.quantity || 0));

        if (!productId || quantity === 0) continue;

        if (!countersByProduct.has(productId)) {
          countersByProduct.set(productId, emptyCounters());
        }

        countersByProduct.get(productId).purchases += quantity;
      }

      if (countersByProduct.size === 0) {
        return { applied: false, reason: "no-trackable-line-items" };
      }

      const day = startOfUtcDay();
      for (const [productId, counters] of countersByProduct.entries()) {
        await tx.productStatDaily.upsert({
          where: {
            shop_productId_day: {
              shop,
              productId,
              day,
            },
          },
          create: {
            shop,
            productId,
            day,
            purchases: counters.purchases,
          },
          update: {
            purchases: { increment: counters.purchases },
          },
        });
      }

      return { applied: true, updatedProducts: countersByProduct.size };
    });

    return result;
  } catch (error) {
    const isDuplicateOrder = error?.code === "P2002";
    if (isDuplicateOrder) {
      return { applied: false, reason: "already-processed" };
    }

    throw error;
  }
}
