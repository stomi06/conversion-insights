import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useEffect } from "react";
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
  };
};



export default function Index() {
  const { productList } = useLoaderData();
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

  const tableStyle = { width: "100%", borderCollapse: "collapse", fontFamily: "Inter, Arial, sans-serif" };
  const thStyle = { border: "1px solid #e6eef6", padding: "10px", textAlign: "left", background: "#f5f9ff", color: "#12263f" };
  const tdStyle = { border: "1px solid #e6eef6", padding: "10px", verticalAlign: "middle" };

  return (
    <s-page heading="Store Products">
      <s-section heading="Product List">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={{ ...thStyle, width: 72 }}>Image</th>
              <th style={thStyle}>Title</th>
              <th style={{ ...thStyle, width: 100, textAlign: "center" }}>Views</th>
              <th style={{ ...thStyle, width: 120, textAlign: "center" }}>Add to Cart</th>
              <th style={{ ...thStyle, width: 100, textAlign: "center" }}>Purchases</th>
            </tr>
          </thead>
          <tbody>
            {productList.map((product, i) => {
              const rowStyle = { background: i % 2 === 0 ? "#ffffff" : "#fbfdff" };
              return (
                <tr key={product.id} style={rowStyle}>
                  <td style={tdStyle}>{product.id}</td>
                  <td style={tdStyle}>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                    ) : (
                      <span style={{ color: "#94a3b8" }}>No image</span>
                    )}
                  </td>
                  <td style={tdStyle}>{product.title}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 600 }}>{product.stats.views}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 600 }}>{product.stats.addToCart}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 600 }}>{product.stats.purchases}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
