/** Color picker with the presentation's theme colors (and their tints and shades), standard colors and a custom color. */
import type { App } from '../app';
import type { Color, SchemeColor } from '../model/types';
import { resolveColor, TINT_ROWS } from '../model/theme';
import { showMenu, closeMenus, STANDARD_COLORS } from './dialog';
import { h, icon } from './dom';

const ORDER: SchemeColor[] = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
const NAMES: Record<string, string> = { lt1: 'Background 1', dk1: 'Text 1', lt2: 'Background 2', dk2: 'Text 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6' };
const recent: string[] = [];

/** Resolves to a model Color, null for the "none/automatic" choice, or undefined when dismissed. */
export function themeColorMenu(app: App, anchor: HTMLElement | { x: number; y: number }, opts: { none?: string; auto?: string; title?: string } = {}): Promise<Color | null | undefined> {
  return new Promise((resolve) => {
    let done = false;
    const pick = (c: Color | null) => { if (done) return; done = true; if (typeof c === 'string' && c.startsWith('#') && !recent.includes(c)) { recent.unshift(c); recent.splice(10); } closeMenus(); resolve(c); };
    const owner = app.owner || app.deck.data.masters[0];
    const theme = app.deck.themeOf(owner);
    const master = app.deck.masterOf(owner as any) || app.deck.data.masters[0];
    const ctx = { theme, master };
    const grid = h('div', { class: 'ql-colors' });
    if (opts.auto) grid.appendChild(h('button', { class: 'ql-btn ql-full', onclick: () => pick(null) }, opts.auto));
    grid.appendChild(h('div', { class: 'ql-menu-heading' }, 'Theme Colors'));
    for (const lum of TINT_ROWS) {
      const row = h('div', { class: 'ql-color-row' });
      for (const k of ORDER) {
        // Dark slots get tints, light slots get shades in the first rows (as desktop pickers do).
        const l = lum === 0 ? 0 : (k === 'lt1' || k === 'lt2') && lum > 0 ? -(lum / 4 + 0.05) : lum;
        const c: Color = l ? { s: k, lum: +l.toFixed(2) } : k;
        const hex = resolveColor(c, ctx).hex;
        row.appendChild(h('button', { class: 'ql-color', style: `background:${hex}`, title: `${NAMES[k]}${l ? (l > 0 ? `, lighter ${Math.round(l * 100)}%` : `, darker ${Math.round(-l * 100)}%`) : ''}`, 'aria-label': NAMES[k], onclick: () => pick(c) }));
      }
      grid.appendChild(row);
    }
    grid.appendChild(h('div', { class: 'ql-menu-heading' }, 'Standard Colors'));
    grid.appendChild(h('div', { class: 'ql-color-row' }, ...STANDARD_COLORS.map((c) => h('button', { class: 'ql-color', style: `background:${c}`, title: c, 'aria-label': c, onclick: () => pick(c.toUpperCase()) }))));
    if (recent.length) {
      grid.appendChild(h('div', { class: 'ql-menu-heading' }, 'Recent Colors'));
      grid.appendChild(h('div', { class: 'ql-color-row' }, ...recent.map((c) => h('button', { class: 'ql-color', style: `background:${c}`, title: c, 'aria-label': c, onclick: () => pick(c) }))));
    }
    if (opts.none) grid.appendChild(h('button', { class: 'ql-btn ql-full', onclick: () => pick(null) }, opts.none));
    const more = h('input', { type: 'color', class: 'ql-color-more', 'aria-label': 'More colors' }) as HTMLInputElement;
    more.addEventListener('change', () => pick(more.value.toUpperCase()));
    grid.appendChild(h('label', { class: 'ql-btn ql-full ql-morecolors' }, icon('palette'), ' More Colors… ', more));
    const pos = anchor instanceof HTMLElement ? { anchor } : { x: anchor.x, y: anchor.y };
    const m = showMenu([], { ...pos, onPick: () => undefined, extra: grid, title: opts.title, className: 'ql-color-menu' });
    const obs = new MutationObserver(() => { if (!m.isConnected) { obs.disconnect(); if (!done) { done = true; resolve(undefined); } } });
    obs.observe(document.body, { childList: true });
  });
}
