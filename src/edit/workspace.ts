/**
 * The views of one presentation tab: Normal (thumbnails, slide, notes), Outline (two-way with the
 * slides' title and body placeholders), Slide Sorter (sections, drag and drop), Notes Page, Reading
 * view, and Master view (masters and layouts in the rail, edited on the same canvas).
 */
import type { App, DeckTab, TabView } from '../app';
import type { Element, Layout, Master, Paragraph, ShapeElement, Slide } from '../model/types';
import { newId, textOf } from '../model/deck';
import { slideSvg, slideTitle } from '../render/slide';
import { Canvas } from './canvas';
import { h, clear, icon, debounce } from '../ui/dom';
import { showMenu } from '../ui/dialog';
import { isSlide } from '../model/inherit';

export class Workspace implements TabView {
  el: HTMLElement;
  canvas: Canvas;
  private rail: HTMLElement;
  private center: HTMLElement;
  private notesWrap: HTMLElement;
  private notes: HTMLTextAreaElement;
  private alt: HTMLElement;
  private thumbCache = new Map<string, { key: string; svg: string }>();
  private railKey = '';
  private altKey = '';
  private notesFor = '';
  private dragId: string | null = null;

  constructor(public app: App, public tab: DeckTab) {
    this.canvas = new Canvas(app, () => app.active === tab || !app.active ? this.ownerNow() : this.ownerNow());
    this.rail = h('nav', { class: 'qs-rail', 'aria-label': 'Slides', tabindex: '0' });
    this.notes = h('textarea', { class: 'qs-notes-input', placeholder: 'Click to add notes', 'aria-label': 'Speaker notes', spellcheck: String(app.prefs.spellcheck) }) as HTMLTextAreaElement;
    this.notesWrap = h('div', { class: 'qs-notes' }, this.notes);
    this.center = h('div', { class: 'qs-center' }, this.canvas.el, this.notesWrap);
    this.alt = h('div', { class: 'qs-altview' });
    this.el = h('div', { class: 'qs-workspace' }, this.rail, this.center, this.alt);
    const saveNotes = debounce(() => this.commitNotes(), 600);
    this.notes.addEventListener('input', saveNotes);
    this.notes.addEventListener('blur', () => this.commitNotes());
    this.notes.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const t = this.notes; const s = t.selectionStart; t.setRangeText('\t', s, t.selectionEnd, 'end'); saveNotes(); }
      e.stopPropagation();
    });
    this.rail.addEventListener('keydown', (e) => this.railKeys(e));
    new ResizeObserver(() => this.canvas.layout()).observe(this.center);
  }

  private ownerNow(): Slide | Layout | Master | undefined {
    const t = this.tab;
    if (t.view === 'master') return t.deck.data.layouts.find((l) => l.id === t.masterTarget) || t.deck.data.masters.find((m) => m.id === t.masterTarget) || t.deck.data.masters[0];
    return t.deck.slide(t.current) || t.deck.slides[0];
  }

  // TabView
  get selection(): string[] { return this.canvas.selection; }
  set selection(v: string[]) { this.canvas.selection = v; }
  get editingText(): boolean { return this.canvas.editingText; }
  get editing(): string | null { return this.canvas.editor?.el.id || null; }
  get zoom(): number { return this.canvas.zoom; }
  commitText(): void { this.canvas.commitText(); }
  select(ids: string[]): void { this.canvas.select(ids); }
  editText(id: string, selectAll?: boolean): void { this.canvas.editText(id, selectAll); }
  setZoom(z: number | 'fit'): void { this.canvas.setZoom(z); }
  focus(): void {
    if (this.tab.view === 'normal' || this.tab.view === 'master') this.canvas.focus();
    else (this.alt.querySelector('[tabindex], textarea, input') as HTMLElement | null)?.focus();
  }
  destroy(): void { this.canvas.destroy(); this.el.remove(); }

  layout(): void {
    const v = this.tab.view;
    const p = this.app.prefs;
    this.el.dataset.view = v;
    const canvasView = v === 'normal' || v === 'master';
    this.center.style.display = canvasView ? '' : 'none';
    this.alt.style.display = canvasView ? 'none' : '';
    this.rail.style.display = (canvasView && (p.showThumbnails || v === 'master')) || v === 'outline' ? '' : 'none';
    this.notesWrap.style.display = v === 'normal' && p.showNotes ? '' : 'none';
    this.railKey = ''; this.altKey = '';
    this.invalidate();
    requestAnimationFrame(() => this.canvas.layout());
  }

  invalidate(): void {
    const v = this.tab.view;
    if (v === 'normal' || v === 'master') { this.canvas.invalidate(); this.renderRail(); this.syncNotes(); }
    else if (v === 'outline') { this.renderRail(); this.renderOutline(); }
    else if (v === 'sorter') this.renderSorter();
    else if (v === 'notes') this.renderNotesPage();
    else if (v === 'reading') this.renderReading();
  }

  // ------------------------------------------------------------------------------------------
  // Thumbnails

  thumb(owner: Slide | Layout | Master, n?: number): string {
    const deck = this.tab.deck;
    const design = deck.version; // design changes are rare; key on the slide JSON plus deck version for layouts
    const key = isSlide(owner) ? JSON.stringify(owner) + ':' + this.designSig() + ':' + n : String(design) + owner.id;
    const hit = this.thumbCache.get(owner.id);
    if (hit && hit.key === key) return hit.svg;
    const svg = slideSvg(deck, owner, { mode: 'thumb', number: n });
    this.thumbCache.set(owner.id, { key, svg });
    return svg;
  }

  private sigVersion = -1;
  private sig = '';
  private designSig(): string {
    const d = this.tab.deck;
    if (this.sigVersion !== d.version) {
      this.sigVersion = d.version;
      const s = JSON.stringify([d.data.layouts, d.data.masters, d.data.themes, d.data.hf, d.data.size]);
      // Cheap hash
      let x = 0;
      for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
      this.sig = String(x);
    }
    return this.sig;
  }

  private renderRail(): void {
    const t = this.tab, d = t.deck;
    if (t.view === 'master') return this.renderMasterRail();
    const key = `${d.version}:${t.current}:${t.slideSel.join(',')}:${t.view}:${this.designSig()}`;
    if (key === this.railKey) return;
    this.railKey = key;
    clear(this.rail);
    if (t.view === 'outline') { this.rail.style.display = 'none'; return; }
    const sections = d.data.sections;
    const sectionOf = new Map<string, number>();
    sections.forEach((s, i) => s.slides.forEach((id) => sectionOf.set(id, i)));
    let lastSection = -2;
    d.slides.forEach((s, i) => {
      const si = sectionOf.get(s.id) ?? -1;
      if (si !== lastSection && sections.length) {
        lastSection = si;
        const sec = sections[si];
        this.rail.appendChild(h('div', { class: 'qs-section-head', oncontextmenu: (e: MouseEvent) => { e.preventDefault(); this.sectionMenu(e.clientX, e.clientY, si); } },
          h('button', { class: 'ql-iconbtn ql-sm', 'aria-label': 'Collapse section', onclick: () => this.app.exec('section.toggle', si) }, icon(sec?.collapsed ? 'chevron_right' : 'expand_more')),
          h('span', { ondblclick: () => this.app.exec('section.rename', si) }, sec ? sec.name : 'Default Section'),
          h('span', { class: 'ql-help' }, ` (${sec ? sec.slides.length : d.slides.filter((x) => !sectionOf.has(x.id)).length})`)));
      }
      if (si >= 0 && sections[si].collapsed) return;
      const num = i + (d.data.firstNumber ?? 1);
      const sel = t.slideSel.includes(s.id) || s.id === t.current;
      const item = h('div', { class: 'qs-thumb' + (s.id === t.current ? ' qs-current' : '') + (sel ? ' qs-selected' : '') + (s.hidden ? ' qs-hidden-slide' : ''), draggable: 'true', 'data-slide': s.id, role: 'option', 'aria-selected': String(sel), title: slideTitle(s) || `Slide ${num}` },
        h('div', { class: 'qs-thumb-num' }, String(num), s.transition && s.transition.type !== 'none' ? icon('animation', 'qs-thumb-mark') : null, s.comments?.length ? icon('comment', 'qs-thumb-mark') : null),
        h('div', { class: 'qs-thumb-img' }));
      (item.querySelector('.qs-thumb-img') as HTMLElement).innerHTML = this.thumb(s, num);
      item.addEventListener('click', (e) => this.app.goToSlide(s.id, { extend: e.shiftKey, toggle: e.ctrlKey || e.metaKey }));
      item.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!t.slideSel.includes(s.id)) this.app.goToSlide(s.id); this.app.ui.slideContextMenu(e.clientX, e.clientY); });
      let lp: any;
      item.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') lp = setTimeout(() => { this.app.goToSlide(s.id); this.app.ui.slideContextMenu(e.clientX, e.clientY); }, 600); });
      item.addEventListener('pointerup', () => clearTimeout(lp));
      item.addEventListener('pointerleave', () => clearTimeout(lp));
      this.dnd(item, s.id);
      this.rail.appendChild(item);
    });
    const add = h('button', { class: 'qs-rail-add', title: 'New Slide (Ctrl+M)', onclick: () => this.app.exec('slide.new') }, icon('add'), ' New slide');
    this.rail.appendChild(add);
    requestAnimationFrame(() => this.rail.querySelector('.qs-current')?.scrollIntoView({ block: 'nearest' }));
  }

  private dnd(item: HTMLElement, id: string): void {
    item.addEventListener('dragstart', (e) => { this.dragId = id; e.dataTransfer!.effectAllowed = 'move'; e.dataTransfer!.setData('text/x-qs-slide', id); });
    item.addEventListener('dragover', (e) => { if (this.dragId) { e.preventDefault(); const r = item.getBoundingClientRect(); const after = this.tab.view === 'sorter' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2; item.classList.toggle('qs-drop-after', after); item.classList.toggle('qs-drop-before', !after); } });
    item.addEventListener('dragleave', () => item.classList.remove('qs-drop-after', 'qs-drop-before'));
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const after = item.classList.contains('qs-drop-after');
      item.classList.remove('qs-drop-after', 'qs-drop-before');
      const from = this.dragId; this.dragId = null;
      if (!from || from === id) return;
      const ids = this.tab.slideSel.includes(from) ? this.tab.slideSel : [from];
      this.app.exec('slide.moveTo', { ids, target: id, after, copy: e.ctrlKey || e.altKey });
    });
    item.addEventListener('dragend', () => { this.dragId = null; });
  }

  private sectionMenu(x: number, y: number, si: number): void {
    showMenu([
      { id: 'section.rename', arg: si, label: 'Rename Section', icon: 'edit' },
      { id: 'section.remove', arg: si, label: 'Remove Section', icon: 'remove' },
      { id: 'section.removeWithSlides', arg: si, label: 'Remove Section & Slides', icon: 'delete' },
      { id: 'section.removeAll', label: 'Remove All Sections', icon: 'clear_all' },
      { separator: true },
      { id: 'section.moveUp', arg: si, label: 'Move Section Up', icon: 'arrow_upward' },
      { id: 'section.moveDown', arg: si, label: 'Move Section Down', icon: 'arrow_downward' },
      { id: 'section.collapseAll', label: 'Collapse All', icon: 'unfold_less' },
      { id: 'section.expandAll', label: 'Expand All', icon: 'unfold_more' },
    ], { x, y, onPick: (e) => e.id && this.app.exec(e.id, e.arg) });
  }

  private railKeys(e: KeyboardEvent): void {
    const d = this.tab.deck;
    const i = d.slideIndex(this.tab.current);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); const n = d.slides[Math.min(d.slides.length - 1, i + 1)]; if (n) this.app.goToSlide(n.id, { extend: e.shiftKey }); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); const n = d.slides[Math.max(0, i - 1)]; if (n) this.app.goToSlide(n.id, { extend: e.shiftKey }); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.app.exec('slide.delete'); }
    else if (e.key === 'Enter') { e.preventDefault(); this.app.exec('slide.new'); }
    else if (e.key === 'Home') { e.preventDefault(); this.app.exec('slide.first'); }
    else if (e.key === 'End') { e.preventDefault(); this.app.exec('slide.last'); }
  }

  private renderMasterRail(): void {
    const t = this.tab, d = t.deck;
    const key = `m:${d.version}:${t.masterTarget}`;
    if (key === this.railKey) return;
    this.railKey = key;
    clear(this.rail);
    for (const m of d.data.masters) {
      const mi = h('div', { class: 'qs-thumb qs-master-thumb' + (t.masterTarget === m.id ? ' qs-current' : ''), title: `${m.name} Slide Master` }, h('div', { class: 'qs-thumb-num' }, icon('dashboard')), h('div', { class: 'qs-thumb-img' }));
      (mi.querySelector('.qs-thumb-img') as HTMLElement).innerHTML = this.thumb(m);
      mi.addEventListener('click', () => { t.masterTarget = m.id; this.canvas.select([]); this.invalidate(); this.app.refresh(); });
      this.rail.appendChild(mi);
      for (const l of d.layoutsOf(m.id)) {
        const used = d.slides.filter((s) => s.layout === l.id).length;
        const li = h('div', { class: 'qs-thumb qs-layout-thumb' + (t.masterTarget === l.id ? ' qs-current' : ''), title: `${l.name} Layout: used by ${used ? `slide(s) ${d.slides.map((s, i) => (s.layout === l.id ? i + 1 : 0)).filter(Boolean).join(', ')}` : 'no slides'}` }, h('div', { class: 'qs-thumb-num' }, ''), h('div', { class: 'qs-thumb-img' }), h('div', { class: 'qs-thumb-label' }, l.name));
        (li.querySelector('.qs-thumb-img') as HTMLElement).innerHTML = this.thumb(l);
        li.addEventListener('click', () => { t.masterTarget = l.id; this.canvas.select([]); this.invalidate(); this.app.refresh(); });
        li.addEventListener('contextmenu', (e) => { e.preventDefault(); t.masterTarget = l.id; this.invalidate(); showMenu([{ id: 'master.insertLayout', label: 'Insert Layout', icon: 'add' }, { id: 'master.duplicateLayout', label: 'Duplicate Layout', icon: 'content_copy' }, { id: 'master.renameLayout', label: 'Rename Layout', icon: 'edit' }, { id: 'master.deleteLayout', label: 'Delete Layout', icon: 'delete' }], { x: e.clientX, y: e.clientY, onPick: (en) => en.id && this.app.exec(en.id) }); });
        this.rail.appendChild(li);
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Notes

  private syncNotes(): void {
    const s = this.tab.deck.slide(this.tab.current);
    if (!s) { this.notes.value = ''; this.notes.disabled = true; return; }
    this.notes.disabled = false;
    if (document.activeElement === this.notes && this.notesFor === s.id) return;
    this.notesFor = s.id;
    this.notes.value = notesToText(s.notes);
  }

  private commitNotes(): void {
    const s = this.tab.deck.slide(this.notesFor);
    if (!s) return;
    const text = this.notes.value;
    if (text === notesToText(s.notes)) return;
    this.tab.deck.transact('Edit Notes', () => { s.notes = textToNotes(text); }, [s.id]);
  }

  // ------------------------------------------------------------------------------------------
  // Outline view

  private renderOutline(): void {
    const t = this.tab, d = t.deck;
    if (this.alt.contains(document.activeElement) && this.alt.dataset.view === 'outline') return;
    const key = `o:${d.version}`;
    if (key === this.altKey) return;
    this.altKey = key;
    clear(this.alt);
    this.alt.dataset.view = 'outline';
    const list = h('div', { class: 'qs-outline', role: 'list' });
    d.slides.forEach((s, i) => {
      const title = titleShape(s);
      const body = bodyShape(s);
      const ti = h('input', { class: 'qs-outline-title', value: title ? textOf(title.text?.paras) .replace(/\n/g, ' ') : '', placeholder: '(no title)', 'aria-label': `Slide ${i + 1} title` }) as HTMLInputElement;
      const bi = h('textarea', { class: 'qs-outline-body', placeholder: body ? 'Text (Tab = lower level)' : '(no text placeholder)', 'aria-label': `Slide ${i + 1} text`, rows: '1' }) as HTMLTextAreaElement;
      bi.value = body ? (body.text?.paras || []).filter((p) => p.runs.some((r) => r.text)).map((p) => '\t'.repeat(p.level) + p.runs.map((r) => r.text).join('')).join('\n') : '';
      const grow = () => { bi.style.height = 'auto'; bi.style.height = `${bi.scrollHeight}px`; };
      requestAnimationFrame(grow);
      bi.addEventListener('input', grow);
      ti.addEventListener('change', () => this.app.exec('outline.setTitle', { id: s.id, text: ti.value }));
      bi.addEventListener('change', () => this.app.exec('outline.setBody', { id: s.id, text: bi.value }));
      ti.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); ti.dispatchEvent(new Event('change')); this.app.goToSlide(s.id); this.app.exec('slide.new'); this.altKey = ''; this.renderOutline(); (this.alt.querySelectorAll('.qs-outline-title')[i + 1] as HTMLInputElement | undefined)?.focus(); }
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); bi.focus(); }
      });
      bi.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Tab') {
          e.preventDefault();
          const a = bi.value.lastIndexOf('\n', bi.selectionStart - 1) + 1;
          if (e.shiftKey) { if (bi.value[a] === '\t') { bi.setRangeText('', a, a + 1, 'preserve'); } }
          else bi.setRangeText('\t', a, a, 'preserve');
        }
      });
      ti.addEventListener('focus', () => { t.current = s.id; t.slideSel = [s.id]; this.app.refresh(); });
      bi.addEventListener('focus', () => { t.current = s.id; t.slideSel = [s.id]; this.app.refresh(); });
      list.appendChild(h('div', { class: 'qs-outline-slide' + (s.id === t.current ? ' qs-current' : ''), role: 'listitem' },
        h('div', { class: 'qs-outline-num' }, String(i + 1), icon('slideshow')), h('div', { class: 'qs-outline-text' }, ti, bi)));
    });
    this.alt.appendChild(list);
  }

  // ------------------------------------------------------------------------------------------
  // Slide Sorter

  private renderSorter(): void {
    const t = this.tab, d = t.deck;
    const key = `s:${d.version}:${t.current}:${t.slideSel.join(',')}:${this.designSig()}:${this.app.prefs.uiScale}`;
    if (key === this.altKey) return;
    this.altKey = key;
    clear(this.alt);
    this.alt.dataset.view = 'sorter';
    const grid = h('div', { class: 'qs-sorter', role: 'listbox', tabindex: '0', 'aria-multiselectable': 'true' });
    grid.addEventListener('keydown', (e) => this.railKeys(e));
    const sections = d.data.sections;
    const secOf = new Map<string, number>();
    sections.forEach((s, i) => s.slides.forEach((id) => secOf.set(id, i)));
    let last = -2;
    d.slides.forEach((s, i) => {
      const si = secOf.get(s.id) ?? -1;
      if (sections.length && si !== last) { last = si; grid.appendChild(h('div', { class: 'qs-sorter-section' }, sections[si]?.name || 'Default Section')); }
      const sel = t.slideSel.includes(s.id) || s.id === t.current;
      const num = i + (d.data.firstNumber ?? 1);
      const tr = s.transition;
      const item = h('div', { class: 'qs-sort-item' + (sel ? ' qs-selected' : '') + (s.hidden ? ' qs-hidden-slide' : ''), draggable: 'true', role: 'option', 'aria-selected': String(sel) },
        h('div', { class: 'qs-thumb-img' }),
        h('div', { class: 'qs-sort-meta' }, h('span', null, String(num)), tr && tr.type !== 'none' ? icon('animation') : null, tr?.advAfter ? h('span', { class: 'ql-help' }, `${(tr.advAfter / 1000).toFixed(1)}s`) : null, s.notes.length ? icon('notes') : null));
      (item.querySelector('.qs-thumb-img') as HTMLElement).innerHTML = this.thumb(s, num);
      item.addEventListener('click', (e) => this.app.goToSlide(s.id, { extend: e.shiftKey, toggle: e.ctrlKey || e.metaKey }));
      item.addEventListener('dblclick', () => { this.app.goToSlide(s.id); this.app.exec('view.normal'); });
      item.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!t.slideSel.includes(s.id)) this.app.goToSlide(s.id); this.app.ui.slideContextMenu(e.clientX, e.clientY); });
      this.dnd(item, s.id);
      grid.appendChild(item);
    });
    this.alt.appendChild(grid);
  }

  // ------------------------------------------------------------------------------------------
  // Notes Page and Reading view

  private renderNotesPage(): void {
    const t = this.tab, d = t.deck;
    const s = d.slide(t.current);
    if (this.alt.contains(document.activeElement)) return;
    const key = `n:${d.version}:${t.current}`;
    if (key === this.altKey) return;
    this.altKey = key;
    clear(this.alt);
    this.alt.dataset.view = 'notes';
    if (!s) return;
    const ta = h('textarea', { class: 'qs-notespage-text', placeholder: 'Click to add notes', 'aria-label': 'Speaker notes' }) as HTMLTextAreaElement;
    ta.value = notesToText(s.notes);
    ta.addEventListener('change', () => d.transact('Edit Notes', () => { s.notes = textToNotes(ta.value); }, [s.id]));
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    const img = h('div', { class: 'qs-notespage-slide' });
    img.innerHTML = slideSvg(d, s, { mode: 'thumb' });
    const i = d.slideIndex(s.id);
    this.alt.appendChild(h('div', { class: 'qs-notespage' }, img, ta, h('div', { class: 'qs-notespage-foot' },
      h('button', { class: 'ql-btn', disabled: i <= 0 ? '' : null, onclick: () => this.app.exec('slide.prev') }, icon('chevron_left'), ' Previous'),
      h('span', null, `Slide ${i + 1} of ${d.slides.length}`),
      h('button', { class: 'ql-btn', disabled: i >= d.slides.length - 1 ? '' : null, onclick: () => this.app.exec('slide.next') }, 'Next ', icon('chevron_right')))));
  }

  private renderReading(): void {
    const t = this.tab, d = t.deck;
    const s = d.slide(t.current);
    const key = `r:${d.version}:${t.current}`;
    if (key === this.altKey) return;
    this.altKey = key;
    clear(this.alt);
    this.alt.dataset.view = 'reading';
    if (!s) return;
    const i = d.slideIndex(s.id);
    const stage = h('div', { class: 'qs-reading-stage', tabindex: '0' });
    stage.innerHTML = slideSvg(d, s, { mode: 'show', number: i + (d.data.firstNumber ?? 1) });
    stage.addEventListener('click', () => this.app.exec('slide.next'));
    stage.addEventListener('keydown', (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); this.app.exec('slide.next'); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); this.app.exec('slide.prev'); }
      if (e.key === 'Escape') this.app.exec('view.normal');
    });
    this.alt.appendChild(h('div', { class: 'qs-reading' }, stage, h('div', { class: 'qs-reading-bar' },
      h('button', { class: 'ql-iconbtn', 'aria-label': 'Previous', onclick: () => this.app.exec('slide.prev') }, icon('chevron_left')),
      h('span', null, `${i + 1} / ${d.slides.length}`),
      h('button', { class: 'ql-iconbtn', 'aria-label': 'Next', onclick: () => this.app.exec('slide.next') }, icon('chevron_right')),
      h('button', { class: 'ql-btn', onclick: () => this.app.exec('view.normal') }, 'Close Reading View'))));
    requestAnimationFrame(() => stage.focus());
  }
}

// ------------------------------------------------------------------------------------------

export function notesToText(p: Paragraph[]): string {
  return p.map((x) => '\t'.repeat(x.level) + x.runs.map((r) => (r.br ? '\n' : r.text)).join('')).join('\n');
}

export function textToNotes(text: string): Paragraph[] {
  if (!text.trim()) return [];
  return text.split('\n').map((l) => { const m = /^\t*/.exec(l)![0].length; return { level: m, runs: l.slice(m) ? [{ text: l.slice(m) }] : [] }; });
}

export function titleShape(s: Slide): ShapeElement | undefined {
  return s.elements.find((e) => e.kind === 'shape' && e.ph && (e.ph.type === 'title' || e.ph.type === 'ctrTitle')) as ShapeElement | undefined;
}

export function bodyShape(s: Slide): ShapeElement | undefined {
  return s.elements.find((e) => e.kind === 'shape' && e.ph && ['body', 'obj', 'subTitle'].includes(e.ph.type)) as ShapeElement | undefined;
}

/** Creates a title or body placeholder on a slide that lacks one. */
export function ensurePlaceholder(s: Slide, kind: 'title' | 'body'): ShapeElement {
  const existing = kind === 'title' ? titleShape(s) : bodyShape(s);
  if (existing) return existing;
  const el: ShapeElement = { id: newId('sp'), kind: 'shape', geom: 'rect', name: kind === 'title' ? 'Title' : 'Content', ph: kind === 'title' ? { type: 'title' } : { type: 'body', idx: 1 }, text: { paras: [{ level: 0, runs: [] }] } };
  s.elements.push(el as Element);
  return el;
}
