/**
 * SEO share pages (FE-32).
 *
 * nginx routes crawler / link-unfurler user agents for /product/:id and
 * /farmer/:id here, so they get minimal HTML with Open Graph, Twitter card,
 * canonical and (for products) Product JSON-LD instead of the empty SPA shell.
 */

const router = require('express').Router();
const db = require('../db/schema');

const BASE_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteUrl(url) {
  if (!url) return `${BASE_URL}/og-default.png`;
  return /^https?:\/\//.test(url) ? url : `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function truncate(str, n = 200) {
  const s = String(str ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function renderPage({ title, description, image, canonical, type, jsonLd }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(image);
  const url = escapeHtml(canonical);
  // `<` is escaped so a product name can't close the script tag.
  const ld = jsonLd
    ? `\n<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Farmers Marketplace">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">${ld}
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${url}">View on Farmers Marketplace</a></p>
</body>
</html>`;
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function notFound(res) {
  res.status(404).type('html').send(
    renderPage({
      title: 'Not found — Farmers Marketplace',
      description: 'This page could not be found.',
      image: absoluteUrl(null),
      canonical: BASE_URL,
      type: 'website',
    })
  );
}

// GET /seo/product/:id
router.get('/product/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return notFound(res);

  const { rows } = await db.query(
    `SELECT p.id, p.name, p.description, p.price, p.quantity, p.image_url, u.name as farmer_name,
            (SELECT ROUND(AVG(r.rating)${db.isPostgres ? '::numeric' : ''}, 1) FROM reviews r WHERE r.product_id = p.id) as avg_rating,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) as review_count
     FROM products p JOIN users u ON u.id = p.farmer_id
     WHERE p.id = $1`,
    [id]
  );
  const p = rows[0];
  if (!p) return notFound(res);

  const canonical = `${BASE_URL}/product/${p.id}`;
  const image = absoluteUrl(p.image_url);
  const description = truncate(p.description || `${p.name} from ${p.farmer_name} on Farmers Marketplace.`);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    image: [image],
    description,
    url: canonical,
    brand: { '@type': 'Brand', name: p.farmer_name },
    offers: {
      '@type': 'Offer',
      url: canonical,
      price: String(p.price),
      priceCurrency: 'XLM',
      availability: Number(p.quantity) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  if (Number(p.review_count) > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(p.avg_rating),
      reviewCount: Number(p.review_count),
    };
  }

  res
    .set('Cache-Control', 'public, max-age=600')
    .type('html')
    .send(renderPage({ title: `${p.name} — ${p.price} XLM`, description, image, canonical, type: 'product', jsonLd }));
});

// GET /seo/farmer/:id
router.get('/farmer/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return notFound(res);

  const { rows } = await db.query(
    `SELECT id, name, bio, avatar_url FROM users WHERE id = $1 AND role = 'farmer'`,
    [id]
  ).catch(() => db.query(`SELECT id, name FROM users WHERE id = $1 AND role = 'farmer'`, [id]));
  const f = rows[0];
  if (!f) return notFound(res);

  res
    .set('Cache-Control', 'public, max-age=600')
    .type('html')
    .send(
      renderPage({
        title: `${f.name} — Farmers Marketplace`,
        description: truncate(f.bio || `Buy fresh produce directly from ${f.name} on Farmers Marketplace.`),
        image: absoluteUrl(f.avatar_url),
        canonical: `${BASE_URL}/farmer/${f.id}`,
        type: 'profile',
      })
    );
});

module.exports = router;
module.exports.renderPage = renderPage;
