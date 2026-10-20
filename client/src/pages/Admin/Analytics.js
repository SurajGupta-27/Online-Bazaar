import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Layout from "../../components/Layout/Layout";
import AdminMenu from "../../components/Layout/AdminMenu";
import { BarList, ChartCard, ColumnChart, SplitBar, StatTile } from "../../components/Charts/Charts";
import { CHART_COLORS, compactNumber, compactRupees, shortDate } from "../../components/Charts/chartFormat";
import { formatPrice } from "../../utils/formatPrice";
import { errorMessage } from "../../utils/errorMessage";

const PAID = { key: "revenue", label: "Paid", color: CHART_COLORS[0] };
const AWAITING_COD = { key: "unpaidCod", label: "Awaiting cash (COD)", color: CHART_COLORS[1] };
const ORDERS = { key: "orders", label: "Orders", color: CHART_COLORS[0] };
const STATUS_LABELS = {
  placed: "Placed", processing: "Processing", packed: "Packed", shipped: "Shipped",
  out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled",
};
const MAX_CATEGORIES = 8;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The largest categories, with the rest folded into "Other".
const foldCategories = (categories) => {
  if (categories.length <= MAX_CATEGORIES) return categories;
  const shown = categories.slice(0, MAX_CATEGORIES - 1);
  const rest = categories.slice(MAX_CATEGORIES - 1);
  return [
    ...shown,
    {
      _id: "other",
      name: `Other (${rest.length})`,
      sales: rest.reduce((sum, c) => sum + c.sales, 0),
      units: rest.reduce((sum, c) => sum + c.units, 0),
    },
  ];
};

const Analytics = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await axios.get("/api/v1/analytics/dashboard");
      setData(response);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Unable to load analytics"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;
  const daily = (data?.daily || []).map((d) => ({ key: d.date, label: shortDate(d.date), values: d }));
  const categories = foldCategories(data?.salesByCategory || []);
  const split = data?.paymentSplit || [];
  const cod = split.find((p) => p.method === "cod") || { orders: 0, value: 0 };
  const online = split.find((p) => p.method === "razorpay") || { orders: 0, value: 0 };

  return (
    <Layout title={"Dashboard - Analytics"}>
      <div className="container-fluid m-3 p-3">
        <div className="row">
          <div className="col-md-3">
            <AdminMenu />
          </div>
          <div className="col-md-9 analytics">
            <div className="analytics-header">
              <div>
                <h1>Analytics</h1>
                {data && (
                  <p className="text-muted mb-0">
                    Updated {new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    {" · "}days in India time
                  </p>
                )}
              </div>
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {error && <div className="alert alert-warning" role="alert">{error}</div>}
            {!data && !error && <p className="text-muted">Loading analytics...</p>}

            {/* Refetching keeps the last numbers on screen, dimmed. */}
            {s && (
              <div className={loading ? "analytics-body refreshing" : "analytics-body"}>
                <div className="stat-row">
                  <StatTile
                    label="Revenue"
                    value={formatPrice(s.revenue)}
                    detail={
                      s.unpaidCodOrders
                        ? `+ ${formatPrice(s.unpaidCod)} awaiting cash on delivery (${plural(s.unpaidCodOrders, "order")})`
                        : "Paid orders; cancelled ones excluded"
                    }
                  />
                  <StatTile label="Orders" value={s.orders.toLocaleString("en-IN")} detail={`${s.cancelledOrders} cancelled, not counted`} />
                  <StatTile label="Customers" value={s.customers.toLocaleString("en-IN")} detail={`${s.customersWithOrders} have ordered`} />
                  <StatTile label="Average order value" value={formatPrice(s.averageOrderValue)} detail="Across paid and COD orders" />
                </div>

                <div className="chart-grid">
                  <ChartCard
                    className="wide"
                    title="Revenue, last 30 days"
                    subtitle="Paid orders, and Cash on Delivery orders whose cash hasn't been collected yet"
                    table={{
                      columns: ["Day", "Paid", "Awaiting cash (COD)", "Orders"],
                      rows: (data.daily || []).map((d) => [shortDate(d.date), formatPrice(d.revenue), formatPrice(d.unpaidCod), d.orders]),
                    }}
                  >
                    <ColumnChart data={daily} series={[PAID, AWAITING_COD]} format={formatPrice} tickFormat={compactRupees} label="Revenue per day" />
                  </ChartCard>

                  <ChartCard className="wide" title="Orders, last 30 days" subtitle="Orders placed each day, cancelled ones excluded">
                    <ColumnChart data={daily} series={[ORDERS]} format={(n) => plural(n, "order")} tickFormat={compactNumber} height={140} label="Orders per day" />
                  </ChartCard>

                  <ChartCard
                    title="Top 5 products"
                    subtitle="By units sold"
                    table={{
                      columns: ["Product", "Units", "Sales"],
                      rows: data.topProducts.map((p) => [p.name, p.units, formatPrice(p.sales)]),
                    }}
                  >
                    <BarList
                      rows={data.topProducts.map((p) => ({ key: p._id, label: p.name, value: p.units, detail: formatPrice(p.sales), slug: p.slug }))}
                      format={(n) => plural(n, "unit")}
                      empty="No sales yet"
                      renderLabel={(row) => (row.slug ? <Link to={`/product/${row.slug}`}>{row.label}</Link> : row.label)}
                    />
                  </ChartCard>

                  <ChartCard
                    title="Sales by category"
                    subtitle="Value of items sold"
                    table={{
                      columns: ["Category", "Sales", "Units"],
                      rows: (data.salesByCategory || []).map((c) => [c.name, formatPrice(c.sales), c.units]),
                    }}
                  >
                    <BarList
                      rows={categories.map((c) => ({ key: c._id || c.name, label: c.name, value: c.sales, detail: plural(c.units, "unit") }))}
                      format={formatPrice}
                      empty="No sales yet"
                    />
                  </ChartCard>

                  <ChartCard
                    title="Cash on Delivery vs online"
                    subtitle="Share of orders"
                    table={{
                      columns: ["Payment", "Orders", "Value"],
                      rows: [
                        ["Cash on Delivery", cod.orders, formatPrice(cod.value)],
                        ["Online (Razorpay)", online.orders, formatPrice(online.value)],
                      ],
                    }}
                  >
                    <SplitBar
                      format={(n) => plural(n, "order")}
                      parts={[
                        { key: "cod", label: "Cash on Delivery", value: cod.orders, detail: formatPrice(cod.value), color: CHART_COLORS[0] },
                        { key: "online", label: "Online", value: online.orders, detail: formatPrice(online.value), color: CHART_COLORS[1] },
                      ]}
                    />
                  </ChartCard>

                  <ChartCard
                    title="Order status"
                    subtitle="Every order, including cancelled"
                    table={{
                      columns: ["Status", "Orders"],
                      rows: data.statusBreakdown.map((x) => [STATUS_LABELS[x.status] || x.status, x.orders]),
                    }}
                  >
                    <BarList
                      rows={data.statusBreakdown.map((x) => ({ key: x.status, label: STATUS_LABELS[x.status] || x.status, value: x.orders }))}
                      format={(n) => n.toLocaleString("en-IN")}
                      empty="No orders yet"
                    />
                  </ChartCard>
                </div>

                <section className="chart-card low-stock" aria-label="Low stock">
                  <header>
                    <h2 className="chart-title">Low stock</h2>
                    <p className="chart-subtitle">
                      {data.lowStock.total
                        ? `${plural(data.lowStock.total, "product")} with ${data.lowStock.limit} or fewer left${
                            data.lowStock.total > data.lowStock.products.length ? `; the ${data.lowStock.products.length} lowest are shown` : ""
                          }`
                        : `Every product has more than ${data.lowStock.limit} in stock.`}
                    </p>
                  </header>
                  {data.lowStock.products.length > 0 && (
                    <div className="table-responsive">
                      <table className="table align-middle mb-0">
                        <thead>
                          <tr>
                            <th scope="col">Product</th>
                            <th scope="col">Category</th>
                            <th scope="col" className="text-end">Price</th>
                            <th scope="col" className="text-end">In stock</th>
                            <th scope="col"><span className="visually-hidden">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.lowStock.products.map((p) => (
                            <tr key={p._id}>
                              <td>{p.name}</td>
                              <td>{p.category || "—"}</td>
                              <td className="text-end num">{formatPrice(p.price)}</td>
                              <td className="text-end num">
                                {p.quantity === 0 ? (
                                  <span className="stock-status out">Out of stock</span>
                                ) : (
                                  <span className="stock-status low">{p.quantity} left</span>
                                )}
                              </td>
                              <td className="text-end">
                                <Link to={`/dashboard/admin/product/${p.slug}`} className="btn btn-sm btn-outline-primary">
                                  Restock
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Analytics;
