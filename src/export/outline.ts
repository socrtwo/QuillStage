/** Text of a slide as an outline: title, then body paragraphs with their levels (for PDF, story, print). */
import type { Element, ShapeElement, Slide } from '../model/types';
import { slideTitle } from '../render/slide';

export interface SlideOutline { title: string; body: { level: number; text: string }[]; notes: string[] }

function texts(els: Element[], out: { level: number; text: string }[], skipTitle: boolean): void {
  for (const e of els) {
    if (e.kind === 'group') { texts(e.children, out, skipTitle); continue; }
    if (skipTitle && e.ph && (e.ph.type === 'title' || e.ph.type === 'ctrTitle')) continue;
    if (e.ph && (e.ph.type === 'dt' || e.ph.type === 'ftr' || e.ph.type === 'sldNum')) continue;
    if (e.kind === 'shape' && (e as ShapeElement).text) {
      for (const p of (e as ShapeElement).text!.paras) {
        const t = p.runs.map((r) => (r.br ? ' ' : r.text)).join('').trim();
        if (t) out.push({ level: p.level, text: t });
      }
    } else if (e.kind === 'table') {
      for (const row of e.rows) {
        const t = row.cells.filter((c) => !c.merged).map((c) => c.text.paras.map((p) => p.runs.map((r) => r.text).join('')).join(' ')).join(' | ').trim();
        if (t.replace(/\|/g, '').trim()) out.push({ level: 0, text: t });
      }
    } else if (e.kind === 'picture' && e.alt) out.push({ level: 0, text: `[Picture: ${e.alt}]` });
    else if (e.kind === 'chart' && e.chart.title) out.push({ level: 0, text: `[Chart: ${e.chart.title}]` });
  }
}

export function slideOutline(slide: Slide): SlideOutline {
  const body: { level: number; text: string }[] = [];
  texts(slide.elements, body, true);
  return { title: slideTitle(slide), body, notes: slide.notes.map((p) => p.runs.map((r) => r.text).join('')) };
}
