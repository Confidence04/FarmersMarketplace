const router = require('express').Router();
const db = require('../db/schema');
const { monthBucket, sixMonthsAgo } = require('../db/dialect');
const auth = require('../middleware/auth');
const { err } = require('../middleware/error');

// All analytics routes require authentication
router.use(auth);

// GET /api/analytics/farmer
router.get('/farmer', async (req, res) => {
  if (req.user.role !== 'farmer') return err(res, 403, 'Farmers only', 'forbidden');
  const farmerId = req.user.id;

  // BE-37: Include fiat revenue aggregation
  const { rows: totalsRows } = await db.query(
    `SELECT COUNT(*) as order_count, 
            COALESCE(SUM(o.total_price), 0) as total_revenue,
            COALESCE(SUM(o.fiat_total), 0) as total_revenue_usd
     FROM orders o JOIN products p ON o.product_id = p.id
     WHERE p.farmer_id = $1 AND o.status = 'paid'`,
    [farmerId]
  );

  const { rows: topProducts } = await db.query(
    `SELECT p.name, COALESCE(SUM(o.total_price), 0) as revenue, COUNT(*) as orders
     FROM orders o JOIN products p ON o.product_id = p.id
     WHERE p.farmer_id = $1 AND o.status = 'paid'
     GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 5`,
    [farmerId]
  );

  const monthlyQuery = `SELECT ${monthBucket('o.created_at', db.isPostgres)} as month,
          COALESCE(SUM(o.total_price), 0) as revenue,
          COALESCE(SUM(o.fiat_total), 0) as revenue_usd,
          COUNT(*) as orders
   FROM orders o JOIN products p ON o.product_id = p.id
   WHERE p.farmer_id = $1 AND o.status = 'paid'
     AND o.created_at >= ${sixMonthsAgo(db.isPostgres)}
   GROUP BY month ORDER BY month ASC`;

  const { rows: monthly } = await db.query(monthlyQuery, [farmerId]);

  res.json({
    success: true,
    data: {
      total_revenue: totalsRows[0].total_revenue,
      total_revenue_usd: parseFloat(totalsRows[0].total_revenue_usd) || null,
      order_count: totalsRows[0].order_count,
      top_products: topProducts,
      monthly,
    },
  });
});

// GET /api/analytics/farmer/range?from=YYYY-MM-DD&to=YYYY-MM-DD (FE-29)
// KPIs plus daily revenue/orders/views series for the analytics tab.
router.get('/farmer/range', async (req, res) => {
  if (req.user.role !== 'farmer') return err(res, 403, 'Farmers only', 'forbidden');
  const farmerId = req.user.id;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().slice(0, 10);
  const to = isoDate.test(req.query.to || '') ? req.query.to : today;
  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const from = isoDate.test(req.query.from || '') ? req.query.from : defaultFrom;
  if (from > to) return err(res, 400, '`from` must be on or before `to`', 'validation_error');

  const day = (col) => (db.isPostgres ? `TO_CHAR(${col}, 'YYYY-MM-DD')` : `date(${col})`);
  const range = (col) => `${day(col)} >= $2 AND ${day(col)} <= $3`;
  const params = [farmerId, from, to];

  const { rows: totals } = await db.query(
    `SELECT COUNT(*) as order_count,
            COALESCE(SUM(o.total_price), 0) as revenue,
            COALESCE(SUM(o.fiat_total), 0) as revenue_usd,
            COUNT(DISTINCT o.buyer_id) as buyers
     FROM orders o JOIN products p ON o.product_id = p.id
     WHERE p.farmer_id = $1 AND o.status = 'paid' AND ${range('o.created_at')}`,
    params
  );

  const { rows: repeat } = await db.query(
    `SELECT COUNT(*) as repeat_buyers FROM (
       SELECT o.buyer_id FROM orders o JOIN products p ON o.product_id = p.id
       WHERE p.farmer_id = $1 AND o.status = 'paid' AND ${range('o.created_at')}
       GROUP BY o.buyer_id HAVING COUNT(*) > 1
     ) t`,
    params
  );

  const { rows: daily } = await db.query(
    `SELECT ${day('o.created_at')} as day,
            COALESCE(SUM(o.total_price), 0) as revenue,
            COUNT(*) as orders
     FROM orders o JOIN products p ON o.product_id = p.id
     WHERE p.farmer_id = $1 AND o.status = 'paid' AND ${range('o.created_at')}
     GROUP BY day ORDER BY day ASC`,
    params
  );

  const { rows: dailyViews } = await db.query(
    `SELECT ${day('v.viewed_at')} as day, COUNT(*) as views
     FROM product_views v JOIN products p ON v.product_id = p.id
     WHERE p.farmer_id = $1 AND ${range('v.viewed_at')}
     GROUP BY day ORDER BY day ASC`,
    params
  ).catch(() => ({ rows: [] }));

  const { rows: topProducts } = await db.query(
    `SELECT p.name, COALESCE(SUM(o.total_price), 0) as revenue, COUNT(*) as orders
     FROM orders o JOIN products p ON o.product_id = p.id
     WHERE p.farmer_id = $1 AND o.status = 'paid' AND ${range('o.created_at')}
     GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 5`,
    params
  );

  const t = totals[0] || {};
  const orders = Number(t.order_count) || 0;
  const revenue = Number(t.revenue) || 0;
  const buyers = Number(t.buyers) || 0;
  const views = dailyViews.reduce((sum, r) => sum + (Number(r.views) || 0), 0);

  // Merge orders and views into one zero-filled daily series.
  const byDay = new Map();
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { day: key, revenue: 0, orders: 0, views: 0 });
  }
  for (const r of daily) if (byDay.has(r.day)) Object.assign(byDay.get(r.day), { revenue: Number(r.revenue) || 0, orders: Number(r.orders) || 0 });
  for (const r of dailyViews) if (byDay.has(r.day)) byDay.get(r.day).views = Number(r.views) || 0;

  res.json({
    success: true,
    data: {
      from,
      to,
      kpis: {
        revenue,
        revenue_usd: parseFloat(t.revenue_usd) || null,
        orders,
        average_order_value: orders ? revenue / orders : 0,
        views,
        conversion_rate: views ? orders / views : null,
        repeat_buyer_rate: buyers ? (Number(repeat[0]?.repeat_buyers) || 0) / buyers : 0,
      },
      series: [...byDay.values()],
      top_products: topProducts.map((p) => ({ ...p, revenue: Number(p.revenue) || 0, orders: Number(p.orders) || 0 })),
    },
  });
});

// GET /api/analytics/farmer/waitlist — waitlist analytics per product (farmer only)
router.get('/farmer/waitlist', async (req, res) => {
  if (req.user.role !== 'farmer') return err(res, 403, 'Farmers only', 'forbidden');
  const farmerId = req.user.id;

  // Queue length: active waitlist entries per product
  const { rows: queueRows } = await db.query(
    `SELECT w.product_id, p.name AS product_name, COUNT(*) AS queue_length
     FROM waitlist_entries w
     JOIN products p ON w.product_id = p.id
     WHERE p.farmer_id = $1
     GROUP BY w.product_id, p.name`,
    [farmerId]
  );

  // Average wait time: time from waitlist join to first paid order for that buyer+product
  const { rows: waitRows } = await db.query(
    db.isPostgres
      ? `SELECT w.product_id,
                AVG(EXTRACT(EPOCH FROM (o.created_at - w.created_at)) / 3600) AS avg_wait_hours
         FROM waitlist_entries w
         JOIN orders o ON o.product_id = w.product_id AND o.buyer_id = w.buyer_id AND o.status = 'paid'
         JOIN products p ON w.product_id = p.id
         WHERE p.farmer_id = $1
         GROUP BY w.product_id`
      : `SELECT w.product_id,
                AVG((julianday(o.created_at) - julianday(w.created_at)) * 24) AS avg_wait_hours
         FROM waitlist_entries w
         JOIN orders o ON o.product_id = w.product_id AND o.buyer_id = w.buyer_id AND o.status = 'paid'
         JOIN products p ON w.product_id = p.id
         WHERE p.farmer_id = ?
         GROUP BY w.product_id`,
    [farmerId]
  );

  // Conversion rate: paid orders / total waitlist joins per product
  const { rows: convRows } = await db.query(
    `SELECT w.product_id,
            COUNT(DISTINCT w.buyer_id) AS total_joins,
            COUNT(DISTINCT o.buyer_id) AS converted
     FROM waitlist_entries w
     JOIN products p ON w.product_id = p.id
     LEFT JOIN orders o ON o.product_id = w.product_id AND o.buyer_id = w.buyer_id AND o.status = 'paid'
     WHERE p.farmer_id = $1
     GROUP BY w.product_id`,
    [farmerId]
  );

  // Merge results by product_id
  const waitMap = new Map(waitRows.map((r) => [Number(r.product_id), r]));
  const convMap = new Map(convRows.map((r) => [Number(r.product_id), r]));

  const ALERT_THRESHOLD = 10;
  const analytics = queueRows.map((r) => {
    const pid = Number(r.product_id);
    const wait = waitMap.get(pid);
    const conv = convMap.get(pid);
    const totalJoins = conv ? Number(conv.total_joins) : 0;
    const converted = conv ? Number(conv.converted) : 0;
    return {
      product_id: pid,
      product_name: r.product_name,
      queue_length: Number(r.queue_length),
      avg_wait_hours: wait ? parseFloat(Number(wait.avg_wait_hours).toFixed(2)) : null,
      conversion_rate: totalJoins > 0 ? parseFloat(((converted / totalJoins) * 100).toFixed(1)) : null,
      alert: Number(r.queue_length) > ALERT_THRESHOLD,
    };
  });

  res.json({ success: true, data: analytics });
});

// GET /api/analytics/farmer/forecast
router.get('/farmer/forecast', async (req, res) => {
  if (req.user.role !== 'farmer') return err(res, 403, 'Farmers only', 'forbidden');

  const farmerId = req.user.id;
  const query = db.isPostgres
    ? `SELECT p.id AS product_id,
              p.name AS product_name,
              DATE_TRUNC('week', o.created_at) AS week_start,
              SUM(o.quantity) AS units_sold
       FROM products p
       LEFT JOIN orders o ON o.product_id = p.id
         AND o.status = 'paid'
         AND o.created_at >= NOW() - INTERVAL '8 weeks'
       WHERE p.farmer_id = $1
       GROUP BY p.id, p.name, week_start
       ORDER BY p.id, week_start ASC`
    : `SELECT p.id AS product_id,
              p.name AS product_name,
              strftime('%Y-%W', o.created_at) AS week_key,
              SUM(o.quantity) AS units_sold
       FROM products p
       LEFT JOIN orders o ON o.product_id = p.id
         AND o.status = 'paid'
         AND o.created_at >= datetime('now', '-56 days')
       WHERE p.farmer_id = ?
       GROUP BY p.id, p.name, week_key
       ORDER BY p.id, week_key ASC`;

  const { rows } = await db.query(query, [farmerId]);

  const byProduct = new Map();
  for (const row of rows) {
    if (!byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, {
        product_id: row.product_id,
        product_name: row.product_name,
        weeks: [],
      });
    }
    if (row.units_sold != null) {
      byProduct.get(row.product_id).weeks.push(Number(row.units_sold));
    }
  }

  const forecast = [];
  for (const [, p] of byProduct.entries()) {
    const weekCount = p.weeks.length;
    if (weekCount < 2) {
      forecast.push({
        product_id: p.product_id,
        product_name: p.product_name,
        avg_weekly_sales: null,
        trend: 'stable',
        note: 'Insufficient data',
      });
      continue;
    }

    const sum = p.weeks.reduce((acc, v) => acc + v, 0);
    const avg = sum / weekCount;

    const half = Math.floor(weekCount / 2);
    const firstHalfAvg = p.weeks.slice(0, half).reduce((a, v) => a + v, 0) / half;
    const secondHalfAvg = p.weeks.slice(half).reduce((a, v) => a + v, 0) / (weekCount - half);
    const delta = secondHalfAvg - firstHalfAvg;
    const threshold = Math.max(1, firstHalfAvg * 0.1);

    let trend = 'stable';
    if (delta > threshold) trend = 'up';
    if (delta < -threshold) trend = 'down';

    forecast.push({
      product_id: p.product_id,
      product_name: p.product_name,
      avg_weekly_sales: Number(avg.toFixed(2)),
      trend,
    });
  }

  res.json({ success: true, data: forecast });
});

// GET /api/analytics/farmer/demand-heatmap - Geographic demand heatmap
router.get('/farmer/demand-heatmap', async (req, res) => {
  if (req.user.role !== 'farmer') return err(res, 403, 'Farmers only', 'forbidden');

  const farmerId = req.user.id;
  const { from, to } = req.query;

  // Build date filter
  let dateFilter = '';
  const params = [farmerId];
  if (from) {
    dateFilter += ` AND o.created_at >= $${params.length + 1}`;
    params.push(from);
  }
  if (to) {
    dateFilter += ` AND o.created_at <= $${params.length + 1}`;
    params.push(to);
  }

  // Aggregate orders by buyer city/region
  const query = `
    SELECT 
      COALESCE(a.city, 'Unknown') as city,
      COALESCE(a.state, 'Unknown') as state,
      COALESCE(a.country, 'Unknown') as country,
      COALESCE(a.latitude, 0) as latitude,
      COALESCE(a.longitude, 0) as longitude,
      COUNT(*) as order_count,
      COALESCE(SUM(o.total_price), 0) as total_revenue
    FROM orders o
    JOIN products p ON o.product_id = p.id
    JOIN users buyer ON o.buyer_id = buyer.id
    LEFT JOIN addresses a ON buyer.id = a.user_id AND a.is_default = true
    WHERE p.farmer_id = $1 AND o.status = 'paid' ${dateFilter}
    GROUP BY a.city, a.state, a.country, a.latitude, a.longitude
    ORDER BY order_count DESC
  `;

  const { rows: regions } = await db.query(query, params);

  // Build GeoJSON FeatureCollection
  const features = regions
    .filter(r => r.latitude !== 0 && r.longitude !== 0) // Only include entries with valid coordinates
    .map(r => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(r.longitude), parseFloat(r.latitude)],
      },
      properties: {
        city: r.city,
        state: r.state,
        country: r.country,
        order_count: parseInt(r.order_count),
        total_revenue: parseFloat(r.total_revenue),
      },
    }));

  const geoJson = {
    type: 'FeatureCollection',
    features,
  };

  // Get top 5 regions
  const topRegions = regions.slice(0, 5).map(r => ({
    region: `${r.city}, ${r.state}, ${r.country}`,
    orders: parseInt(r.order_count),
    revenue: parseFloat(r.total_revenue),
  }));

  res.json({
    success: true,
    data: {
      geoJson,
      topRegions,
      totalRegions: regions.length,
    },
  });
});

module.exports = router;
