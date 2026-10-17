/** Shared PresentationML constants and helpers for the .pptx importer and exporter. */

export const EMU = 12700;
export const toPt = (emu: number | null | undefined) => (emu == null ? undefined : emu / EMU);
export const toEmu = (pt: number | null | undefined) => Math.round((pt ?? 0) * EMU);

export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  pkgRel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};

export const REL = {
  officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  coreProps: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  extProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  video: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video',
  audio: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio',
  media: 'http://schemas.microsoft.com/office/2007/relationships/media',
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  presProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps',
  viewProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps',
  tableStyles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles',
  vba: 'http://schemas.microsoft.com/office/2006/relationships/vbaProject',
  diagramDrawing: 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
};

export const CT = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  presentationMacro: 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml',
  show: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  template: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  presProps: 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml',
  viewProps: 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml',
  tableStyles: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml',
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  vba: 'application/vnd.ms-office.vbaProject',
};

/** Resolves a relationship target against the part that owns the relationship. */
export function resolveTarget(source: string, target: string): string {
  if (/^[a-z]+:/i.test(target)) return target;
  if (target.startsWith('/')) return target.slice(1);
  const parts = source.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export function relsPartOf(part: string): string {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

/** Relative path from one part's folder to another part. */
export function relTarget(from: string, to: string): string {
  const a = from.split('/'); a.pop();
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/** Animation effect ↔ preset id (by class). */
export const ENTR_PRESETS: Record<number, string> = {
  1: 'appear', 2: 'fly', 3: 'wipe', 4: 'shape', 5: 'randomBars', 6: 'shape', 8: 'shape', 9: 'fade', 10: 'fade', 12: 'peek',
  14: 'randomBars', 16: 'split', 17: 'zoom', 18: 'wipe', 21: 'wheel', 22: 'wipe', 23: 'zoom', 26: 'bounce', 31: 'grow', 37: 'float',
  42: 'float', 45: 'swivel', 47: 'float', 53: 'zoom', 55: 'grow',
};
export const EMPH_PRESETS: Record<number, string> = { 1: 'colorPulse', 3: 'colorPulse', 6: 'growShrink', 8: 'spin', 9: 'transparency', 10: 'boldFlash', 14: 'teeter', 26: 'pulse', 27: 'colorPulse', 32: 'teeter', 35: 'pulse', 36: 'desaturate' };
export const EFFECT_TO_ENTR: Record<string, number> = { appear: 1, fly: 2, wipe: 22, shape: 6, randomBars: 14, fade: 10, peek: 12, split: 16, wheel: 21, zoom: 53, bounce: 26, grow: 55, float: 42, swivel: 45 };
export const EFFECT_TO_EMPH: Record<string, number> = { colorPulse: 27, growShrink: 6, spin: 8, transparency: 9, boldFlash: 10, teeter: 32, pulse: 26, desaturate: 36 };
/** presetSubtype ↔ the side an object flies in from. */
export const SUBTYPE_DIR: Record<number, 'u' | 'r' | 'd' | 'l'> = { 1: 'u', 2: 'r', 4: 'd', 8: 'l' };
export const DIR_SUBTYPE: Record<string, number> = { u: 1, r: 2, d: 4, l: 8 };
