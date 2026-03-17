// Insert this file into the storefront/theme (or Theme App Extension) and include on product pages.
// It uses the global `Shopify` object when available; adapt as needed for your theme.
(function () {
  try {
    const productId = (window.Shopify && window.Shopify.product && window.Shopify.product.id) || null;
    // Some themes expose ShopifyAnalytics or meta tags; you can adapt this to your theme

    if (productId) {
      // Normalize numeric id (some themes provide gid, some numeric)
      const payload = { product_id: String(productId), event: "view" };
      navigator.sendBeacon && typeof navigator.sendBeacon === 'function'
        ? navigator.sendBeacon('/api/track', JSON.stringify(payload))
        : fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }

    // Add-to-cart clicks
    document.addEventListener('click', function (e) {
      const target = e.target;
      // common add-to-cart selector: input/button with name=add or [data-add-to-cart]
      if (target && (target.getAttribute && target.getAttribute('name') === 'add' || target.matches && target.matches('[data-add-to-cart]'))) {
        const payload = { product_id: String(productId), event: 'add_to_cart' };
        fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
    }, { passive: true });
  } catch (err) {
    console.warn('product-tracker error', err);
  }
})();
