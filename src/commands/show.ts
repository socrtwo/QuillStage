/** Slide Show tab: presenting, presenter view, rehearsal, custom shows, set up, timings, timed formats. */
import { def } from './registry';
import type { App } from '../app';
import type { CustomShow } from '../model/types';
import { newId } from '../model/deck';
import { openDialog, toast, confirmDialog, promptDialog } from '../ui/dialog';
import { slideTitle } from '../render/slide';

const hasSlides = (app: App) => app.deck.slides.length > 0;

async function present(app: App, opts: { from?: number; slideId?: string; customShow?: string }): Promise<void> {
  if (!hasSlides(app)) { toast('Add a slide first.'); return; }
  if (app.tab.ui.editingText) app.tab.ui.commitText();
  const show = app.deck.data.show;
  const o = { ...opts, customShow: opts.customShow ?? show.customShow, ...(opts.from == null && !opts.slideId && show.from ? { from: show.from - 1 } : {}) };
  if (app.prefs.presenterView) {
    const { startPresenter } = await import('../show/presenter');
    startPresenter(app, o);
  } else {
    const { startShow } = await import('../show/player');
    startShow(app, { ...o, kiosk: show.kiosk, loop: show.loop });
  }
}

async function customShows(app: App, play?: string): Promise<void> {
  const d = app.deck;
  if (play) { const cs = d.data.customShows.find((c) => c.id === play || c.name === play); if (cs) await present(app, { customShow: cs.id }); return; }
  const list = d.data.customShows;
  const names = list.map((c) => ({ value: c.id, label: `${c.name} (${c.slides.length} slides)` }));
  const r = await openDialog({ title: 'Custom Shows', fields: [
    { key: 'pick', label: 'Custom shows', type: 'select', options: names.length ? names : [{ value: '', label: '(none yet)' }], value: names[0]?.value || '' },
    { key: 'action', label: 'Action', type: 'radio', options: [{ value: 'new', label: 'New…' }, ...(names.length ? [{ value: 'edit', label: 'Edit…' }, { value: 'copy', label: 'Copy' }, { value: 'delete', label: 'Remove' }, { value: 'show', label: 'Show' }] : [])], value: names.length ? 'show' : 'new' },
  ] });
  if (!r) return;
  const cur = list.find((c) => c.id === r.pick);
  if (r.action === 'show' && cur) { await present(app, { customShow: cur.id }); return; }
  if (r.action === 'delete' && cur) { d.transact('Remove Custom Show', () => { d.data.customShows = d.data.customShows.filter((c) => c !== cur); if (d.data.show.customShow === cur.id) delete d.data.show.customShow; }); return; }
  if (r.action === 'copy' && cur) { d.transact('Copy Custom Show', () => d.data.customShows.push({ id: newId('cs'), name: `Copy of ${cur.name}`, slides: [...cur.slides] })); return; }
  const edit = r.action === 'edit' ? cur : undefined;
  const e = await openDialog({ title: edit ? 'Edit Custom Show' : 'Define Custom Show', fields: [
    { key: 'name', label: 'Slide show name', type: 'text', value: edit?.name || `Custom Show ${list.length + 1}` },
    { key: 'slides', label: 'Slides in the custom show (in order)', type: 'list', multiple: true, options: d.slides.map((s, i) => ({ value: s.id, label: `${i + 1}. ${slideTitle(s) || '(untitled)'}` })), value: edit?.slides || [] },
    { key: 'order', label: 'Or type the slide numbers in show order (e.g. 1, 3, 5-7, 2)', type: 'text', value: '' },
  ] });
  if (!e || !e.name) return;
  let slides: string[] = Array.isArray(e.slides) ? e.slides : [];
  if (String(e.order).trim()) {
    slides = [];
    for (const part of String(e.order).split(/[,\s]+/).filter(Boolean)) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(part);
      if (!m) continue;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let k = a; a <= b ? k <= b : k >= b; k += a <= b ? 1 : -1) { const s = d.slides[k - 1]; if (s) slides.push(s.id); }
    }
  }
  if (!slides.length) { toast('Choose at least one slide.'); return; }
  d.transact(edit ? 'Edit Custom Show' : 'New Custom Show', () => {
    if (edit) { const t = d.data.customShows.find((c) => c.id === edit.id)!; t.name = e.name; t.slides = slides; }
    else d.data.customShows.push({ id: newId('cs'), name: e.name, slides } as CustomShow);
  });
}

async function setUp(app: App): Promise<void> {
  const d = app.deck;
  const s = d.data.show;
  const r = await openDialog({ title: 'Set Up Show', fields: [
    { key: 'type', label: 'Show type', type: 'radio', options: [{ value: 'speaker', label: 'Presented by a speaker (full screen)' }, { value: 'kiosk', label: 'Browsed at a kiosk (full screen, loops, advances on timings only)' }], value: s.kiosk ? 'kiosk' : 'speaker' },
    { key: 'loop', label: 'Loop continuously until Esc', type: 'checkbox', value: !!s.loop },
    { key: 'anim', label: 'Show without animation', type: 'checkbox', value: s.showAnimation === false },
    { key: 'range', label: 'Show slides', type: 'radio', options: [{ value: 'all', label: 'All' }, { value: 'range', label: 'From … to …' }, ...(d.data.customShows.length ? [{ value: 'custom', label: 'Custom show' }] : [])], value: s.customShow ? 'custom' : s.from ? 'range' : 'all' },
    { key: 'from', label: 'From', type: 'number', value: s.from || 1, min: 1, max: d.slides.length, half: true, visibleIf: (v) => v.range === 'range' },
    { key: 'to', label: 'To', type: 'number', value: s.to || d.slides.length, min: 1, max: d.slides.length, half: true, visibleIf: (v) => v.range === 'range' },
    { key: 'custom', label: 'Custom show', type: 'select', options: d.data.customShows.map((c) => ({ value: c.id, label: c.name })), value: s.customShow, visibleIf: (v) => v.range === 'custom' },
    { key: 'advance', label: 'Advance slides', type: 'radio', options: [{ value: 'manual', label: 'Manually' }, { value: 'timings', label: 'Using timings, if present' }], value: s.useTimings === false ? 'manual' : 'timings' },
    { key: 'presenter', label: 'Use Presenter View (on this device)', type: 'checkbox', value: app.prefs.presenterView },
    { key: 'pen', label: 'Pen color', type: 'color', value: s.penColor || app.prefs.penColor, half: true },
    { key: 'laser', label: 'Laser pointer color', type: 'color', value: s.laserColor || app.prefs.laserColor, half: true },
  ] });
  if (!r) return;
  d.transact('Set Up Show', () => {
    d.data.show = {
      ...s, kiosk: r.type === 'kiosk' || undefined, loop: !!r.loop || r.type === 'kiosk' || undefined, showAnimation: r.anim ? false : undefined,
      useTimings: r.advance === 'manual' ? false : undefined, penColor: r.pen, laserColor: r.laser,
      from: r.range === 'range' ? Math.max(1, +r.from) : undefined, to: r.range === 'range' ? Math.max(+r.from, +r.to) : undefined,
      customShow: r.range === 'custom' ? r.custom : undefined,
    };
  });
  app.prefs.presenterView = !!r.presenter;
  app.prefs.penColor = r.pen; app.prefs.laserColor = r.laser;
  app.savePrefs();
}

export const TIMED_FORMATS = [
  { id: 'pechakucha', label: 'Pecha Kucha (20 slides × 20 s)', count: 20, sec: 20 },
  { id: 'ignite', label: 'Ignite (20 slides × 15 s)', count: 20, sec: 15 },
  { id: 'lightning', label: 'Lightning talk (5 min, even split)', count: 0, sec: 300 },
];

def([
  { id: 'show.fromStart', label: 'Present from Beginning', icon: 'play_arrow', tab: 'Slide Show', group: 'Start Slide Show', keys: ['F5'], edits: false, noRecord: true, popular: true, isEnabled: hasSlides, run: (app) => present(app, { from: 0 }) },
  { id: 'show.fromCurrent', label: 'Present from Current Slide', icon: 'slideshow', tab: 'Slide Show', group: 'Start Slide Show', keys: ['Shift-F5'], edits: false, noRecord: true, popular: true, isEnabled: hasSlides, run: (app) => present(app, { slideId: app.tab.current }) },
  {
    id: 'show.presenterView', label: 'Presenter View', icon: 'co_present', tab: 'Slide Show', group: 'Start Slide Show', keys: ['Alt-F5'], edits: false, noRecord: true, isEnabled: hasSlides,
    tip: 'Notes, next slide and timer on this screen; the slides on a second window or screen',
    run: async (app) => { const { startPresenter } = await import('../show/presenter'); startPresenter(app, { slideId: app.tab.current }); },
  },
  {
    id: 'show.rehearse', label: 'Rehearse', icon: 'record_voice_over', tab: 'Slide Show', group: 'Start Slide Show', edits: false, noRecord: true, isEnabled: hasSlides, origin: 'Keynote',
    tip: 'Practice with Presenter View on this screen alone', run: async (app) => { const { startPresenter } = await import('../show/presenter'); startPresenter(app, { from: 0, singleScreen: true }); },
  },
  {
    id: 'show.customShows', label: 'Custom Slide Show', icon: 'playlist_play', tab: 'Slide Show', group: 'Start Slide Show', kind: 'menu', edits: true,
    tip: 'Create and play named selections of slides', run: (app, id?: string) => customShows(app, id),
    menu: (app) => [...app.deck.data.customShows.map((c) => ({ id: 'show.customShows', arg: c.id, label: c.name })), ...(app.deck.data.customShows.length ? [{ separator: true }] : []), { id: 'show.customShows', label: 'Custom Shows…' }],
  },
  { id: 'show.setUp', label: 'Set Up Slide Show', icon: 'settings_slow_motion', tab: 'Slide Show', group: 'Set Up', edits: true, run: (app) => setUp(app) },
  { id: 'show.rehearseTimings', label: 'Rehearse Timings', icon: 'timer', tab: 'Slide Show', group: 'Set Up', edits: true, isEnabled: hasSlides, tip: 'Run the show and record how long each slide stays up', run: async (app) => { const { startShow } = await import('../show/player'); startShow(app, { from: 0, rehearse: true }); } },
  {
    id: 'show.useTimings', label: 'Use Timings', icon: 'av_timer', tab: 'Slide Show', group: 'Set Up', kind: 'toggle', edits: true,
    isActive: (app) => app.deck.data.show.useTimings !== false,
    run: (app) => app.deck.transact('Use Timings', () => { const s = app.deck.data.show; s.useTimings = s.useTimings === false ? undefined : false; }),
  },
  {
    id: 'show.clearTimings', label: 'Clear Timings', icon: 'timer_off', tab: 'Slide Show', group: 'Set Up', kind: 'menu', edits: true,
    run: (app, which?: 'current' | 'all') => {
      const slides = which === 'all' ? app.deck.slides : app.targetSlides();
      app.deck.transact('Clear Timings', () => { for (const s of slides) if (s.transition) { delete s.transition.advAfter; if (s.transition.type === 'none' && s.transition.advClick !== false) s.transition = undefined; } }, slides.map((s) => s.id));
    },
    menu: () => [{ id: 'show.clearTimings', arg: 'current', label: 'Clear Timing on Current Slide' }, { id: 'show.clearTimings', arg: 'all', label: 'Clear Timings on All Slides' }],
  },
  {
    id: 'show.timedFormat', label: 'Timed Format', icon: 'hourglass_empty', tab: 'Slide Show', group: 'Set Up', kind: 'menu', edits: true, origin: 'Pecha Kucha, Ignite',
    tip: 'Set every slide to advance automatically on a fixed timer',
    run: async (app, arg?: string | { sec: number }) => {
      const d = app.deck;
      let sec: number, count = 0;
      const f = TIMED_FORMATS.find((t) => t.id === arg);
      if (f) { count = f.count; sec = f.count ? f.sec : f.sec / Math.max(1, d.slides.length); }
      else if (arg && typeof arg === 'object') sec = +arg.sec;
      else { const r = await openDialog({ title: 'Timed Format', fields: [{ key: 's', label: 'Seconds per slide', type: 'number', value: 20, min: 1 }] }); if (!r) return; sec = +r.s; }
      if (!(sec! > 0)) return;
      if (count && d.slides.length !== count && typeof document !== 'undefined' && !(app as any).__noConfirm) {
        if (!(await confirmDialog('Timed Format', `${f!.label.split(' (')[0]} uses ${count} slides; this presentation has ${d.slides.length}. Apply the timing anyway?`, 'Apply'))) return;
      }
      d.transact('Timed Format', () => { for (const s of d.slides) s.transition = { type: 'none', ...(s.transition || {}), advAfter: Math.round(sec * 1000), advClick: false }; d.data.show.useTimings = undefined; }, d.slides.map((s) => s.id));
      toast(`Every slide now advances after ${+sec!.toFixed(1)} s.`);
    },
    menu: () => [...TIMED_FORMATS.map((t) => ({ id: 'show.timedFormat', arg: t.id, label: t.label })), { id: 'show.timedFormat', label: 'Custom…' }],
  },
  {
    id: 'show.usePresenterView', label: 'Use Presenter View', icon: 'present_to_all', tab: 'Slide Show', group: 'Monitors', kind: 'toggle', edits: false, noRecord: true,
    tip: 'Present with notes and a timer on this screen when a second window or screen is available',
    isActive: (app) => app.prefs.presenterView, run: (app) => { app.prefs.presenterView = !app.prefs.presenterView; app.savePrefs(); },
  },
]);

