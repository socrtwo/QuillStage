/** Chart renderer for slide charts (column, bar, line, area, pie, doughnut, scatter, radar) as SVG. */
import type { ChartElement, Color } from '../model/types';

type Chart = ChartElement['chart'];
const n = (v: number) => (Number.isFinite(v) ? +v.toFixed(2) : 0);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SERIES: Color[] = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function renderChart(c: Chart, w: number, h: number, color: (c: Color) => string, id: string): string {
  const out: string[] = [];
  const font = 'font-family="Carlito, Arimo, sans-serif"';
  const txt = color('tx1');
  out.push(`<rect width="${n(w)}" height="${n(h)}" fill="none"/>`);
  let top = 8;
  if (c.title) { out.push(`<text x="${n(w / 2)}" y="${n(22)}" text-anchor="middle" font-size="16" ${font} fill="${txt}">${esc(c.title)}</text>`); top = 34; }
  const legend = c.legend ?? 'b';
  const seriesColor = (i: number) => color(c.series[i]?.color || SERIES[i % SERIES.length]);
  const isPie = c.type === 'pie' || c.type === 'doughnut';
  const legendItems = isPie ? c.categories : c.series.map((s) => s.name);
  let bottom = h - 8, right = w - 8;
  if (legend === 'b' && legendItems.length) {
    bottom -= 22;
    let x = 0;
    const widths = legendItems.map((t) => 16 + t.length * 6.5 + 12);
    const total = widths.reduce((a, b) => a + b, 0);
    x = Math.max(4, (w - total) / 2);
    legendItems.forEach((t, i) => {
      out.push(`<rect x="${n(x)}" y="${n(h - 22)}" width="10" height="10" fill="${isPie ? color(SERIES[i % 6]) : seriesColor(i)}"/><text x="${n(x + 14)}" y="${n(h - 13)}" font-size="11" ${font} fill="${txt}">${esc(t)}</text>`);
      x += widths[i];
    });
  } else if (legend === 'r' && legendItems.length) {
    right -= 110;
    legendItems.forEach((t, i) => out.push(`<rect x="${n(right + 14)}" y="${n(top + 8 + i * 18)}" width="10" height="10" fill="${isPie ? color(SERIES[i % 6]) : seriesColor(i)}"/><text x="${n(right + 28)}" y="${n(top + 17 + i * 18)}" font-size="11" ${font} fill="${txt}">${esc(t)}</text>`));
  }
  const pw = right - 8, ph = bottom - top;
  if (isPie) {
    const vals = (c.series[0]?.values || []).map((v) => Math.max(0, v || 0));
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = 8 + pw / 2, cy = top + ph / 2, r = Math.max(4, Math.min(pw, ph) / 2 - 4);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = vals.length === 1 || v === sum ? `M${n(cx - r)} ${n(cy)} A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)} A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)} Z` : `M${n(cx)} ${n(cy)} L${n(cx + r * Math.cos(a0))} ${n(cy + r * Math.sin(a0))} A${n(r)} ${n(r)} 0 ${large} 1 ${n(cx + r * Math.cos(a1))} ${n(cy + r * Math.sin(a1))} Z`;
      out.push(`<path d="${p}" fill="${color(SERIES[i % 6])}" stroke="${color('bg1')}" stroke-width="1"/>`);
      if (c.labels) { const m = (a0 + a1) / 2; out.push(`<text x="${n(cx + r * 0.65 * Math.cos(m))}" y="${n(cy + r * 0.65 * Math.sin(m))}" text-anchor="middle" font-size="11" ${font} fill="${color('bg1')}">${Math.round((v / sum) * 100)}%</text>`); }
      a0 = a1;
    });
    if (c.type === 'doughnut') out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.5)}" fill="${color('bg1')}"/>`);
    return out.join('');
  }
  const all = c.series.flatMap((s) => s.values.filter((v): v is number => v != null));
  let maxV = Math.max(0, ...all), minV = Math.min(0, ...all);
  if (c.stacked) {
    const sums = c.categories.map((_, i) => c.series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0));
    maxV = c.stacked === 'percent' ? 1 : Math.max(0, ...sums);
  }
  maxV = niceMax(maxV);
  if (minV < 0) minV = -niceMax(-minV);
  const left = 8 + 40;
  const plotW = pw - 40, plotH = ph - 18;
  const horizontal = c.type === 'bar';
  const scale = (v: number) => (horizontal ? ((v - minV) / (maxV - minV)) * plotW : plotH - ((v - minV) / (maxV - minV)) * plotH);
  // Gridlines and value axis
  for (let k = 0; k <= 4; k++) {
    const v = minV + ((maxV - minV) * k) / 4;
    const label = c.stacked === 'percent' ? `${Math.round(v * 100)}%` : Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${+v.toFixed(2)}`;
    if (horizontal) { const x = left + scale(v); out.push(`<path d="M${n(x)} ${n(top)} V${n(top + plotH)}" stroke="#ccc" stroke-width="0.5"/><text x="${n(x)}" y="${n(top + plotH + 13)}" text-anchor="middle" font-size="10" ${font} fill="${txt}">${label}</text>`); }
    else { const y = top + scale(v); out.push(`<path d="M${n(left)} ${n(y)} H${n(left + plotW)}" stroke="#ccc" stroke-width="0.5"/><text x="${n(left - 4)}" y="${n(y + 3)}" text-anchor="end" font-size="10" ${font} fill="${txt}">${label}</text>`); }
  }
  const nc = Math.max(1, c.categories.length);
  const band = (horizontal ? plotH : plotW) / nc;
  c.categories.forEach((cat, i) => {
    if (horizontal) out.push(`<text x="${n(left - 4)}" y="${n(top + band * (i + 0.5) + 3)}" text-anchor="end" font-size="10" ${font} fill="${txt}">${esc(cat)}</text>`);
    else out.push(`<text x="${n(left + band * (i + 0.5))}" y="${n(top + plotH + 13)}" text-anchor="middle" font-size="10" ${font} fill="${txt}">${esc(cat)}</text>`);
  });
  if (c.type === 'column' || c.type === 'bar') {
    const ns = c.series.length || 1;
    const gap = band * 0.2;
    const bw = c.stacked ? band - 2 * gap : (band - 2 * gap) / ns;
    const base = new Array(nc).fill(0);
    const sums = c.categories.map((_, i) => c.series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0) || 1);
    c.series.forEach((s, si) => {
      s.values.forEach((raw, i) => {
        if (raw == null || i >= nc) return;
        const v = c.stacked === 'percent' ? raw / sums[i] : raw;
        const from = c.stacked ? base[i] : 0, to = from + v;
        if (c.stacked) base[i] = to;
        const off = band * i + gap + (c.stacked ? 0 : bw * si);
        if (horizontal) { const x0 = left + scale(Math.min(from, to)), x1 = left + scale(Math.max(from, to)); out.push(`<rect x="${n(x0)}" y="${n(top + off)}" width="${n(x1 - x0)}" height="${n(bw)}" fill="${seriesColor(si)}"/>`); }
        else { const y0 = top + scale(Math.max(from, to)), y1 = top + scale(Math.min(from, to)); out.push(`<rect x="${n(left + off)}" y="${n(y0)}" width="${n(bw)}" height="${n(y1 - y0)}" fill="${seriesColor(si)}"/>`); }
        if (c.labels) out.push(`<text x="${n(horizontal ? left + scale(to) + 3 : left + off + bw / 2)}" y="${n(horizontal ? top + off + bw / 2 + 3 : top + scale(to) - 3)}" text-anchor="${horizontal ? 'start' : 'middle'}" font-size="10" ${font} fill="${txt}">${+raw.toFixed(2)}</text>`);
      });
    });
  } else if (c.type === 'line' || c.type === 'area' || c.type === 'radar') {
    c.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [left + band * (i + 0.5), top + scale(v ?? 0)] as [number, number]);
      if (!pts.length) return;
      const d = 'M' + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L');
      if (c.type === 'area') out.push(`<path d="${d} L${n(pts[pts.length - 1][0])} ${n(top + scale(Math.max(0, minV)))} L${n(pts[0][0])} ${n(top + scale(Math.max(0, minV)))} Z" fill="${seriesColor(si)}" opacity="0.7"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${seriesColor(si)}" stroke-width="2.25"/>`);
      for (const [x, y] of pts) out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="2.5" fill="${seriesColor(si)}"/>`);
    });
  } else if (c.type === 'scatter') {
    const xs = c.categories.map((t, i) => (Number.isFinite(+t) ? +t : i + 1));
    const xmax = niceMax(Math.max(...xs, 1)), xmin = Math.min(0, ...xs);
    c.series.forEach((s, si) => s.values.forEach((v, i) => {
      if (v == null) return;
      out.push(`<circle cx="${n(left + ((xs[i] - xmin) / (xmax - xmin)) * plotW)}" cy="${n(top + scale(v))}" r="3.5" fill="${seriesColor(si)}"/>`);
    }));
  }
  void id;
  return out.join('');
}
