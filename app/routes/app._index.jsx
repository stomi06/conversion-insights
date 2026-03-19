import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { getStatsTotalsByProducts, normalizeProductId } from "../product-stats.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 20) {
          edges {
            node {
              id
              title
              legacyResourceId
              featuredImage {
                url
              }
            }
          }
        }
      }
    `
  );

  const json = await response.json();

  // Ensure storefront script tag exists so tracker is injected automatically
  try {
    const tagsResp = await admin.graphql(`#graphql
      query getScriptTags {
        scriptTags(first: 50) {
          nodes {
            id
            src
          }
        }
      }
    `);
    const tagsJson = await tagsResp.json();
    const nodes = tagsJson?.data?.scriptTags?.nodes || [];
    const trackerUrl = `${process.env.SHOPIFY_APP_URL.replace(/\/+$/, "")}/apps/conversion-insights/tracker.js`;
    const exists = nodes.some((n) => n.src && n.src.indexOf('/apps/conversion-insights/tracker.js') !== -1 || n.src === trackerUrl);
    if (!exists) {
      await admin.graphql(`#graphql
        mutation createScriptTag($input: ScriptTagInput!) {
          scriptTagCreate(input: $input) {
            scriptTag { id src }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            src: trackerUrl,
            displayScope: 'ONLINE_STORE',
          },
        },
      });
    }
  } catch (err) {
    console.warn('script tag registration failed', err?.message ?? err);
  }

  const productList = json.data.products.edges.map((edge) => {
    const product = edge.node;
    return {
      id: product.id,
      title: product.title,
      imageUrl: product.featuredImage?.url ?? null,
      numericProductId: normalizeProductId(product.legacyResourceId ?? product.id),
    };
  });

  const statsByProductId = await getStatsTotalsByProducts({
    shop: session.shop,
    productIds: productList.map((product) => product.numericProductId),
  });

  return {
    productList: productList.map((product) => ({
      ...product,
      stats: statsByProductId.get(product.numericProductId) ?? {
        views: 0,
        addToCart: 0,
        purchases: 0,
      },
    })),
    shop: session.shop,
  };
};



export default function Index() {
  const { productList, shop } = useLoaderData();
    const [sortBy, setSortBy] = useState('conversion');
    const [sortDir, setSortDir] = useState('asc');
  const revalidator = useRevalidator();

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        revalidator.revalidate();
      }
    };

    const onFocus = () => {
      revalidator.revalidate();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [revalidator]);

  const productsWithInsights = [...productList]
    .map((product) => {
      const views = Number(product?.stats?.views || 0);
      const addToCart = Number(product?.stats?.addToCart || 0);
      const purchases = Number(product?.stats?.purchases || 0);
      const conversion = views > 0 ? purchases / views : 0;

      let status = "🔴 Losing sales";
      let statusColors = {
        color: "#991b1b",
        background: "#fee2e2",
        border: "#fecaca",
      };

      if (conversion >= 0.05) {
        status = "🟢 Good";
        statusColors = {
          color: "#166534",
          background: "#dcfce7",
          border: "#bbf7d0",
        };
      } else if (conversion >= 0.02) {
        status = "🟡 Low conversion";
        statusColors = {
          color: "#854d0e",
          background: "#fef9c3",
          border: "#fde68a",
        };
      }

      return {
        ...product,
        stats: { views, addToCart, purchases },
        conversion,
        status,
        statusColors,
      };
    });

  const sortedProducts = [...productsWithInsights].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'views':
        return (a.stats.views - b.stats.views) * dir;
      case 'atc':
        return (a.stats.addToCart - b.stats.addToCart) * dir;
      case 'sales':
        return (a.stats.purchases - b.stats.purchases) * dir;
      case 'name':
        return a.title.localeCompare(b.title) * dir;
      case 'conversion':
      default:
        return (a.conversion - b.conversion) * dir;
    }
  });

  const tableStyle = { width: "100%", borderCollapse: "collapse", fontFamily: "Inter, Arial, sans-serif" };
  const thStyle = { border: "1px solid #e6eef6", padding: "11px", textAlign: "left", background: "#eef6ff", color: "#12263f" };
  const tdStyle = { border: "1px solid #e6eef6", padding: "11px", verticalAlign: "middle" };
  const cardStyle = {
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    border: "1px solid #dbeafe",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(2, 32, 71, 0.06)",
  };
  const titleCellWrap = { display: "flex", alignItems: "center", gap: 12 };
  const titleTextStyle = { margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" };
  const subtitleTextStyle = { margin: "3px 0 0", fontSize: 12, color: "#64748b" };
  const metricStyle = { ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 700 };

  return (
    <s-page heading="Store Products">
      <s-section heading="Overview">
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <div style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e6eef6', minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>About this dashboard</div>
              <p style={{ color: '#475569', fontSize: 13 }}>
                Welcome to Conversion Insights! This dashboard helps you understand how your products are performing in terms of views, add-to-cart actions, and purchases. The conversion rate is calculated as purchases divided by views, giving you a clear picture of how well each product is converting visitors into customers. Use this information to identify which products are doing well and which may need attention to improve their performance.
              </p>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e6eef6', minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Conversion legend</div>
              <div style={{ fontSize: 13, color: '#475569' }}>
                Conversion is calculated as <strong>purchases / views</strong> (over aggregated data).
                <ul style={{ margin: "10px 0px 0px 20px", padding: 0 }}>
                  <li>🔴 Losing sales — conversion &lt; 2% (0.02)</li>
                  <li>🟡 Low conversion — conversion ≥ 2% and &lt; 5% (0.02–0.05)</li>
                  <li>🟢 Good — conversion ≥ 5% (≥ 0.05)</li>
                </ul>
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e6eef6', minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Contact</div>
              <div style={{ fontSize: 13, color: '#475569' }}>
                Need help or want improvements? Contact us:
                <div style={{ marginTop: 8 }}>
                  <a href="mailto:support@conversion-insights.app" style={{ color: '#0369a1' }}>support@conversion-insights.app</a>
                </div>
              </div>
            </div>
          </div>
      </s-section>
      <s-section heading="Product List">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between'}}>
            <div style={{ color: '#475569', fontSize: 13 }}>
              Tracking is active. Data updates as visitors interact with your storefront.
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#475569' }}>Sort by</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
                <option value="conversion">Conversion</option>
                <option value="views">Views</option>
                <option value="atc">Add to Cart</option>
                <option value="sales">Purchases</option>
                <option value="name">Name</option>
              </select>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>

        </div>
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 100, textAlign: "center" }}>Product</th>
                <th style={{ ...thStyle, width: 100, textAlign: "center" }}>Views</th>
                <th style={{ ...thStyle, width: 110, textAlign: "center" }}>ATC</th>
                <th style={{ ...thStyle, width: 100, textAlign: "center" }}>Sales</th>
                <th style={{ ...thStyle, width: 120, textAlign: "center" }}>Conversion</th>
                <th style={{ ...thStyle, width: 170, textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((product, i) => {
                const rowStyle = { background: i % 2 === 0 ? "#ffffff" : "#f8fbff" };
                return (
                  <tr key={product.id} style={rowStyle}>
                    <td style={tdStyle}>
                      <div style={titleCellWrap}>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.title} style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 10, border: "1px solid #e2e8f0" }} />
                        ) : (
                          <div style={{ width: 50, height: 50, borderRadius: 10, background: "#f1f5f9", border: "1px solid #e2e8f0", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 11 }}>
                            No image
                          </div>
                        )}
                        <div>
                          <p style={titleTextStyle}>{product.title}</p>
                          <p style={subtitleTextStyle}>ID: {product.numericProductId}</p>
                        </div>
                      </div>
                    </td>
                    <td style={metricStyle}>{product.stats.views}</td>
                    <td style={metricStyle}>{product.stats.addToCart}</td>
                    <td style={metricStyle}>{product.stats.purchases}</td>
                    <td style={metricStyle}>{(product.conversion * 100).toFixed(2)}%</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, border: `1px solid ${product.statusColors.border}`, background: product.statusColors.background, color: product.statusColors.color, fontWeight: 600, fontSize: 12 }}>
                          {product.status}
                        </span>
                        <div style={{ marginLeft: 8 }}>
                          <a href={`https://${shop}/admin/products/${product.numericProductId}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid #e6eef6', background: '#ffffff', color: '#0369a1', textDecoration: 'none' }} aria-label="Open product">
                            <img src="/assets/arrow.svg" alt="Open product" style={{ width: 16, height: 16 }} />
                          </a>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
