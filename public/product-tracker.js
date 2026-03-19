// Insert this file into the storefront/theme (or Theme App Extension) and include on product pages.
// It uses the global `Shopify` object when available; adapt as needed for your theme.
(function () {
  const TRACK_ENDPOINT = window.CONVERSION_INSIGHTS_TRACK_URL || '/apps/conversion-insights/track';
  // Attempt to discover the shop from the script URL (app-proxy adds ?shop=...).
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
  const MAX_BUFFERED_EVENTS = 5;

  function normalizeProductId(rawProductId) {
    if (rawProductId === null || rawProductId === undefined) return null;
    const value = String(rawProductId).trim();
    if (!value) return null;
    const gidMatch = value.match(/gid:\/\/shopify\/Product\/(\d+)/);
    if (gidMatch && gidMatch[1]) return gidMatch[1];
    const numericMatch = value.match(/(\d+)$/);
    return (numericMatch && numericMatch[1]) || value;
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

  function getBufferedEventsCount(buffer) {
    return Object.values(buffer).reduce(function (total, counters) {
      return total + (counters.view || 0) + (counters.add_to_cart || 0);
    }, 0);
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

  try {
    const rawProductId = (window.Shopify && window.Shopify.product && window.Shopify.product.id) || null;
    const productId = normalizeProductId(rawProductId);

    if (productId) {
      incrementBufferedEvent(productId, 'view', 1);
    }

    document.addEventListener('click', function (e) {
      const target = e.target;
      const isAddToCartClick =
        target &&
        ((target.getAttribute && target.getAttribute('name') === 'add') ||
          (target.matches && target.matches('[data-add-to-cart]')));

      if (isAddToCartClick && productId) {
        incrementBufferedEvent(productId, 'add_to_cart', 1);

        const buffered = loadBuffer();
        if (getBufferedEventsCount(buffered) >= MAX_BUFFERED_EVENTS) {
          flushBuffer();
        }
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
