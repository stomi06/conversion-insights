#!/usr/bin/env node
// Usage: node simulate-webhook.js --product 12345 --qty 2
import fs from 'fs';
import path from 'path';

const argv = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [k,v] = arg.split('=');
  return [k.replace(/^--/,'') , v];
}));

const product = argv.product || argv.p;
const qty = Number(argv.qty || argv.q || 1);
if (!product) {
  console.error('Usage: node simulate-webhook.js --product=12345 --qty=2');
  process.exit(1);
}

const DATA_PATH = path.resolve('./event-aggregates.json');
let aggregates = {};
if (fs.existsSync(DATA_PATH)) {
  aggregates = JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
}
if (!aggregates[product]) aggregates[product] = { views:0, add_to_cart:0, purchases:0 };
aggregates[product].purchases += qty;
fs.writeFileSync(DATA_PATH, JSON.stringify(aggregates,null,2));
console.log('Simulated order, updated', product, aggregates[product]);
