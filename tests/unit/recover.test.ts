import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { Deck } from '../../src/model/deck';
import type { ShapeElement, Slide } from '../../src/model/types';
import { exportDeck, importDeck } from '../../src/io';
import { recoverPresentation, recoverDeck, reportText, repairSlideXml, scanSlideText, harvestMediaBytes } from '../../src/io/recover';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const title = (s: Slide) => (s.elements.find((e) => e.ph && (e.ph.type === 'title' || e.ph.type === 'ctrTitle')) as ShapeElement | undefined)?.text?.paras.map((p) => p.runs.map((r) => r.text).join('')).join(' ') || '';
const words = (d: Deck) => JSON.stringify(d.slides.map((s) => s.elements.map((e: any) => e.text?.paras.map((p: any) => p.runs.map((r: any) => r.text).join('')))));

function deck(n = 5): Deck {
  const d = Deck.blank();
  (d.slides[0].elements[0] as ShapeElement).text = { paras: [{ level: 0, runs: [{ text: 'Recovery Test' }] }] };
  const lay = d.layoutByType('obj')!;
  for (let i = 1; i < n; i++) {
    const s = d.makeSlide(lay.id);
    (s.elements[0] as ShapeElement).text = { paras: [{ level: 0, runs: [{ text: `Slide ${i + 1} title` }] }] };
    (s.elements[1] as ShapeElement).text = { paras: [{ level: 0, runs: [{ text: `Point A on slide ${i + 1}` }] }, { level: 1, runs: [{ text: `Detail on slide ${i + 1}` }] }] };
    d.data.slides.push(s);
  }
  const media = d.addMedia({ mime: 'image/png', b64: PNG });
  d.slides[1].elements.push({ id: 'p', kind: 'picture', media, x: 600, y: 300, w: 100, h: 100 });
  return d;
}

async function pptxParts(d: Deck): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync((await exportDeck(d, 'pptx')).data);
  const m = new Map<string, Uint8Array>();
  for (const f of Object.values(zip.files)) if (!f.dir) m.set(f.name, await f.async('uint8array'));
  return m;
}

async function rezip(parts: Map<string, Uint8Array>, store = false): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [k, v] of parts) zip.file(k, v);
  return zip.generateAsync({ type: 'uint8array', compression: store ? 'STORE' : 'DEFLATE' });
}

const edit = (parts: Map<string, Uint8Array>, name: string, fn: (s: string) => string) => parts.set(name, new TextEncoder().encode(fn(new TextDecoder().decode(parts.get(name)!))));

describe('recovery pipeline', () => {
  it('reports a healthy file as opening normally', async () => {
    const r = await recoverPresentation((await exportDeck(deck(), 'pptx')).data, 'ok.pptx');
    expect(r.kind).toBe('pptx');
    expect(r.bestMethod).toBe('open');
    expect(r.summary).toMatch(/opened normally: 5 slides/);
    expect(r.methods.find((m) => m.id === 'zip')!.status).toBe('skipped');
  });

  it('cuts a slide with malformed XML at the last complete shape and keeps the others', async () => {
    const parts = await pptxParts(deck());
    edit(parts, 'ppt/slides/slide3.xml', (s) => s.replace(/<\/p:sp>(?![\s\S]*<\/p:sp>)/, '</p:spX>').replace('Detail on slide 3', 'Detail <broken'));
    const data = await rezip(parts);
    const opened = await importDeck(data, 'bad.pptx');
    expect(opened.recovery).toBeDefined();
    expect(opened.deck.slides).toHaveLength(5);
    expect(opened.deck.slides.map(title)).toContain('Slide 3 title');
    expect(words(opened.deck)).toContain('Point A on slide 4');
    expect(opened.recovery!.methods.find((m) => m.id === 'xml')!.status).toBe('success');
    expect(opened.recovery!.unverified).toBe(true);
  });

  it('salvages a truncated package from local headers', async () => {
    const data = (await exportDeck(deck(8), 'pptx')).data;
    const cut = data.slice(0, Math.floor(data.length * 0.85));
    const r = await recoverPresentation(cut, 'truncated.pptx');
    expect(r.deck).not.toBeNull();
    expect(r.methods.find((m) => m.id === 'zip')!.status).not.toBe('failed');
    expect(r.deck!.slides.length).toBeGreaterThanOrEqual(3);
    expect(r.repaired?.kind).toBe('pptx');
    // The repaired package opens normally.
    const again = await importDeck(new Uint8Array(await r.repaired!.blob.arrayBuffer()), 'repaired.pptx');
    expect(again.recovery).toBeUndefined();
    expect(again.deck.slides.length).toBeGreaterThanOrEqual(r.deck!.slides.length - 1);
  });

  it('works without the central directory', async () => {
    const data = (await exportDeck(deck(), 'pptx')).data;
    let cd = -1;
    for (let i = data.length - 22; i >= 0; i--) if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 1 && data[i + 3] === 2) cd = i;
    const r = await recoverPresentation(data.slice(0, cd), 'nocd.pptx');
    expect(r.deck!.slides).toHaveLength(5);
    expect(r.deck!.slides.map(title)).toEqual(['Recovery Test', 'Slide 2 title', 'Slide 3 title', 'Slide 4 title', 'Slide 5 title']);
  });

  it('rebuilds a missing presentation part from the slides found', async () => {
    const parts = await pptxParts(deck());
    parts.delete('ppt/presentation.xml');
    const r = await recoverPresentation(await rezip(parts), 'nopres.pptx');
    expect(r.methods.find((m) => m.id === 'open')!.status).toBe('failed');
    expect(r.deck!.slides.map(title)).toEqual(['Recovery Test', 'Slide 2 title', 'Slide 3 title', 'Slide 4 title', 'Slide 5 title']);
    expect(r.repaired!.repairedParts.join(' ')).toMatch(/slide list rebuilt/);
  });

  it('drops dangling relationships and harvests unused media', async () => {
    const parts = await pptxParts(deck());
    edit(parts, 'ppt/slides/_rels/slide2.xml.rels', (s) => s.replace('</Relationships>', '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/missing.png"/></Relationships>'));
    parts.set('ppt/media/orphan.png', Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)).map((b, i) => (i === 40 ? b ^ 1 : b)));
    const r = await recoverPresentation(await rezip(parts), 'dangling.pptx', { forceRepair: true });
    expect(r.repaired!.repairedParts.join(' ')).toMatch(/dangling relationship/);
    expect(r.deck!.slides.map(title)).toContain('Recovered media');
    expect(r.methods.find((m) => m.id === 'media')!.status).toBe('success');
  });

  it('rebuilds text of a slide that cannot be repaired', async () => {
    const parts = await pptxParts(deck());
    // Damage beyond structural repair: no shape survives, only text runs.
    edit(parts, 'ppt/slides/slide2.xml', (s) => '<p:sld xmlns:p="x"><<<' + [...s.matchAll(/<a:t>[^<]*<\/a:t>/g)].map((m) => m[0]).join('<<'));
    const r = await recoverPresentation(await rezip(parts), 'text.pptx');
    expect(r.deck).not.toBeNull();
    expect(words(r.deck!)).toContain('Point A on slide 2');
    expect(r.deck!.slides.length).toBeGreaterThanOrEqual(5);
  });

  it('recovers a damaged OpenDocument presentation', async () => {
    const zip = await JSZip.loadAsync((await exportDeck(deck(), 'odp')).data);
    const content = await zip.file('content.xml')!.async('string');
    const at = content.indexOf('</draw:page>', content.indexOf('Slide 4 title'));
    zip.file('content.xml', content.slice(0, at + 40));
    const r = await recoverPresentation(await zip.generateAsync({ type: 'uint8array' }), 'cut.odp');
    expect(r.kind).toBe('odp');
    expect(r.methods.find((m) => m.id === 'odp')!.status).toBe('partial');
    expect(r.deck!.slides.map(title).slice(0, 4)).toEqual(['Recovery Test', 'Slide 2 title', 'Slide 3 title', 'Slide 4 title']);
  });

  it('salvages text from a damaged PowerPoint 97-2003 file', async () => {
    const ppt = new Uint8Array(readFileSync('tests/fixtures/lo-rich.ppt'));
    const broken = ppt.slice();
    broken.fill(0, 0, 512); // header and directory start gone: not a compound file any more
    const r = await recoverPresentation(broken, 'broken.ppt');
    expect(r.kind).toBe('ppt');
    expect(r.deck).not.toBeNull();
    expect(words(r.deck!)).toMatch(/Highlights/);
    expect(r.methods.find((m) => m.id === 'ppt')!.status).toBe('partial');
  });

  it('falls back to a strings scan and handles empty and encrypted files', async () => {
    const junk = new TextEncoder().encode('\x00\x01\x02 The quarterly results were strong \x00\x00\x07 Next steps: hire two engineers \x00');
    const r = await recoverPresentation(junk, 'mystery.pptx');
    expect(r.bestMethod).toBe('strings');
    expect(r.textOnly).toBe(true);
    expect(words(r.deck!)).toContain('quarterly results');
    const e = await recoverPresentation(new Uint8Array(0), 'empty.pptx');
    expect(e.deck).toBeNull();
    expect(e.summary).toMatch(/empty/);
    expect(await recoverDeck(new Uint8Array(0), 'empty.pptx')).toBeNull();
    expect(reportText(r)).toMatch(/Strings scan/);
  });

  it('finds the presentation inside concatenated data', async () => {
    const data = (await exportDeck(deck(), 'pptx')).data;
    const junk = new Uint8Array(3000).fill(0x41);
    const both = new Uint8Array(junk.length + data.length);
    both.set(junk); both.set(data, junk.length);
    const r = await recoverPresentation(both, 'prefixed.pptx');
    expect(r.deck!.slides).toHaveLength(5);
  });
});

describe('recovery helpers', () => {
  it('cuts slide XML at the last complete shape', () => {
    const xml = '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><a:t>One</a:t></p:sp><p:sp><a:t>Two</a:x></p:sp></p:spTree></p:cSld></p:sld>';
    const r = repairSlideXml(xml, true)!;
    expect(r.cut).toBe(true);
    expect(r.xml).toContain('One');
    expect(new DOMParser().parseFromString(r.xml, 'application/xml').getElementsByTagName('parsererror').length).toBe(0);
  });

  it('scans slide text with the title first', () => {
    const it2 = scanSlideText('<p:sp><p:ph type="title"/><a:p><a:r><a:t>Head</a:t></a:r></a:p></p:sp><p:sp><a:p><a:pPr lvl="1"/><a:r><a:t>Body &amp; more</a:t></a:r></a:p></p:sp>')!;
    expect(it2.title).toBe('Head');
    expect(it2.bullets[0]).toEqual({ level: 1, runs: [{ text: 'Body & more' }] });
  });

  it('harvests pictures by signature', () => {
    const png = Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));
    const buf = new Uint8Array(100 + png.length + 50);
    buf.set(png, 100);
    const found = harvestMediaBytes(buf);
    expect(found).toHaveLength(1);
    expect(found[0].data).toEqual(png);
  });
});
