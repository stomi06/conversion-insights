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

      let status = "⚪ Not enough data";
      let statusColors = {
        color: "#475569",
        background: "#f8fafc",
        border: "#e6eef6",
      };

      if (views < 10) {
        status = "⚪ Not enough data";
        statusColors = {
          color: "#475569",
          background: "#f8fafc",
          border: "#e6eef6",
        };
      } else if (conversion >= 0.05) {
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
      } else {
        status = "🔴 Losing sales";
        statusColors = {
          color: "#7f1d1d",
          background: "#fecaca",
          border: "#fca5a5",
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
    // Always show products that have data (status !== '⚪ Not enough data') first
    const aHasData = a.status !== '⚪ Not enough data';
    const bHasData = b.status !== '⚪ Not enough data';
    if (aHasData && !bHasData) return -1;
    if (!aHasData && bHasData) return 1;

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
  const thStyle = { border: "none", borderBottom: "1px solid #dbeafe", padding: "11px", textAlign: "left", background: "#eef6ff", color: "#12263f" };
  const tdStyle = { border: "none", borderBottom: "1px solid #eef2f7", padding: "11px", verticalAlign: "middle" };
  const cardStyle = {
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    border: "1px solid #dbeafe",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(2, 32, 71, 0.06)",
  };
  const titleCellWrap = { display: "flex", alignItems: "center", gap: 12 };
  const titleTextStyle = { margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a", wordBreak: "break-word" };
  const subtitleTextStyle = { margin: "3px 0 0", fontSize: 12, color: "#64748b" };
  const metricStyle = { ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 700 };

  return (
    <s-page heading="Store Products">
      <style>{`
        .ci-overview {
          width: 100%;
          display: flex;
          gap: 12px;
          align-items: stretch;
          flex-wrap: wrap;
        }

        .ci-overview-card {
          flex: 1 1;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }

        .ci-list-header {
          width: 100%;
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .ci-sort-controls {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .ci-table-wrap {
          width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }

        .ci-metrics-line-cell {
          display: none;
        }

        .ci-metrics-line {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
          white-space: nowrap;
          font-size: 12px;
          color: #334155;
          font-weight: 700;
        }

        .ci-metrics-line span {
          flex: 1 1 0;
          text-align: center;
        }

        @media (max-width: 768px) {
          .ci-overview,
          .ci-list-header,
          .ci-sort-controls,
          .ci-table-wrap,
          .ci-table,
          .ci-table tbody,
          .ci-table tr,
          .ci-table td {
            box-sizing: border-box;
            max-width: 100%;
          }

          .ci-overview {
            flex-direction: column;
          }

          .ci-overview-card {
            width: 100%;
            min-width: 0;
          }

          .ci-list-header {
            align-items: stretch;
          }

          .ci-sort-controls {
            width: 100%;
          }

          .ci-sort-controls select {
            flex: 1 1 140px;
            min-width: 0;
          }

          .ci-table thead {
            display: none;
          }

          .ci-table,
          .ci-table tbody,
          .ci-table tr,
          .ci-table td {
            display: block;
            width: 100%;
          }

          .ci-table tr {
            border: 1px solid #e6eef6;
            border-radius: 10px;
            margin-bottom: 12px;
            padding: 10px;
            background: #ffffff;
            overflow: hidden;
          }

          .ci-table td {
            border: none;
            padding: 8px 0;
          }

          .ci-table td[data-label="Views"],
          .ci-table td[data-label="ATC"],
          .ci-table td[data-label="Sales"],
          .ci-table td[data-label="Conversion"] {
            display: none;
          }

          .ci-metrics-line-cell {
            display: block;
          }

          .ci-table td[data-label]::before {
            content: attr(data-label);
            display: block;
            font-size: 12px;
            color: #64748b;
            font-weight: 700;
            margin-bottom: 4px;
          }

          .ci-table td[data-label="Product"] {
            padding-top: 0;
          }

          .ci-table td[data-label="Status"] > div {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
      <s-section heading="Overview">
        <div className="ci-overview">
            <div className="ci-overview-card" style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e6eef6' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>About this dashboard</div>
              <p style={{ color: '#475569', fontSize: 13 }}>
                This dashboard helps you understand how your products are performing in terms of views, add-to-cart actions, and purchases. Use this information to identify which products are doing well and which may need attention to improve their performance.
              </p>
            </div>

            <div className="ci-overview-card" style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e6eef6' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Conversion legend</div>
              <div style={{ fontSize: 13, color: '#475569' }}>
                Conversion is calculated as <strong>purchases / views</strong> (over aggregated data).
                <ul style={{ margin: "10px 0px 0px 20px", padding: 0 }}>
                  <li>⚪ Not enough data — fewer than 10 views</li>
                  <li>🔴 Losing sales — conversion &lt; 2% (0.02)</li>
                  <li>🟡 Low conversion — conversion ≥ 2% and &lt; 5% (0.02–0.05)</li>
                  <li>🟢 Good — conversion ≥ 5% (≥ 0.05)</li>
                </ul>
              </div>
            </div>

            <div className="ci-overview-card" style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e6eef6' }}>
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
          <div className="ci-list-header">
            <div style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>
              Tracking is active. Data updates as visitors interact with your storefront.
            </div>
            <div className="ci-sort-controls">
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
          <div className="ci-table-wrap">
          <table className="ci-table" style={tableStyle}>
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
                    <td data-label="Product" style={tdStyle}>
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
                    <td data-label="Views" style={metricStyle}>{product.stats.views}</td>
                    <td data-label="ATC" style={metricStyle}>{product.stats.addToCart}</td>
                    <td data-label="Sales" style={metricStyle}>{product.stats.purchases}</td>
                    <td data-label="Conversion" style={metricStyle}>{(product.conversion * 100).toFixed(2)}%</td>
                    <td data-label="Metrics" className="ci-metrics-line-cell" style={tdStyle}>
                      <div className="ci-metrics-line">
                        <span>Views: {product.stats.views}</span>
                        <span>ATC: {product.stats.addToCart}</span>
                        <span>Sales: {product.stats.purchases}</span>
                        <span>Conv: {(product.conversion * 100).toFixed(2)}%</span>
                      </div>
                    </td>
                    <td data-label="Status" style={tdStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: "inline-block", padding: "6px 12px", borderRadius: 999, border: `1px solid ${product.statusColors.border}`, background: product.statusColors.background, color: product.statusColors.color, fontWeight: product.status.indexOf('🔴') === 0 ? 800 : 600, fontSize: 12, whiteSpace: 'nowrap' }}>
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
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
