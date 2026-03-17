import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  // Pobierz produkty
  // Fetch products
  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 20) {
          edges {
            node {
              id
              title
              images(first: 1) {
                edges {
                  node {
                    src
                  }
                }
              }
            }
          }
        }
      }
    `
  );
  const json = await response.json();
  const productList = json.data.products.edges.map(edge => edge.node);
  return { productList };
};



export default function Index() {
  const { productList } = useLoaderData();
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
                    {product.images.edges.length > 0 ? (
                      <img src={product.images.edges[0].node.src} alt={product.title} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                    ) : (
                      <span style={{ color: "#94a3b8" }}>No image</span>
                    )}
                  </td>
                  <td style={tdStyle}>{product.title}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 600 }}>0</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 600 }}>0</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#0f172a", fontWeight: 600 }}>0</td>
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
