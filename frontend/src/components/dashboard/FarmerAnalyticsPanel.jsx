import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { getErrorMessage } from '../../utils/errorMessages';

/**
 * FarmerAnalyticsPanel — analytics tab for farmers (FE-29).
 *
 * Date-range picker (7/30/90 days or custom), KPI tiles, revenue-over-time line
 * chart, top-products bar chart and views-vs-orders chart. Every chart has a
 * table fallback and CSV export. Data comes from GET /api/analytics/farmer/range.
 */

const PRESETS = [
  { key: '7', label: '7 d', days: 7 },
  { key: '30', label: '30 d', days: 30 },
  { key: '90', label: '90 d', days: 90 },
  { key: 'custom', label: 'Custom' },
];

const isoDay = (d) => d.toISOString().slice(0, 10);
function presetRange(days) {
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400000);
  return { from: isoDay(from), to: isoDay(to) };
}

const fmtXlm = (n) => `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`;
const fmtPct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

export function toCsv(columns, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)), ...rows.map((r) => columns.map((c) => esc(r[c.key])))]
    .map((line) => line.join(','))
    .join('\n');
}

function downloadCsv(filename, columns, rows) {
  const blob = new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const s = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 8px #0001', marginTop: 24 },
  h2: { fontSize: 18, fontWeight: 700, color: '#2d6a4f', margin: 0 },
  presetBtn: (active) => ({
    border: '1px solid #2d6a4f', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', minHeight: 36,
    background: active ? '#2d6a4f' : '#fff', color: active ? '#fff' : '#2d6a4f', fontWeight: 600,
  }),
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 },
  tile: { background: '#f1f8f4', borderRadius: 10, padding: 14 },
  tileLabel: { fontSize: 12, color: '#555' },
  tileValue: { fontSize: 20, fontWeight: 700, color: '#1b4332' },
  section: { marginTop: 24 },
  smallBtn: { border: '1px solid #ccc', background: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  table: { width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 },
};

function ChartSection({ title, csvName, columns, rows, children }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section style={s.section} aria-label={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={s.smallBtn} aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Show chart' : 'Show table'}
          </button>
          <button type="button" style={s.smallBtn} onClick={() => downloadCsv(csvName, columns, rows)}>
            Export CSV
          </button>
        </div>
      </div>
      {showTable ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>{columns.map((c) => <th key={c.key} scope="col" style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key} style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{r[c.key]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // The SVG is decorative for screen readers; the table toggle is the accessible view.
        <div aria-hidden="true">{children}</div>
      )}
    </section>
  );
}

function LineChart({ series, lines, height = 180 }) {
  const width = 600;
  const pad = 28;
  const max = Math.max(1, ...series.flatMap((d) => lines.map((l) => Number(d[l.key]) || 0)));
  const x = (i) => pad + (series.length <= 1 ? 0 : (i * (width - pad * 2)) / (series.length - 1));
  const y = (v) => height - pad - ((Number(v) || 0) / max) * (height - pad * 2);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#ccc" />
      {lines.map((l) => (
        <polyline
          key={l.key}
          fill="none"
          stroke={l.color}
          strokeWidth="2"
          points={series.map((d, i) => `${x(i)},${y(d[l.key])}`).join(' ')}
        />
      ))}
      <text x={pad} y={height - 8} fontSize="10" fill="#666">{series[0]?.day}</text>
      <text x={width - pad} y={height - 8} fontSize="10" fill="#666" textAnchor="end">{series[series.length - 1]?.day}</text>
      <text x={pad} y={pad - 10} fontSize="10" fill="#666">max {Math.round(max * 100) / 100}</text>
      {lines.length > 1 && lines.map((l, i) => (
        <text key={l.key} x={width - pad - i * 70} y={pad - 10} fontSize="10" fill={l.color} textAnchor="end">● {l.label}</text>
      ))}
    </svg>
  );
}

function BarChart({ rows, valueKey, labelKey }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div>
      {rows.map((r) => (
        <div key={r[labelKey]} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0', fontSize: 12 }}>
          <div style={{ width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[labelKey]}</div>
          <div style={{ flex: 1, background: '#eee', borderRadius: 4 }}>
            <div style={{ width: `${((Number(r[valueKey]) || 0) / max) * 100}%`, background: '#52b788', height: 14, borderRadius: 4 }} />
          </div>
          <div style={{ width: 90, textAlign: 'right' }}>{fmtXlm(r[valueKey])}</div>
        </div>
      ))}
    </div>
  );
}

export default function FarmerAnalyticsPanel() {
  const [preset, setPreset] = useState('30');
  const [range, setRange] = useState(() => presetRange(30));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ from, to }) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getAnalyticsRange(from, to);
      setData(res.data ?? null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (range.from && range.to && range.from <= range.to) load(range);
  }, [range, load]);

  function choosePreset(p) {
    setPreset(p.key);
    if (p.days) setRange(presetRange(p.days));
  }

  const series = data?.series ?? [];
  const top = data?.top_products ?? [];
  const k = data?.kpis ?? {};
  const isEmpty = !loading && data && !k.orders && !k.views && top.length === 0;
  const suffix = `${range.from}_${range.to}`;

  const seriesRows = useMemo(
    () => series.map((d) => ({ ...d, revenue: Number(d.revenue).toFixed(2) })),
    [series]
  );

  return (
    <div style={s.card} role="region" aria-labelledby="farmer-analytics-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 id="farmer-analytics-title" style={s.h2}>📊 Analytics</h2>
        <div role="group" aria-label="Date range" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {PRESETS.map((p) => (
            <button key={p.key} type="button" style={s.presetBtn(preset === p.key)} aria-pressed={preset === p.key} onClick={() => choosePreset(p)}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <>
              <label style={{ fontSize: 12 }}>
                From{' '}
                <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              </label>
              <label style={{ fontSize: 12 }}>
                To{' '}
                <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
              </label>
            </>
          )}
        </div>
      </div>

      {error && <div role="alert" style={{ color: '#c62828', marginTop: 12 }}>{error}</div>}
      {loading && <div style={{ marginTop: 12, color: '#666' }}>Loading analytics…</div>}

      {isEmpty && (
        <div style={{ marginTop: 24, textAlign: 'center', color: '#555' }} data-testid="analytics-empty">
          <div style={{ fontSize: 32 }}>🌱</div>
          <div style={{ fontWeight: 600 }}>No sales or views in this period yet</div>
          <div style={{ fontSize: 13 }}>List products and share them — your revenue, orders and views will show up here.</div>
        </div>
      )}

      {!loading && data && !isEmpty && (
        <>
          <div style={s.tiles}>
            <div style={s.tile}>
              <div style={s.tileLabel}>Revenue</div>
              <div style={s.tileValue}>{fmtXlm(k.revenue)}</div>
              {k.revenue_usd != null && <div style={{ fontSize: 11, color: '#666' }}>≈ ${Number(k.revenue_usd).toFixed(2)} at time of sale</div>}
            </div>
            <div style={s.tile}><div style={s.tileLabel}>Orders</div><div style={s.tileValue}>{k.orders}</div></div>
            <div style={s.tile}><div style={s.tileLabel}>Avg order value</div><div style={s.tileValue}>{fmtXlm(k.average_order_value)}</div></div>
            <div style={s.tile}><div style={s.tileLabel}>Conversion (orders / views)</div><div style={s.tileValue}>{fmtPct(k.conversion_rate)}</div></div>
            <div style={s.tile}><div style={s.tileLabel}>Repeat-buyer rate</div><div style={s.tileValue}>{fmtPct(k.repeat_buyer_rate)}</div></div>
          </div>

          <ChartSection
            title="Revenue over time"
            csvName={`revenue_${suffix}.csv`}
            columns={[{ key: 'day', label: 'Date' }, { key: 'revenue', label: 'Revenue (XLM)' }]}
            rows={seriesRows}
          >
            <LineChart series={series} lines={[{ key: 'revenue', label: 'Revenue', color: '#2d6a4f' }]} />
          </ChartSection>

          <ChartSection
            title="Top products"
            csvName={`top_products_${suffix}.csv`}
            columns={[{ key: 'name', label: 'Product' }, { key: 'revenue', label: 'Revenue (XLM)' }, { key: 'orders', label: 'Orders' }]}
            rows={top}
          >
            {top.length ? <BarChart rows={top} valueKey="revenue" labelKey="name" /> : <div style={{ fontSize: 12, color: '#666' }}>No paid orders in this period.</div>}
          </ChartSection>

          <ChartSection
            title="Views vs orders"
            csvName={`views_orders_${suffix}.csv`}
            columns={[{ key: 'day', label: 'Date' }, { key: 'views', label: 'Views' }, { key: 'orders', label: 'Orders' }]}
            rows={series}
          >
            <LineChart
              series={series}
              lines={[
                { key: 'views', label: 'Views', color: '#1e88e5' },
                { key: 'orders', label: 'Orders', color: '#e65100' },
              ]}
            />
          </ChartSection>
        </>
      )}
    </div>
  );
}
