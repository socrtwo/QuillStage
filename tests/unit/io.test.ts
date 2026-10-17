import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { Deck } from '../../src/model/deck';
import type { ShapeElement, Slide, TableElement, PictureElement, ChartElement, GroupElement } from '../../src/model/types';
import { importDeck, exportDeck, sniffFormat, FORMATS, formatFromName, PasswordNeeded } from '../../src/io';
import { exportMarkdown, importMarkdown, inlineRuns } from '../../src/io/markdown';
import { outlineToText, outlineToRtf, importTextOutline, textToDeck, importRtfOutline } from '../../src/io/outline';
import { exportPptx } from '../../src/io/pptx/export';
import { importPptx } from '../../src/io/pptx/import';

// 1×1 red PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const title = (s: Slide) => (s.elements.find((e) => e.ph && (e.ph.type === 'title' || e.ph.type === 'ctrTitle')) as ShapeElement | undefined)?.text?.paras.map((p) => p.runs.map((r) => r.text).join('')).join(' ') || '';
const allText = (s: Slide): string => {
  const out: string[] = [];
  const walk = (els: any[]) => { for (const e of els) { if (e.text) out.push(e.text.paras.map((p: any) => p.runs.map((r: any) => r.text).join('')).join('\n')); if (e.rows) for (const r of e.rows) for (const c of r.cells) out.push(c.text.paras.map((p: any) => p.runs.map((x: any) => x.text).join('')).join('\n')); if (e.children) walk(e.children); } };
  walk(s.elements);
  return out.join('\n');
};

/** A deck exercising every element kind. */
function richDeck(): Deck {
  const d = Deck.blank();
  d.data.props.title = 'Quarterly Review';
  d.data.props.author = 'Pat Example';
  const s0 = d.slides[0];
  (s0.elements[0] as ShapeElement).text = { paras: [{ level: 0, runs: [{ text: 'Quarterly Review' }] }] };
  (s0.elements[1] as ShapeElement).text = { paras: [{ level: 0, runs: [{ text: 'Fiscal ' }, { text: '2026', b: true }] }] };
  s0.notes = [{ level: 0, runs: [{ text: 'Welcome everyone.' }] }];
  s0.transition = { type: 'fade', dur: 700 };
  const lay = d.layoutByType('obj')!;
  const s1 = d.makeSlide(lay.id);
  (s1.elements[0] as ShapeElement).text = { paras: [{ level: 0, runs: [{ text: 'Highlights & <Risks>' }] }] };
  (s1.elements[1] as ShapeElement).text = { paras: [
    { level: 0, runs: [{ text: 'Revenue up ' }, { text: '12%', b: true, color: 'accent2' }] },
    { level: 1, runs: [{ text: 'Driven by renewals', i: true }] },
    { level: 0, runs: [{ text: 'See ' }, { text: 'the report', link: 'https://example.com/report' }] },
  ] };
  const box: ShapeElement = { id: 'star', kind: 'shape', geom: 'star5', x: 600, y: 300, w: 120, h: 120, fill: { type: 'solid', color: '#FFC000' }, line: { fill: { type: 'solid', color: '#7F6000' }, width: 2 }, text: { paras: [{ level: 0, runs: [{ text: 'Wow' }] }] } };
  s1.elements.push(box);
  s1.anims = [{ id: 'a1', target: s1.elements[1].id, cls: 'entr', effect: 'fade', trigger: 'click', dur: 500, byPara: true }, { id: 'a2', target: 'star', cls: 'entr', effect: 'fly', trigger: 'after', dir: 'l', dur: 600 }];
  s1.transition = { type: 'push', dir: 'l', dur: 1000, advAfter: 5000 };
  s1.notes = [{ level: 0, runs: [{ text: 'Mention renewals.' }] }];
  d.data.slides.push(s1);
  const s2 = d.makeSlide(d.layoutByType('titleOnly')!.id);
  (s2.elements[0] as ShapeElement).text = { paras: [{ level: 0, runs: [{ text: 'Numbers' }] }] };
  const tbl: TableElement = { id: 'tbl', kind: 'table', x: 66, y: 150, w: 600, h: 120, cols: [300, 300], style: { firstRow: true, bandRow: true }, rows: [
    { h: 40, cells: [{ text: { paras: [{ level: 0, runs: [{ text: 'Item' }] }] } }, { text: { paras: [{ level: 0, runs: [{ text: 'Cost' }] }] } }] },
    { h: 40, cells: [{ text: { paras: [{ level: 0, runs: [{ text: 'Pens' }] }] }, fill: { type: 'solid', color: '#DDEEFF' } }, { text: { paras: [{ level: 0, runs: [{ text: '2.5' }] }] } }] },
  ] };
  const media = d.addMedia({ mime: 'image/png', b64: PNG, name: 'red.png' });
  const pic: PictureElement = { id: 'pic', kind: 'picture', media, x: 700, y: 150, w: 100, h: 100, alt: 'A red square' };
  const chart: ChartElement = { id: 'ch', kind: 'chart', x: 66, y: 300, w: 400, h: 200, chart: { type: 'column', title: 'Sales', categories: ['Q1', 'Q2', 'Q3'], series: [{ name: 'East', values: [1, 2, 3] }, { name: 'West', values: [2, null, 4] }], legend: 'b' } };
  const grp: GroupElement = { id: 'grp', kind: 'group', x: 500, y: 300, w: 200, h: 100, children: [
    { id: 'g1', kind: 'shape', geom: 'rect', x: 500, y: 300, w: 90, h: 100, fill: { type: 'solid', color: 'accent1' } },
    { id: 'g2', kind: 'shape', geom: 'ellipse', x: 610, y: 300, w: 90, h: 100, fill: { type: 'solid', color: 'accent3' } },
  ] };
  s2.elements.push(tbl, pic, chart, grp);
  s2.hidden = true;
  d.data.slides.push(s2);
  d.data.sections = [{ id: 's1', name: 'Intro', slides: [s0.id] }, { id: 's2', name: 'Body', slides: [s1.id, s2.id] }];
  return d;
}

async function parts(u8: Uint8Array): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(u8);
  const out = new Map<string, string>();
  for (const f of Object.values(zip.files)) if (!f.dir && /\.(xml|rels)$/.test(f.name)) out.set(f.name, await f.async('string'));
  return out;
}

const wellFormed = (xml: string) => { const d = new DOMParser().parseFromString(xml, 'application/xml'); return !d.getElementsByTagName('parsererror').length; };

describe('format registry', () => {
  it('lists the planned formats', () => {
    for (const id of ['pptx', 'pptm', 'ppsx', 'potx', 'odp', 'otp', 'fodp', 'ppt', 'md', 'txt', 'docx', 'rtf', 'qsp', 'qspe', 'json']) expect(FORMATS.some((f) => f.id === id), id).toBe(true);
    expect(FORMATS.find((f) => f.id === 'ppt')!.canExport).toBe(false);
    expect(formatFromName('Deck.PPTX')?.id).toBe('pptx');
  });

  it('detects formats by content, not by name', async () => {
    const d = richDeck();
    const pptx = (await exportDeck(d, 'pptx')).data;
    const odp = (await exportDeck(d, 'odp')).data;
    const qsp = (await exportDeck(d, 'qsp')).data;
    expect(sniffFormat(pptx, 'misnamed.odp')).toBe('pptx');
    expect(sniffFormat(odp, 'noext')).toBe('odp');
    expect(sniffFormat(qsp, 'x.zip')).toBe('qsp');
    expect(sniffFormat(new TextEncoder().encode('# Title\n\n- a'), 'notes')).toBe('md');
    expect(sniffFormat(new TextEncoder().encode('{\\rtf1 hello}'), 'a.txt')).toBe('rtf');
    expect(sniffFormat(readFileSync('tests/fixtures/deck.pptx'), 'x')).toBe('pptx');
    const r = await importDeck(pptx, 'misnamed.odp');
    expect(r.format).toBe('pptx');
    expect(r.warnings.join(' ')).toMatch(/named \.odp/);
  });
});

describe('pptx', () => {
  it('writes well-formed parts covered by content types', async () => {
    const out = await exportPptx(richDeck());
    const p = await parts(out);
    for (const [k, v] of p) expect(wellFormed(v), k).toBe(true);
    const ct = p.get('[Content_Types].xml')!;
    const zip = await JSZip.loadAsync(out);
    for (const f of Object.values(zip.files)) {
      if (f.dir || f.name === '[Content_Types].xml') continue;
      const ext = f.name.split('.').pop()!;
      expect(ct.includes(`PartName="/${f.name}"`) || ct.includes(`Extension="${ext}"`), f.name).toBe(true);
    }
    // Every internal relationship target exists.
    for (const [k, v] of p) {
      if (!k.endsWith('.rels')) continue;
      for (const m of v.matchAll(/Target="([^"]+)"(?! TargetMode="External")/g)) {
        if (/^https?:/.test(m[1])) continue;
        const base = k === '_rels/.rels' ? [] : k.replace(/_rels\/([^/]+)\.rels$/, '$1').split('/'); base.pop();
        for (const seg of m[1].split('/')) { if (seg === '..') base.pop(); else base.push(seg); }
        expect(zip.file(base.join('/')), `${k} → ${m[1]}`).toBeTruthy();
      }
    }
  });

  it('round-trips slides, text, notes, shapes, tables, pictures, charts, groups, motion and sections', async () => {
    const src = richDeck();
    const { deck } = await importPptx(await exportPptx(src));
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    expect(deck.data.props.title).toBe('Quarterly Review');
    expect(deck.data.props.author).toBe('Pat Example');
    const [s0, s1, s2] = deck.slides;
    expect(s0.notes.map((p) => p.runs.map((r) => r.text).join('')).join('')).toBe('Welcome everyone.');
    expect(s0.elements.some((e) => e.ph?.type === 'ctrTitle')).toBe(true);
    expect(s0.transition?.type).toBe('fade');
    const body = s1.elements.find((e) => e.ph?.idx === 1) as ShapeElement;
    expect(body.text!.paras.map((p) => p.level)).toEqual([0, 1, 0]);
    expect(body.text!.paras[0].runs[1]).toMatchObject({ text: '12%', b: true, color: 'accent2' });
    expect(body.text!.paras[1].runs[0].i).toBe(true);
    expect(body.text!.paras[2].runs[1].link).toBe('https://example.com/report');
    const star = s1.elements.find((e) => e.kind === 'shape' && e.geom === 'star5') as ShapeElement;
    expect(star.fill).toEqual({ type: 'solid', color: '#FFC000' });
    expect(star.line?.width).toBe(2);
    expect(star.x).toBeCloseTo(600, 1);
    expect(s1.transition).toMatchObject({ type: 'push', dir: 'l', advAfter: 5000 });
    expect(s1.anims).toHaveLength(2);
    expect(s1.anims[0]).toMatchObject({ target: body.id, cls: 'entr', effect: 'fade', trigger: 'click', byPara: true });
    expect(s1.anims[1]).toMatchObject({ target: star.id, effect: 'fly', trigger: 'after', dir: 'l' });
    expect(s2.hidden).toBe(true);
    const t = s2.elements.find((e) => e.kind === 'table') as TableElement;
    expect(t.rows.map((r) => r.cells.map((c) => c.text.paras[0].runs[0]?.text))).toEqual([['Item', 'Cost'], ['Pens', '2.5']]);
    expect(t.style?.firstRow).toBe(true);
    expect(t.rows[1].cells[0].fill).toEqual({ type: 'solid', color: '#DDEEFF' });
    const pic = s2.elements.find((e) => e.kind === 'picture') as PictureElement;
    expect(pic.alt).toBe('A red square');
    expect(deck.media[pic.media].mime).toBe('image/png');
    const ch = s2.elements.find((e) => e.kind === 'chart') as ChartElement;
    expect(ch.chart).toMatchObject({ type: 'column', title: 'Sales', categories: ['Q1', 'Q2', 'Q3'] });
    expect(ch.chart.series[1].values).toEqual([2, null, 4]);
    const g = s2.elements.find((e) => e.kind === 'group') as GroupElement;
    expect(g.children).toHaveLength(2);
    expect(g.children[1].x).toBeCloseTo(610, 1);
    expect(deck.data.sections.map((s) => [s.name, s.slides.length])).toEqual([['Intro', 1], ['Body', 2]]);
    // Masters keep their text styles.
    expect(deck.data.masters[0].styles.body[1].run?.size).toBe(24);
    expect(deck.data.layouts.length).toBe(src.data.layouts.length);
  });

  it('keeps macros in .pptm and marks the content type', async () => {
    const d = richDeck();
    d.data.vba = btoa('fake vba project');
    const out = (await exportDeck(d, 'pptm')).data;
    const zip = await JSZip.loadAsync(out);
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('macroEnabled');
    const r = await importPptx(out);
    expect(atob(r.deck.data.vba!)).toBe('fake vba project');
  });

  it('opens a deck written by another program', async () => {
    const r = await importDeck(readFileSync('tests/fixtures/deck.pptx'), 'deck.pptx');
    expect(r.deck.slides.length).toBe(2);
    expect(r.deck.slides.map(title)).toEqual(['Plan', 'Numbers']);
    expect(allText(r.deck.slides[1])).toMatch(/Pens/);
    expect(r.recovery).toBeUndefined();
  });
});

describe('odp', () => {
  it('writes a valid package and round-trips content', async () => {
    const out = (await exportDeck(richDeck(), 'odp')).data;
    const zip = await JSZip.loadAsync(out);
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/vnd.oasis.opendocument.presentation');
    for (const [k, v] of await parts(out)) expect(wellFormed(v), k).toBe(true);
    const { deck } = await importDeck(out, 'x.odp');
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    const body = deck.slides[1].elements.find((e) => e.ph?.type === 'body') as ShapeElement;
    expect(body.text!.paras.map((p) => p.level)).toEqual([0, 1, 0]);
    expect(body.text!.paras[0].runs.find((r) => r.text === '12%')?.b).toBe(true);
    expect(deck.slides[1].notes[0].runs[0].text).toBe('Mention renewals.');
    expect(deck.slides[1].transition?.type).toBe('push');
    expect(deck.slides[1].transition?.advAfter).toBe(5000);
    expect(deck.slides[2].hidden).toBe(true);
    const star = deck.slides[1].elements.find((e) => e.kind === 'shape' && e.geom === 'star5') as ShapeElement;
    expect(star.fill).toEqual({ type: 'solid', color: '#FFC000' });
    const t = deck.slides[2].elements.find((e) => e.kind === 'table') as TableElement;
    expect(t.rows[1].cells[0].text.paras[0].runs[0].text).toBe('Pens');
    expect(deck.slides[2].elements.filter((e) => e.kind === 'picture').length).toBe(2); // picture + chart picture
    expect(deck.size.w).toBeCloseTo(960, 0);
  });

  it('round-trips flat ODP with embedded pictures', async () => {
    const out = (await exportDeck(richDeck(), 'fodp')).data;
    expect(wellFormed(new TextDecoder().decode(out))).toBe(true);
    expect(sniffFormat(out, 'x')).toBe('fodp');
    const { deck } = await importDeck(out, 'x.fodp');
    expect(deck.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    const pic = deck.slides[2].elements.find((e) => e.kind === 'picture' && (e as PictureElement).alt === 'A red square') as PictureElement;
    expect(deck.media[pic.media].mime).toBe('image/png');
  });

  it('opens a LibreOffice deck', async () => {
    const r = await importDeck(readFileSync('tests/fixtures/deck.odp'), 'deck.odp');
    expect(r.deck.slides.length).toBeGreaterThanOrEqual(2);
    expect(r.deck.slides.map(title).join('|')).toMatch(/Plan/);
    expect(r.deck.slides.map(allText).join('\n')).toMatch(/Pens/);
  });
});

describe('files LibreOffice wrote from a QuillStage deck', () => {
  it('reads its .pptx: slides, notes, shapes, tables, pictures, groups, hidden slides and transitions', async () => {
    const { deck, recovery } = await importDeck(readFileSync('tests/fixtures/lo-rich.pptx'), 'lo-rich.pptx');
    expect(recovery).toBeUndefined();
    expect(deck.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    expect(deck.slides[1].notes.map((p) => p.runs.map((r) => r.text).join('')).join('')).toBe('Mention renewals.');
    expect(deck.slides[1].elements.some((e) => e.kind === 'shape' && e.geom === 'star5')).toBe(true);
    expect(deck.slides[1].transition).toMatchObject({ type: 'push', advAfter: 5000 });
    expect(deck.slides[2].hidden).toBe(true);
    expect(deck.slides[2].elements.map((e) => e.kind).sort()).toEqual(['group', 'picture', 'picture', 'shape', 'table']);
  });

  it('reads its .odp', async () => {
    const { deck } = await importDeck(readFileSync('tests/fixtures/lo-rich.odp'), 'lo-rich.odp');
    expect(deck.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    expect(deck.slides[0].notes[0].runs.map((r) => r.text).join('')).toBe('Welcome everyone.');
    expect(deck.slides[1].elements.some((e) => e.kind === 'shape' && e.geom === 'star5')).toBe(true);
    expect(deck.slides[1].transition).toMatchObject({ type: 'push', advAfter: 5000 });
    expect(deck.slides[2].hidden).toBe(true);
    expect((deck.slides[2].elements.find((e) => e.kind === 'table') as TableElement).rows).toHaveLength(2);
  });
});

describe('ppt (97-2003)', () => {
  it('reads slides, levels, bullets, notes and pictures from a binary file', async () => {
    const r = await importDeck(readFileSync('tests/fixtures/lo-rich.ppt'), 'lo-rich.ppt');
    expect(r.format).toBe('ppt');
    const d = r.deck;
    expect(d.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    expect(d.layout(d.slides[0].layout).type).toBe('title');
    expect(d.slides[0].notes[0].runs[0].text).toBe('Welcome everyone.');
    expect(d.slides[1].notes[0].runs[0].text).toBe('Mention renewals.');
    const body = d.slides[1].elements.find((e) => allText({ elements: [e] } as any).includes('Revenue')) as ShapeElement;
    expect(body.text!.paras.map((p) => p.level)).toEqual([0, 1, 0]);
    expect(body.text!.paras[0].bullet?.kind).toBe('char');
    expect(allText(d.slides[2])).toMatch(/Pens/);
    const pics = d.slides[2].elements.filter((e) => e.kind === 'picture') as PictureElement[];
    expect(pics.map((p) => d.media[p.media].mime)).toContain('image/png');
    expect(d.size).toEqual({ w: 960, h: 540 });
  });
  it('cannot be saved (import only)', async () => {
    await expect(exportDeck(richDeck(), 'ppt')).rejects.toThrow(/cannot save/);
  });
});

describe('markdown and outlines', () => {
  it('parses inline formatting', () => {
    expect(inlineRuns('a **b** *c* ~~d~~ `e` [f](http://x)')).toEqual([
      { text: 'a ' }, { text: 'b', b: true }, { text: ' ' }, { text: 'c', i: true }, { text: ' ' }, { text: 'd', strike: true }, { text: ' ' }, { text: 'e', font: 'Cousine' }, { text: ' ' }, { text: 'f', link: 'http://x', u: true, color: 'hlink' },
    ]);
  });

  it('imports Markdown slides with notes, sections, code and images', () => {
    const md = `---\nmarp: true\nsize: 4:3\ntitle: Demo\n---\n\n# Demo Deck\n\nA subtitle\n\n---\n\n<!-- section: Part One -->\n## Agenda\n\n- One\n  - One point one\n- **Two**\n1. First\n\nNote: say hello\n\n---\n\n## Code\n\n\`\`\`js\nconst x = 1;\n---\n\`\`\`\n\n![dot](data:image/png;base64,${PNG})\n`;
    const d = importMarkdown(md);
    expect(d.size).toEqual({ w: 720, h: 540 });
    expect(d.slides).toHaveLength(3);
    expect(d.slides.map(title)).toEqual(['Demo Deck', 'Agenda', 'Code']);
    expect(d.layout(d.slides[0].layout).type).toBe('title');
    const body = d.slides[1].elements.find((e) => e.ph && e.ph.type !== 'title') as ShapeElement;
    expect(body.text!.paras.map((p) => [p.level, p.runs.map((r) => r.text).join('')])).toEqual([[0, 'One'], [1, 'One point one'], [0, 'Two'], [0, 'First']]);
    expect(body.text!.paras[3].bullet?.kind).toBe('num');
    expect(d.slides[1].notes[0].runs[0].text).toBe('say hello');
    expect(d.data.sections[0].name).toBe('Part One');
    const code = d.slides[2].elements.find((e) => e.name?.startsWith('Code')) as ShapeElement;
    expect(code.text!.paras.map((p) => p.runs[0]?.text || '')).toEqual(['const x = 1;', '---']);
    expect(d.slides[2].elements.some((e) => e.kind === 'picture')).toBe(true);
  });

  it('round-trips through Markdown', async () => {
    const src = richDeck();
    const md = exportMarkdown(src);
    expect(md).toMatch(/^---\nmarp: true/);
    expect(md).toContain('- Revenue up **12%**');
    expect(md).toContain('  - *Driven by renewals*');
    const d = importMarkdown(md);
    expect(d.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    expect(d.slides[1].notes[0].runs[0].text).toBe('Mention renewals.');
    expect(d.data.sections.map((s) => s.name)).toEqual(['Intro', 'Body']);
    expect(d.slides[2].elements.some((e) => e.kind === 'picture')).toBe(true);
  });

  it('round-trips text and RTF outlines', () => {
    const src = richDeck();
    const txt = outlineToText(src);
    expect(txt.split('\n').slice(0, 3)).toEqual(['Quarterly Review', '\tFiscal 2026', 'Highlights & <Risks>']);
    const d = importTextOutline(txt);
    expect(d.slides.map(title).slice(0, 2)).toEqual(['Quarterly Review', 'Highlights & <Risks>']);
    const rtf = importRtfOutline(outlineToRtf(src));
    expect(rtf.slides.map(title).slice(0, 3)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
    expect(allText(rtf.slides[1])).toContain('Driven by renewals');
  });

  it('turns paragraphs into slides', () => {
    const d = textToDeck('First idea\nwith detail\n\nSecond idea\n\nThird');
    expect(d.slides.map(title)).toEqual(['First idea', 'Second idea', 'Third']);
  });

  it('imports a Word outline', async () => {
    const zip = new JSZip();
    const p = (style: string, t: string) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('Heading1', 'Intro')}${p('Normal', 'Some text')}${p('Heading1', 'Plan')}${p('Heading2', 'Step one')}${p('Heading3', 'Detail')}</w:body></w:document>`);
    zip.file('word/styles.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:styleId="Heading3"><w:name w:val="heading 3"/></w:style></w:styles>');
    const r = await importDeck(await zip.generateAsync({ type: 'uint8array' }), 'outline.docx');
    expect(r.deck.slides.map(title)).toEqual(['Intro', 'Plan']);
    const body = r.deck.slides[1].elements.find((e) => e.ph && e.ph.type !== 'title') as ShapeElement;
    expect(body.text!.paras.map((q) => q.level)).toEqual([0, 1]);
  });
});

describe('native formats', () => {
  it('round-trips .qsp and .json with media', async () => {
    const src = richDeck();
    for (const f of ['qsp', 'json']) {
      const out = await exportDeck(src, f);
      const { deck } = await importDeck(out.data, `x.${f}`);
      expect(deck.toJSON().data).toEqual(src.toJSON().data);
      expect(deck.media).toEqual(src.media);
    }
  });

  it('encrypts .qspe and asks for the password', async () => {
    const src = richDeck();
    await expect(exportDeck(src, 'qspe')).rejects.toBeInstanceOf(PasswordNeeded);
    const out = await exportDeck(src, 'qspe', { password: 'pw' });
    expect(sniffFormat(out.data, 'x')).toBe('qspe');
    await expect(importDeck(out.data, 'x.qspe')).rejects.toBeInstanceOf(PasswordNeeded);
    await expect(importDeck(out.data, 'x.qspe', { password: 'wrong' })).rejects.toThrow(/password/i);
    const { deck } = await importDeck(out.data, 'x.qspe', { password: 'pw' });
    expect(deck.slides.map(title)).toEqual(['Quarterly Review', 'Highlights & <Risks>', 'Numbers']);
  }, 30000);
});
