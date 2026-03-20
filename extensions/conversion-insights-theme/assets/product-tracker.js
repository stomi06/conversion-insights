(function () {
  const INIT_KEY = '__conversionInsightsTrackerInitialized';
  if (window[INIT_KEY]) {
    return;
  }
  window[INIT_KEY] = true;

  const TRACK_ENDPOINT = window.CONVERSION_INSIGHTS_TRACK_URL || '/apps/conversion-insights/track';

  function getShopFromScript() {
    try {
      const script = document.currentScript || (document.getElementsByTagName && document.getElementsByTagName('script')[document.getElementsByTagName('script').length - 1]);
      const src = script && script.src;
      if (!src) return null;
      try {
        const url = new URL(src, location.href);
        return url.searchParams.get('shop');
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  const SCRIPT_SHOP = window.CONVERSION_INSIGHTS_SHOP || getShopFromScript();
  const STORAGE_KEY = 'conversion-insights-event-buffer-v1';
  const FLUSH_INTERVAL_MS = 15000;
  const ATC_DEDUP_WINDOW_MS = 1200;
  let lastAtcProductId = null;
  let lastAtcAt = 0;

  function normalizeProductId(rawProductId) {
    if (rawProductId === null || rawProductId === undefined) return null;
    const value = String(rawProductId).trim();
    if (!value) return null;
    const gidMatch = value.match(/gid:\/\/shopify\/Product\/(\d+)/);
    if (gidMatch && gidMatch[1]) return gidMatch[1];
    const numericMatch = value.match(/(\d+)$/);
    return (numericMatch && numericMatch[1]) || value;
  }

  function detectProductId() {
    const productIdInput = document.querySelector('input[name="product-id"], input[name="product_id"], [data-product-id]');
    const productIdFromDom =
      (productIdInput && productIdInput.value) ||
      (productIdInput && productIdInput.getAttribute && productIdInput.getAttribute('data-product-id'));

    const candidates = [
      window.Shopify && window.Shopify.product && window.Shopify.product.id,
      window.meta && window.meta.product && window.meta.product.id,
      window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product && window.ShopifyAnalytics.meta.product.id,
      productIdFromDom,
      document.body && document.body.getAttribute && document.body.getAttribute('data-product-id'),
      document.documentElement && document.documentElement.getAttribute && document.documentElement.getAttribute('data-product-id'),
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const normalized = normalizeProductId(candidates[i]);
      if (normalized) return normalized;
    }

    try {
      const jsonLdNodes = document.querySelectorAll('script[type="application/ld+json"]');
      for (let i = 0; i < jsonLdNodes.length; i += 1) {
        const text = jsonLdNodes[i] && jsonLdNodes[i].textContent;
        if (!text) continue;
        const data = JSON.parse(text);
        const entries = Array.isArray(data) ? data : [data];
        for (let j = 0; j < entries.length; j += 1) {
          const entry = entries[j] || {};
          const type = entry['@type'];
          if (type !== 'Product') continue;
          const normalized = normalizeProductId(entry.productID || entry.sku || entry['@id'] || entry.url);
          if (normalized) return normalized;
        }
      }
    } catch {
      // ignore parse errors
    }

    return null;
  }

  function loadBuffer() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveBuffer(buffer) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
    } catch {
      // Ignore quota/serialization errors.
    }
  }

  function incrementBufferedEvent(productId, event, count) {
    if (!productId || !event) return;
    const safeCount = Math.max(1, Number(count || 1));
    const buffer = loadBuffer();
    if (!buffer[productId]) {
      buffer[productId] = { view: 0, add_to_cart: 0 };
    }
    buffer[productId][event] = (buffer[productId][event] || 0) + safeCount;
    saveBuffer(buffer);
  }

  function buildPayload(buffer) {
    const events = [];
    Object.keys(buffer).forEach(function (productId) {
      const counters = buffer[productId] || {};
      if (counters.view > 0) {
        events.push({ product_id: productId, event: 'view', count: counters.view });
      }
      if (counters.add_to_cart > 0) {
        events.push({ product_id: productId, event: 'add_to_cart', count: counters.add_to_cart });
      }
    });

    if (!events.length) return null;
    const payload = { events: events };
    if (SCRIPT_SHOP) payload.shop = SCRIPT_SHOP;
    return payload;
  }

  function flushBuffer(options) {
    const forceBeacon = options && options.forceBeacon;
    const buffer = loadBuffer();
    const payload = buildPayload(buffer);

    if (!payload) return;

    const body = JSON.stringify(payload);
    saveBuffer({});

    try {
      if (forceBeacon && navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        const queued = navigator.sendBeacon(TRACK_ENDPOINT, blob);
        if (!queued) {
          saveBuffer(buffer);
        }
        return;
      }

      fetch(TRACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {
        saveBuffer(buffer);
      });
    } catch {
      saveBuffer(buffer);
    }
  }

  function shouldTrackAtc(productId) {
    const now = Date.now();
    if (lastAtcProductId === productId && now - lastAtcAt < ATC_DEDUP_WINDOW_MS) {
      return false;
    }
    lastAtcProductId = productId;
    lastAtcAt = now;
    return true;
  }

  try {
    let productId = detectProductId();

    if (productId) {
      incrementBufferedEvent(productId, 'view', 1);
      setTimeout(function () {
        flushBuffer();
      }, 1000);
    }

    document.addEventListener('click', function (e) {
      const target = e.target;
      const isAddToCartClick =
        target &&
        ((target.getAttribute && target.getAttribute('name') === 'add') ||
          (target.matches && target.matches('[data-add-to-cart], [name="add"], .product-form__submit')));

      const currentProductId = detectProductId() || productId;
      if (isAddToCartClick && currentProductId) {
        productId = currentProductId;
        if (!shouldTrackAtc(currentProductId)) return;
        incrementBufferedEvent(currentProductId, 'add_to_cart', 1);
        flushBuffer();
      }
    }, { passive: true });

    document.addEventListener('submit', function (e) {
      const form = e.target;
      const isAddToCartForm =
        form &&
        form.matches &&
        (form.matches('form[action*="/cart/add"]') || form.matches('product-form form'));

      const currentProductId = detectProductId() || productId;
      if (isAddToCartForm && currentProductId) {
        productId = currentProductId;
        if (!shouldTrackAtc(currentProductId)) return;
        incrementBufferedEvent(currentProductId, 'add_to_cart', 1);
        flushBuffer({ forceBeacon: true });
      }
    }, { passive: true });

    setInterval(function () {
      flushBuffer();
    }, FLUSH_INTERVAL_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        flushBuffer({ forceBeacon: true });
      }
    });

    window.addEventListener('pagehide', function () {
      flushBuffer({ forceBeacon: true });
    });
  } catch (err) {
    console.warn('product-tracker error', err);
  }
})();
