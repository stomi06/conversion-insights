// MVP API endpoint: /api/track
// Przechowuje agregaty eventów w pliku JSON
import fs from "fs";
import path from "path";

const DATA_PATH = path.resolve("./event-aggregates.json");

function loadAggregates() {
  if (!fs.existsSync(DATA_PATH)) return {};
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function saveAggregates(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

export const action = async ({ request }) => {
  const body = await request.json();
  const { product_id, event } = body;
  if (!product_id || !event) return new Response("Missing", { status: 400 });

  const aggregates = loadAggregates();
  if (!aggregates[product_id]) {
    aggregates[product_id] = { views: 0, add_to_cart: 0, purchases: 0 };
  }
  if (event === "view") aggregates[product_id].views++;
  if (event === "add_to_cart") aggregates[product_id].add_to_cart++;
  if (event === "purchase") aggregates[product_id].purchases++;

  saveAggregates(aggregates);
  return new Response("ok");
};

export const loader = async () => {
  const aggregates = loadAggregates();
  return new Response(JSON.stringify(aggregates), {
    headers: { "Content-Type": "application/json" },
  });
};

export default null;
