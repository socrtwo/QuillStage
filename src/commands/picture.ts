/** Picture Format: change, crop, corrections, color, transparency, remove color, compress, styles. */
import { def } from './registry';
import type { App } from '../app';
import type { PictureElement } from '../model/types';
import { GEOMETRY } from '../model/geometry';
import { boxOf, edit } from '../edit/ops';
import { openDialog, toast } from '../ui/dialog';
import { download, pickFile } from '../ui/dom';
import { fitBox, pictureFromFile } from './insert';
import { slideSvg } from '../render/slide';

const pics = (app: App) => app.selected.filter((e): e is PictureElement => e.kind === 'picture');
const hasPic = (app: App) => pics(app).length > 0;
const canvasOk = () => typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent);

function setPics(app: App, label: string, fn: (p: PictureElement) => void): void {
  const ids = new Set(pics(app).map((p) => p.id));
  edit(app, label, (o) => { for (const e of o.elements) if (ids.has(e.id)) fn(e as PictureElement); });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The picture could not be read.')); i.src = url; });
}

/** Runs a pixel operation on a picture's media and stores the result as new PNG media. */
async function processPixels(app: App, p: PictureElement, op: (d: ImageData) => void, maxSide = 4096): Promise<string> {
  const img = await loadImage(app.deck.mediaUrl(p.media));
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height);
  op(data);
  g.putImageData(data, 0, 0);
  const url = c.toDataURL('image/png');
  return app.deck.addMedia({ mime: 'image/png', b64: url.split(',')[1], name: app.deck.media[p.media]?.name });
}

/** Makes pixels close to a color transparent (Set Transparent Color / Remove Color). */
export function knockOut(d: { data: Uint8ClampedArray }, rgb: [number, number, number], tol: number, soft = true): number {
  let n = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    const dist = Math.hypot(d.data[i] - rgb[0], d.data[i + 1] - rgb[1], d.data[i + 2] - rgb[2]);
    if (dist <= tol) { d.data[i + 3] = 0; n++; }
    else if (soft && dist <= tol * 1.6) d.data[i + 3] = Math.min(d.data[i + 3], Math.round(255 * (dist - tol) / (tol * 0.6)));
  }
  return n;
}

async function crop(app: App): Promise<void> {
  const p = pics(app)[0];
  if (!p) return;
  const c = p.crop || [0, 0, 0, 0];
  const preview = (v: Record<string, any>) => {
    const t = { ...p, crop: [+v.l / 100, +v.t / 100, +v.r / 100, +v.b / 100] as [number, number, number, number] };
    const slide = { ...(app.owner as any), elements: [t], bg: { type: 'solid', color: '#EEEEEE' }, hideMasterShapes: true, ink: undefined };
    return slideSvg(app.deck, slide, { mode: 'show' }).replace('<svg ', '<svg style="width:100%;height:auto;max-height:40vh" ');
  };
  const r = await openDialog({ title: 'Crop', preview: true, fields: (['l', 't', 'r', 'b'] as const).map((k, i) => ({ key: k, label: ['Left', 'Top', 'Right', 'Bottom'][i] + ' (%)', type: 'range' as const, min: 0, max: 90, step: 1, value: Math.round(c[i] * 100), half: true })),
    onOpen: (ctl) => ctl.setPreview(preview(ctl.values())), onChange: (v, ctl) => ctl.setPreview(preview(v)) });
  if (!r) return;
  const nc: [number, number, number, number] = [+r.l / 100, +r.t / 100, +r.r / 100, +r.b / 100];
  if (nc[0] + nc[2] >= 0.98 || nc[1] + nc[3] >= 0.98) { toast('That crop leaves nothing of the picture.'); return; }
  setPics(app, 'Crop', (x) => {
    const b = boxOf(app, x);
    const [ol, ot, or, ob] = x.crop || [0, 0, 0, 0];
    const fullW = b.w / (1 - ol - or), fullH = b.h / (1 - ot - ob);
    x.x = b.x + (nc[0] - ol) * fullW; x.y = b.y + (nc[1] - ot) * fullH;
    x.w = fullW * (1 - nc[0] - nc[2]); x.h = fullH * (1 - nc[1] - nc[3]);
    x.crop = nc.some((v) => v > 0) ? nc : undefined;
  });
}

async function naturalSize(app: App, p: PictureElement): Promise<{ w: number; h: number }> {
  if (!canvasOk()) return { w: 4, h: 3 };
  try { const i = await loadImage(app.deck.mediaUrl(p.media)); return { w: i.naturalWidth, h: i.naturalHeight }; } catch { return { w: 4, h: 3 }; }
}

const ASPECTS: [string, number][] = [['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16], ['3:2', 3 / 2], ['2:3', 2 / 3], ['5:4', 5 / 4]];

def([
  {
    id: 'picture.change', label: 'Change Picture', icon: 'image', tab: 'Picture Format', group: 'Adjust', edits: true, isEnabled: hasPic,
    tip: 'Replace the picture, keeping its size, position and formatting',
    run: async (app) => {
      const f = (await pickFile('image/*'))[0];
      if (!f) return;
      const { media, size } = await pictureFromFile(app, f);
      setPics(app, 'Change Picture', (p) => { const b = boxOf(app, p); const r = size.w / size.h; const nh = b.w / r; p.media = p.media === media ? p.media : media; p.crop = undefined; p.h = nh; p.y = b.y + (b.h - nh) / 2; });
    },
  },
  { id: 'picture.crop', label: 'Crop', icon: 'crop', tab: 'Picture Format', group: 'Size', edits: true, isEnabled: (app) => pics(app).length === 1, run: (app) => crop(app) },
  {
    id: 'picture.cropToShape', label: 'Crop to Shape', icon: 'crop_free', tab: 'Picture Format', group: 'Size', kind: 'menu', edits: true, isEnabled: hasPic,
    run: (app, geom?: string) => { if (geom && GEOMETRY[geom]) setPics(app, 'Crop to Shape', (p) => { p.geom = geom === 'rect' ? undefined : geom; }); },
    menu: () => ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'octagon', 'star5', 'heart', 'cloud', 'snip1Rect', 'teardrop', 'parallelogram', 'chevron', 'wave'].map((g) => ({ id: 'picture.cropToShape', arg: g, label: GEOMETRY[g].label })),
  },
  {
    id: 'picture.cropAspect', label: 'Aspect Ratio', icon: 'aspect_ratio', tab: 'Picture Format', group: 'Size', kind: 'menu', edits: true, isEnabled: hasPic,
    tip: 'Crop the picture to a common aspect ratio, centered',
    run: async (app, ratio?: number) => {
      if (!ratio) return;
      const sizes = await Promise.all(pics(app).map((p) => naturalSize(app, p)));
      let k = 0;
      setPics(app, 'Crop to Aspect Ratio', (p) => {
        const n = sizes[k++];
        const src = n.w / n.h;
        const b = boxOf(app, p);
        let crop: [number, number, number, number] = [0, 0, 0, 0];
        if (src > ratio) { const keep = ratio / src; crop = [(1 - keep) / 2, 0, (1 - keep) / 2, 0]; }
        else { const keep = src / ratio; crop = [0, (1 - keep) / 2, 0, (1 - keep) / 2]; }
        p.crop = crop.some((v) => v > 0.001) ? crop : undefined;
        const nh = b.w / ratio; p.y = b.y + (b.h - nh) / 2; p.h = nh;
      });
    },
    menu: () => ASPECTS.map(([l, r]) => ({ id: 'picture.cropAspect', arg: r, label: l })),
  },
  {
    id: 'picture.corrections', label: 'Corrections', icon: 'tonality', tab: 'Picture Format', group: 'Adjust', kind: 'menu', edits: true, isEnabled: hasPic,
    run: (app, arg?: { b: number; c: number }) => { if (arg) setPics(app, 'Corrections', (p) => { p.adjust = { ...(p.adjust || {}), brightness: arg.b || undefined, contrast: arg.c || undefined }; }); },
    menu: () => [-0.4, -0.2, 0, 0.2, 0.4].flatMap((b) => [-0.4, 0, 0.4].map((c) => ({ id: 'picture.corrections', arg: { b, c }, label: `Brightness ${b > 0 ? '+' : ''}${Math.round(b * 100)}%, Contrast ${c > 0 ? '+' : ''}${Math.round(c * 100)}%` }))),
  },
  {
    id: 'picture.color', label: 'Color', icon: 'palette', tab: 'Picture Format', group: 'Adjust', kind: 'menu', edits: true, isEnabled: hasPic,
    run: (app, arg?: string | number) => {
      if (arg == null) return;
      setPics(app, 'Picture Color', (p) => { const a = { ...(p.adjust || {}) }; if (arg === 'gray') { a.grayscale = true; delete a.saturation; } else { delete a.grayscale; a.saturation = +arg === 1 ? undefined : +arg; } p.adjust = a; });
    },
    menu: () => [{ heading: 'Color Saturation' }, ...[0, 0.33, 0.66, 1, 1.33, 1.66, 2, 3].map((s) => ({ id: 'picture.color', arg: s, label: `Saturation ${Math.round(s * 100)}%` })), { heading: 'Recolor' }, { id: 'picture.color', arg: 'gray', label: 'Grayscale' }, { separator: true }, { id: 'picture.setTransparentColor', label: 'Set Transparent Color…' }],
  },
  {
    id: 'picture.transparency', label: 'Transparency', icon: 'opacity', tab: 'Picture Format', group: 'Adjust', kind: 'menu', edits: true, isEnabled: hasPic,
    run: (app, t?: number) => { if (t != null) setPics(app, 'Transparency', (p) => { p.adjust = { ...(p.adjust || {}), transparency: +t || undefined }; }); },
    menu: () => [0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map((t) => ({ id: 'picture.transparency', arg: t, label: `${Math.round(t * 100)}%` })),
  },
  {
    id: 'picture.setTransparentColor', label: 'Set Transparent Color', icon: 'format_color_reset', tab: 'Picture Format', group: 'Adjust', edits: true, isEnabled: (app) => pics(app).length === 1 && canvasOk(),
    tip: 'Make one color of the picture transparent',
    run: async (app) => {
      const p = pics(app)[0];
      const r = await openDialog({ title: 'Set Transparent Color', fields: [{ key: 'c', label: 'Color to remove', type: 'color', value: '#FFFFFF' }, { key: 'tol', label: 'Tolerance', type: 'range', min: 0, max: 120, value: 30 }] });
      if (!r) return;
      const hex = String(r.c).replace('#', '');
      const rgb: [number, number, number] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      let n = 0;
      const media = await processPixels(app, p, (d) => { n = knockOut(d, rgb, +r.tol); });
      setPics(app, 'Set Transparent Color', (x) => { x.media = media; });
      toast(`${n.toLocaleString()} pixels made transparent.`);
    },
  },
  {
    id: 'picture.removeColor', label: 'Remove Color', icon: 'colorize', tab: 'Picture Format', group: 'Adjust', edits: true, isEnabled: (app) => pics(app).length === 1 && canvasOk(), origin: 'Keynote Instant Alpha',
    tip: 'Remove the background color: the color of the picture\'s corners is made transparent',
    run: async (app) => {
      const p = pics(app)[0];
      const r = await openDialog({ title: 'Remove Color', fields: [{ key: 'tol', label: 'How much to remove', type: 'range', min: 5, max: 120, value: 40 }] });
      if (!r) return;
      let n = 0;
      const media = await processPixels(app, p, (d) => {
        const w = d.width, hh = d.height, px = (x: number, y: number) => { const i = (y * w + x) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2]]; };
        const corners = [px(0, 0), px(w - 1, 0), px(0, hh - 1), px(w - 1, hh - 1)];
        const avg = [0, 1, 2].map((k) => Math.round(corners.reduce((a, c) => a + c[k], 0) / 4)) as [number, number, number];
        n = knockOut(d, avg, +r.tol);
      });
      setPics(app, 'Remove Color', (x) => { x.media = media; });
      toast(`${n.toLocaleString()} background pixels removed.`);
    },
  },
  {
    id: 'picture.compress', label: 'Compress Pictures', icon: 'compress', tab: 'Picture Format', group: 'Adjust', edits: true, isEnabled: () => canvasOk(),
    tip: 'Make pictures smaller: reduce resolution to what the slides need and save photos as JPEG',
    run: async (app) => {
      const r = await openDialog({ title: 'Compress Pictures', fields: [
        { key: 'scope', label: 'Apply to', type: 'radio', options: [{ value: 'sel', label: 'Selected pictures only' }, { value: 'all', label: 'All pictures in the presentation' }], value: hasPic(app) ? 'sel' : 'all' },
        { key: 'ppi', label: 'Resolution', type: 'select', options: [{ value: 330, label: '330 ppi – high quality' }, { value: 220, label: '220 ppi – print' }, { value: 150, label: '150 ppi – web and screens' }, { value: 96, label: '96 ppi – email' }], value: 150 },
        { key: 'crop', label: 'Delete cropped areas of pictures', type: 'checkbox', value: true },
      ] });
      if (!r) return;
      const d = app.deck;
      const targets: PictureElement[] = [];
      const walk = (els: any[]) => { for (const e of els) { if (e.kind === 'picture') targets.push(e); if (e.kind === 'group') walk(e.children); } };
      if (r.scope === 'sel') targets.push(...pics(app)); else for (const s of d.slides) walk(s.elements);
      let before = 0, after = 0;
      const done = new Map<string, { media: string; crop: boolean }>();
      for (const p of targets) {
        const key = `${p.media}|${(r.crop && p.crop) ? p.crop.join() : ''}|${p.w}x${p.h}`;
        if (done.has(key)) continue;
        const m = d.media[p.media];
        if (!m || /svg/.test(m.mime)) continue;
        const img = await loadImage(d.mediaUrl(p.media)).catch(() => null);
        if (!img) continue;
        const [cl, ct, cr, cb] = r.crop && p.crop ? p.crop : [0, 0, 0, 0];
        const sw = img.naturalWidth * (1 - cl - cr), sh = img.naturalHeight * (1 - ct - cb);
        const b = boxOf(app, p);
        const s = Math.min(1, ((b.w / 72) * +r.ppi) / sw);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
        c.getContext('2d')!.drawImage(img, img.naturalWidth * cl, img.naturalHeight * ct, sw, sh, 0, 0, c.width, c.height);
        const photo = /jpe?g/.test(m.mime);
        const url = c.toDataURL(photo ? 'image/jpeg' : 'image/png', 0.85);
        const b64 = url.split(',')[1];
        before += m.b64.length * 0.75;
        if (b64.length >= m.b64.length && !(r.crop && p.crop)) { after += m.b64.length * 0.75; continue; }
        after += b64.length * 0.75;
        done.set(key, { media: d.addMedia({ mime: photo ? 'image/jpeg' : 'image/png', b64, name: m.name }), crop: !!(r.crop && p.crop) });
      }
      if (!done.size) { toast('The pictures are already as small as they can be at that resolution.'); return; }
      const ids = new Set(targets.map((t) => t.id));
      d.transact('Compress Pictures', () => {
        const walk2 = (els: any[]) => { for (const e of els) { if (e.kind === 'group') walk2(e.children); if (e.kind === 'picture' && ids.has(e.id)) { const k = `${e.media}|${(r.crop && e.crop) ? e.crop.join() : ''}|${e.w}x${e.h}`; const n = done.get(k); if (n) { e.media = n.media; if (n.crop) e.crop = undefined; } } } };
        for (const s of d.slides) walk2(s.elements);
      });
      toast(`Pictures compressed: ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB.`);
    },
  },
  {
    id: 'picture.reset', label: 'Reset Picture', icon: 'restart_alt', tab: 'Picture Format', group: 'Adjust', kind: 'split', edits: true, isEnabled: hasPic,
    tip: 'Remove corrections, color changes, transparency, crop shape and effects',
    run: async (app, arg?: string) => {
      if (arg === 'size') {
        const sizes = await Promise.all(pics(app).map((p) => naturalSize(app, p)));
        let k = 0;
        setPics(app, 'Reset Picture & Size', (p) => { const n = sizes[k++]; Object.assign(p, fitBox(app, n.w, n.h, 1)); p.crop = undefined; p.adjust = undefined; p.effects = undefined; p.geom = undefined; p.rot = undefined; });
        return;
      }
      setPics(app, 'Reset Picture', (p) => { p.adjust = undefined; p.effects = undefined; p.geom = undefined; p.line = undefined; });
    },
    menu: () => [{ id: 'picture.reset', label: 'Reset Picture' }, { id: 'picture.reset', arg: 'size', label: 'Reset Picture & Size' }],
  },
  {
    id: 'picture.style', label: 'Picture Styles', icon: 'filter_frames', tab: 'Picture Format', group: 'Picture Styles', kind: 'gallery', edits: true, isEnabled: hasPic,
    run: (app, i?: number) => {
      const st = PIC_STYLES[i ?? -1];
      if (!st) return;
      setPics(app, 'Picture Style', (p) => { p.geom = st.geom; p.line = st.line; p.effects = st.fx; });
    },
    menu: () => PIC_STYLES.map((s, i) => ({ id: 'picture.style', arg: i, label: s.label })),
  },
  {
    id: 'picture.border', label: 'Picture Border', icon: 'border_style', tab: 'Picture Format', group: 'Picture Styles', kind: 'menu', edits: true, isEnabled: hasPic,
    run: (app, w?: number | 'none') => { if (w == null) return; setPics(app, 'Picture Border', (p) => { p.line = w === 'none' ? undefined : { fill: { type: 'solid', color: p.line?.fill?.type === 'solid' ? p.line.fill.color : 'tx1' }, width: +w }; }); },
    menu: () => [{ id: 'picture.border', arg: 'none', label: 'No Border' }, ...[0.75, 1.5, 3, 4.5, 6, 9].map((w) => ({ id: 'picture.border', arg: w, label: `${w} pt` })), { separator: true }, { id: 'shape.outline', label: 'Border Color…' }],
  },
  {
    id: 'picture.effects', label: 'Picture Effects', icon: 'auto_fix_high', tab: 'Picture Format', group: 'Picture Styles', kind: 'menu', edits: true, isEnabled: hasPic,
    run: (app, id?: string) => { if (id) app.exec('shape.effects', id); },
    menu: () => [['none', 'No Effects'], ['shadowOuter', 'Shadow'], ['shadowSoft', 'Soft Shadow'], ['glow', 'Glow'], ['soft', 'Soft Edges']].map(([v, l]) => ({ id: 'picture.effects', arg: v, label: l })),
  },
  {
    id: 'picture.saveAs', label: 'Save as Picture', icon: 'download', tab: 'Picture Format', group: 'Size', edits: false, noRecord: true, isEnabled: (app) => pics(app).length === 1,
    tip: 'Save the original picture file', run: (app) => { const p = pics(app)[0]; const m = app.deck.media[p.media]; if (!m) return; const ext = (m.mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg'); const bin = atob(m.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); download(new Blob([u8], { type: m.mime }), `${(p.name || 'picture').replace(/[^\w -]/g, '')}.${ext}`); },
  },
]);

const PIC_STYLES: { label: string; geom?: string; line?: PictureElement['line']; fx?: PictureElement['effects'] }[] = [
  { label: 'Simple Frame, White', line: { fill: { type: 'solid', color: '#FFFFFF' }, width: 6 }, fx: { shadow: { color: '#000000', blur: 8, dist: 3, dir: 45, alpha: 0.35 } } },
  { label: 'Thin Dark Border', line: { fill: { type: 'solid', color: 'tx1' }, width: 1 } },
  { label: 'Rounded Rectangle', geom: 'roundRect', fx: { shadow: { color: '#000000', blur: 10, dist: 4, dir: 90, alpha: 0.3 } } },
  { label: 'Oval', geom: 'ellipse', line: { fill: { type: 'solid', color: 'accent1' }, width: 3 } },
  { label: 'Soft Edge', fx: { softEdge: 8 } },
  { label: 'Drop Shadow', fx: { shadow: { color: '#000000', blur: 12, dist: 8, dir: 45, alpha: 0.45 } } },
  { label: 'Accent Frame', line: { fill: { type: 'solid', color: 'accent1' }, width: 8 } },
  { label: 'Snipped Corner', geom: 'snip1Rect', line: { fill: { type: 'solid', color: 'accent2' }, width: 2 } },
];

