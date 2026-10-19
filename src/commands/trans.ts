/** Transitions tab: transition gallery, effect options, timing, preview. */
import { def, type MenuEntry } from './registry';
import type { App } from '../app';
import type { Slide, Transition, TransitionType } from '../model/types';
import { editSlides } from '../edit/ops';
import { TRANSITIONS, defaultTransitionDur, transitionLabel } from '../render/transitions';
import { openDialog, toast } from '../ui/dialog';
import { h } from '../ui/dom';
import { slideSvg } from '../render/slide';

const DIR_LABEL: Record<string, string> = { l: 'From Right', r: 'From Left', u: 'From Bottom', d: 'From Top', in: 'In', out: 'Out', horz: 'Horizontal', vert: 'Vertical', lu: 'From Bottom-Right', ru: 'From Bottom-Left', ld: 'From Top-Right', rd: 'From Top-Left' };
const hasSlide = (app: App) => !!app.slide && app.tab.view !== 'master';
const cur = (app: App): Transition | undefined => app.slide?.transition;

/** Sets the transition type of the target slides, keeping their timing settings. */
export function applyTransition(app: App, type: TransitionType): void {
  const def0 = TRANSITIONS.find((t) => t.type === type);
  editSlides(app, `Transition: ${transitionLabel(type)}`, (s) => {
    const old = s.transition || {} as Transition;
    if (type === 'none') {
      const keep = { advClick: old.advClick, advAfter: old.advAfter };
      s.transition = keep.advAfter != null || keep.advClick === false ? { type: 'none', ...keep } : undefined;
      return;
    }
    s.transition = { ...old, type, dur: old.type === type && old.dur ? old.dur : defaultTransitionDur(type), dir: def0?.dirs?.includes(old.dir as any) ? old.dir : def0?.dirs?.[0] };
    if (!s.transition.dir) delete s.transition.dir;
  });
}

async function preview(app: App): Promise<void> {
  const d = app.deck;
  const s = app.slide;
  if (!s) return;
  const i = d.slideIndex(s.id);
  const prev = d.slides[i - 1];
  // Sized by the dialog (not the window) so the preview never runs past the dialog's edge on phones.
  const box = h('div', { style: `position:relative;width:100%;aspect-ratio:${d.size.w}/${d.size.h};flex:none;overflow:hidden;background:#000` });
  const layer = (sl: Slide | undefined) => { const el = h('div', { style: 'position:absolute;inset:0' }); el.innerHTML = sl ? slideSvg(d, sl, { mode: 'show' }) : ''; el.querySelector('svg')?.setAttribute('style', 'width:100%;height:100%;display:block'); if (!sl) el.style.background = '#000'; return el; };
  const play = async () => {
    box.textContent = '';
    const out = layer(prev), inc = layer(s);
    box.append(out, inc);
    const { runTransition } = await import('../render/transitions');
    await runTransition(box, out, inc, s.transition, prev ? { deck: d, from: prev, to: s } : undefined);
    out.remove();
  };
  setTimeout(play, 50);
  await openDialog({ title: `Preview: ${transitionLabel(s.transition?.type || 'none')}`, wide: true, content: box, ok: 'Close', cancel: false, buttons: [{ label: 'Play Again', onClick: () => void play() }] });
}

def([
  { id: 'trans.preview', label: 'Preview', icon: 'play_circle', tab: 'Transitions', group: 'Preview', edits: false, noRecord: true, isEnabled: hasSlide, tip: 'Play this slide\'s transition', run: (app) => preview(app) },
  {
    id: 'trans.apply', label: 'Transition', icon: 'animation', tab: 'Transitions', group: 'Transition to This Slide', kind: 'gallery', edits: true, isEnabled: hasSlide,
    tip: 'The effect used when this slide appears in the show',
    run: (app, type?: TransitionType) => { if (type && TRANSITIONS.some((t) => t.type === type)) applyTransition(app, type); },
    menu: (app) => {
      const t = cur(app)?.type || 'none';
      const out: MenuEntry[] = [];
      for (const g of ['Subtle', 'Exciting', 'Dynamic'] as const) {
        const items = TRANSITIONS.filter((x) => x.group === g);
        if (!items.length) continue;
        out.push({ heading: g }, ...items.map((x) => ({ id: 'trans.apply', arg: x.type, label: x.label, icon: x.icon, checked: x.type === t })));
      }
      return out;
    },
  },
  ...TRANSITIONS.map((t) => ({
    id: t.type === 'morph' ? 'trans.smoothMorph' : `trans.${t.type}`, label: t.type === 'none' ? 'No Transition' : t.label, icon: t.icon, tab: 'Transitions', group: 'Transition to This Slide', edits: true, isEnabled: hasSlide,
    ...(t.type === 'morph' ? { origin: 'Keynote Magic Move, PowerPoint Morph', tip: 'Objects with the same name, text or shape move and change smoothly to the next slide' } : {}),
    run: (app: App) => applyTransition(app, t.type), isActive: (app: App) => (cur(app)?.type || 'none') === t.type,
  })),
  {
    id: 'trans.effectOptions', label: 'Effect Options', icon: 'tune', tab: 'Transitions', group: 'Transition to This Slide', kind: 'menu', edits: true,
    isEnabled: (app) => !!TRANSITIONS.find((t) => t.type === cur(app)?.type)?.dirs || cur(app)?.type === 'fade',
    run: (app, opt?: string) => {
      if (!opt) return;
      editSlides(app, 'Effect Options', (s) => { if (!s.transition) return; if (opt === 'thruBlk') s.transition.thruBlk = !s.transition.thruBlk; else s.transition.dir = opt as Transition['dir']; });
    },
    menu: (app) => {
      const t = cur(app);
      const d = TRANSITIONS.find((x) => x.type === t?.type);
      const out: MenuEntry[] = (d?.dirs || []).map((dir) => ({ id: 'trans.effectOptions', arg: dir, label: DIR_LABEL[dir!] || dir!, checked: t?.dir === dir }));
      if (t?.type === 'fade' || t?.type === 'cut') out.push({ id: 'trans.effectOptions', arg: 'thruBlk', label: 'Through Black', checked: !!t.thruBlk });
      return out.length ? out : [{ label: 'No options for this transition' }];
    },
  },
  {
    id: 'trans.duration', label: 'Duration', icon: 'timer', tab: 'Transitions', group: 'Timing', kind: 'size', edits: true, isEnabled: (app) => hasSlide(app) && !!cur(app) && cur(app)!.type !== 'none',
    tip: 'Length of the transition in seconds',
    value: (app) => { const t = cur(app); return t && t.type !== 'none' ? +((t.dur ?? defaultTransitionDur(t.type)) / 1000).toFixed(2) : null; },
    run: (app, sec?: number) => {
      if (sec == null || !Number.isFinite(+sec)) return;
      const ms = Math.max(0, Math.min(60, +sec)) * 1000;
      editSlides(app, 'Transition Duration', (s) => { if (s.transition && s.transition.type !== 'none') s.transition.dur = ms; });
    },
    menu: () => [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5].map((v) => ({ id: 'trans.duration', arg: v, label: `${v} s` })),
  },
  {
    id: 'trans.applyAll', label: 'Apply To All', icon: 'done_all', tab: 'Transitions', group: 'Timing', edits: true, isEnabled: hasSlide,
    tip: 'Give every slide this slide\'s transition and timing',
    run: (app) => {
      const t = cur(app);
      app.deck.transact('Apply Transition to All', () => { for (const s of app.deck.slides) s.transition = t ? { ...t } : undefined; }, app.deck.slides.map((s) => s.id));
      toast(`All ${app.deck.slides.length} slides use ${transitionLabel(t?.type || 'none')}.`);
    },
  },
  {
    id: 'trans.advanceOnClick', label: 'On Mouse Click', icon: 'mouse', tab: 'Transitions', group: 'Timing', kind: 'toggle', edits: true, isEnabled: hasSlide,
    tip: 'Advance to the next slide when clicked', isActive: (app) => cur(app)?.advClick !== false,
    run: (app) => { const on = cur(app)?.advClick === false; editSlides(app, 'Advance on Click', (s) => { s.transition = { type: 'none', ...(s.transition || {}), advClick: on ? undefined : false }; if (s.transition.advClick === undefined) delete s.transition.advClick; }); },
  },
  {
    id: 'trans.advanceAfter', label: 'After', icon: 'timer_play', tab: 'Transitions', group: 'Timing', kind: 'size', edits: true, isEnabled: hasSlide,
    tip: 'Advance automatically after this many seconds (empty or 0 = off)',
    value: (app) => { const a = cur(app)?.advAfter; return a != null ? +(a / 1000).toFixed(2) : null; },
    run: async (app, sec?: number) => {
      if (sec == null) { const r = await openDialog({ title: 'Advance Slide After', fields: [{ key: 's', label: 'Seconds (0 = off)', type: 'number', value: (cur(app)?.advAfter ?? 0) / 1000, min: 0, step: 0.5 }] }); if (!r) return; sec = +r.s; }
      const ms = Math.max(0, +sec) * 1000;
      editSlides(app, 'Advance After', (s) => { s.transition = { type: 'none', ...(s.transition || {}) }; if (ms > 0) s.transition.advAfter = ms; else delete s.transition.advAfter; });
    },
    menu: () => [0, 2, 5, 10, 15, 20, 30, 60].map((v) => ({ id: 'trans.advanceAfter', arg: v, label: v ? `${v} s` : 'Off' })),
  },
  {
    id: 'trans.removeAll', label: 'Remove Transitions from All Slides', icon: 'layers_clear', tab: 'Transitions', group: 'Timing', edits: true,
    run: (app) => app.deck.transact('Remove All Transitions', () => { for (const s of app.deck.slides) { if (!s.transition) continue; const { advAfter, advClick } = s.transition; s.transition = advAfter != null || advClick === false ? { type: 'none', advAfter, advClick } : undefined; } }, app.deck.slides.map((s) => s.id)),
  },
]);
