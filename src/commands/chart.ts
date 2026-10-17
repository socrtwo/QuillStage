/** Chart Design: data, type, elements, layouts, colors, styles. */
import { def } from './registry';
import type { App } from '../app';
import type { ChartElement, ChartType, Color } from '../model/types';
import { edit } from '../edit/ops';
import { openDialog, toast } from '../ui/dialog';
import { CHART_TYPES, chartTsv, parseTsv } from './insert';
import { THEME_PRESETS, cssColor } from '../model/theme';

const charts = (app: App) => app.selected.filter((e): e is ChartElement => e.kind === 'chart');
const hasChart = (app: App) => charts(app).length > 0;

function withCharts(app: App, label: string, fn: (c: ChartElement['chart'], el: ChartElement) => void): void {
  const ids = new Set(charts(app).map((c) => c.id));
  if (!ids.size) { toast('Select a chart first.'); return; }
  edit(app, label, (o) => { for (const e of o.elements) if (ids.has(e.id)) { fn((e as ChartElement).chart, e as ChartElement); delete (e as ChartElement).rawXml; } });
}

const PALETTES: { label: string; colors: Color[] }[] = [
  { label: 'Colorful', colors: ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] },
  { label: 'Monochrome Accent 1', colors: [{ s: 'accent1', lum: -0.5 }, { s: 'accent1', lum: -0.25 }, 'accent1', { s: 'accent1', lum: 0.4 }, { s: 'accent1', lum: 0.6 }, { s: 'accent1', lum: 0.8 }] },
  { label: 'Monochrome Accent 2', colors: [{ s: 'accent2', lum: -0.5 }, { s: 'accent2', lum: -0.25 }, 'accent2', { s: 'accent2', lum: 0.4 }, { s: 'accent2', lum: 0.6 }, { s: 'accent2', lum: 0.8 }] },
  { label: 'Grayscale', colors: ['#262626', '#595959', '#7F7F7F', '#A6A6A6', '#BFBFBF', '#D9D9D9'] },
  ...THEME_PRESETS.slice(1).map((p) => ({ label: `${p.name} colors`, colors: [p.colors.accent1, p.colors.accent2, p.colors.accent3, p.colors.accent4, p.colors.accent5, p.colors.accent6] as Color[] })),
];

const LAYOUTS: { label: string; apply: (c: ChartElement['chart']) => void }[] = [
  { label: 'Title and Legend Below', apply: (c) => { c.title ||= 'Chart Title'; c.legend = 'b'; c.labels = false; } },
  { label: 'Title and Legend Right', apply: (c) => { c.title ||= 'Chart Title'; c.legend = 'r'; c.labels = false; } },
  { label: 'Data Labels, No Legend', apply: (c) => { c.legend = 'none'; c.labels = true; } },
  { label: 'Minimal (no title, no legend)', apply: (c) => { c.title = undefined; c.legend = 'none'; c.labels = false; } },
  { label: 'Everything', apply: (c) => { c.title ||= 'Chart Title'; c.legend = 'b'; c.labels = true; } },
];

def([
  {
    id: 'chart.editData', label: 'Edit Data', icon: 'dataset', tab: 'Chart Design', group: 'Data', edits: true, isEnabled: (app) => charts(app).length === 1,
    tip: 'Edit the numbers: first row series names, first column categories (tab- or comma-separated)',
    run: async (app) => {
      const c = charts(app)[0].chart;
      const r = await openDialog({ title: 'Edit Chart Data', wide: true, fields: [{ key: 'data', label: 'Data', type: 'textarea', rows: 10, value: chartTsv(c) }] });
      if (!r) return;
      const { categories, series } = parseTsv(r.data);
      if (!series.length) { toast('The data needs a header row with at least one series.'); return; }
      withCharts(app, 'Edit Chart Data', (ch) => { ch.categories = categories; ch.series = series.map((s, i) => ({ ...s, ...(ch.series[i]?.color ? { color: ch.series[i].color } : {}) })); });
    },
  },
  {
    id: 'chart.changeType', label: 'Change Chart Type', icon: 'bar_chart', tab: 'Chart Design', group: 'Type', kind: 'menu', edits: true, isEnabled: hasChart,
    run: (app, type?: ChartType) => { if (type && CHART_TYPES.some((t) => t.type === type)) withCharts(app, 'Change Chart Type', (c) => { c.type = type; }); },
    menu: (app) => [...CHART_TYPES.map((t) => ({ id: 'chart.changeType', arg: t.type, label: t.label, icon: t.icon, checked: charts(app)[0]?.chart.type === t.type })), { separator: true }, { id: 'chart.stacked', arg: false, label: 'Clustered' }, { id: 'chart.stacked', arg: true, label: 'Stacked' }, { id: 'chart.stacked', arg: 'percent', label: '100% Stacked' }],
  },
  {
    id: 'chart.stacked', label: 'Stacking', icon: 'stacked_bar_chart', tab: 'Chart Design', group: 'Type', kind: 'menu', edits: true, isEnabled: hasChart,
    run: (app, v?: boolean | 'percent') => { if (v === undefined) return; withCharts(app, 'Stacking', (c) => { c.stacked = v || undefined; }); },
    menu: (app) => { const s = charts(app)[0]?.chart.stacked; return [[false, 'Clustered'], [true, 'Stacked'], ['percent', '100% Stacked']].map(([v, l]) => ({ id: 'chart.stacked', arg: v, label: l as string, checked: (s || false) === v })); },
  },
  {
    id: 'chart.addElement', label: 'Add Chart Element', icon: 'add_chart', tab: 'Chart Design', group: 'Chart Layouts', kind: 'menu', edits: true, isEnabled: hasChart,
    run: async (app, what?: string) => {
      if (!what) return;
      if (what === 'title') {
        const cur = charts(app)[0].chart.title || '';
        const r = await openDialog({ title: 'Chart Title', fields: [{ key: 't', label: 'Title (empty for none)', type: 'text', value: cur || 'Chart Title' }] });
        if (!r) return;
        withCharts(app, 'Chart Title', (c) => { c.title = r.t || undefined; });
      } else if (what === 'labels') withCharts(app, 'Data Labels', (c) => { c.labels = !c.labels || undefined; });
      else if (what.startsWith('legend:')) withCharts(app, 'Legend', (c) => { c.legend = what.slice(7) as any; });
    },
    menu: (app) => { const c = charts(app)[0]?.chart; return [{ id: 'chart.addElement', arg: 'title', label: 'Chart Title…' }, { id: 'chart.addElement', arg: 'labels', label: 'Data Labels', checked: !!c?.labels }, { heading: 'Legend' }, ...[['none', 'None'], ['r', 'Right'], ['t', 'Top'], ['l', 'Left'], ['b', 'Bottom']].map(([v, l]) => ({ id: 'chart.addElement', arg: `legend:${v}`, label: l, checked: (c?.legend ?? 'b') === v }))]; },
  },
  {
    id: 'chart.quickLayout', label: 'Quick Layout', icon: 'dashboard_customize', tab: 'Chart Design', group: 'Chart Layouts', kind: 'menu', edits: true, isEnabled: hasChart,
    run: (app, i?: number) => { const l = LAYOUTS[i ?? -1]; if (l) withCharts(app, 'Quick Layout', l.apply); },
    menu: () => LAYOUTS.map((l, i) => ({ id: 'chart.quickLayout', arg: i, label: l.label })),
  },
  {
    id: 'chart.colors', label: 'Change Colors', icon: 'palette', tab: 'Chart Design', group: 'Chart Styles', kind: 'menu', edits: true, isEnabled: hasChart,
    run: (app, i?: number) => { const p = PALETTES[i ?? -1]; if (p) withCharts(app, 'Chart Colors', (c) => { c.series.forEach((s, k) => { s.color = p.colors[k % p.colors.length]; }); }); },
    menu: (app) => { const ctx = { theme: app.deck.themeOf((app.owner || app.deck.data.masters[0]) as any) }; return PALETTES.map((p, i) => ({ id: 'chart.colors', arg: i, label: p.label, preview: `background:linear-gradient(90deg,${p.colors.map((c, j) => `${cssColor(c, ctx)} ${j * 16.6}% ${(j + 1) * 16.6}%`).join(',')});color:#fff;padding:0 6px` })); },
  },
  {
    id: 'chart.style', label: 'Chart Styles', icon: 'style', tab: 'Chart Design', group: 'Chart Styles', kind: 'gallery', edits: true, isEnabled: hasChart,
    run: (app, i?: number) => {
      if (i == null) return;
      const st = [{ l: 'b', lab: false, pal: 0 }, { l: 'none', lab: true, pal: 1 }, { l: 'r', lab: false, pal: 3 }, { l: 'b', lab: true, pal: 2 }, { l: 't', lab: false, pal: 4 }][+i];
      if (!st) return;
      withCharts(app, 'Chart Style', (c) => { c.legend = st.l as any; c.labels = st.lab || undefined; const p = PALETTES[st.pal] || PALETTES[0]; c.series.forEach((s, k) => { s.color = p.colors[k % p.colors.length]; }); });
    },
    menu: () => ['Style 1 (legend below)', 'Style 2 (labels, monochrome)', 'Style 3 (legend right, gray)', 'Style 4 (labels, accent 2)', 'Style 5 (legend top)'].map((l, i) => ({ id: 'chart.style', arg: i, label: l })),
  },
  {
    id: 'chart.switchRowCol', label: 'Switch Row/Column', icon: 'swap_horiz', tab: 'Chart Design', group: 'Data', edits: true, isEnabled: hasChart,
    run: (app) => withCharts(app, 'Switch Row/Column', (c) => {
      const cats = c.series.map((s) => s.name);
      const series = c.categories.map((name, i) => ({ name, values: c.series.map((s) => s.values[i] ?? null) }));
      c.categories = cats; c.series = series;
    }),
  },
]);
