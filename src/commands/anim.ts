/** Animations tab: entrance, emphasis, exit and motion-path effects, timing, Animation Pane, Build Order. */
import { def, type MenuEntry, type Command } from './registry';
import type { App } from '../app';
import type { AnimClass, AnimEffect, Animation, Slide } from '../model/types';
import { clone, newId } from '../model/deck';
import { edit } from '../edit/ops';
import { EFFECTS, animationSummary, buildSteps, defaultDur, effectLabel } from '../render/animate';
import { openDialog, toast } from '../ui/dialog';
import { h, clear, icon } from '../ui/dom';
import { registerPane, typingIn } from '../ui/panes';
import { isSlide } from '../model/inherit';

const CLS_PREFIX: Record<AnimClass, string> = { entr: 'in', exit: 'out', emph: 'em', path: 'path' };
const CLS_HEAD: Record<AnimClass, string> = { entr: 'Entrance', emph: 'Emphasis', exit: 'Exit', path: 'Motion Paths' };
const DIRS: Record<string, string> = { d: 'From Bottom', u: 'From Top', l: 'From Left', r: 'From Right', in: 'In', out: 'Out' };

const slideOf = (app: App): Slide | undefined => (app.owner && isSlide(app.owner) ? app.owner : undefined);
const hasSel = (app: App) => !!slideOf(app) && app.selected.length > 0;
/** Animations of the selected elements (or the one picked in the pane). */
let paneSel: string | null = null;
export function selectedAnims(app: App): Animation[] {
  const s = slideOf(app);
  if (!s) return [];
  if (paneSel) { const a = s.anims.find((x) => x.id === paneSel); if (a) return [a]; }
  const ids = new Set(app.selected.map((e) => e.id));
  return s.anims.filter((a) => ids.has(a.target));
}

/** Adds (or replaces) an effect on the selected elements. */
export function addEffect(app: App, cls: AnimClass, effect: AnimEffect, replace: boolean): void {
  const s = slideOf(app);
  const sel = app.selected;
  if (!s || !sel.length) { toast('Select an object on the slide to animate.'); return; }
  const ids = sel.map((e) => e.id);
  const fx = EFFECTS.find((e) => e.cls === cls && e.effect === effect);
  edit(app, `${replace ? '' : 'Add '}Animation: ${fx?.label || effect}`, (o) => {
    if (!isSlide(o)) return;
    if (replace) o.anims = o.anims.filter((a) => !ids.includes(a.target));
    ids.forEach((id, i) => {
      const el = o.elements.find((e) => e.id === id);
      const text = el?.kind === 'shape' && (el.text?.paras.filter((p) => p.runs.some((r) => r.text)).length || 0) > 1;
      o.anims.push({ id: newId('an'), target: id, cls, effect, trigger: i === 0 ? 'click' : 'with', dur: defaultDur({ cls, effect }), ...(effect === 'fly' || effect === 'float' || effect === 'wipe' ? { dir: effect === 'float' ? 'u' : 'd' } : {}), ...(text && cls === 'entr' && el!.ph ? { byPara: true } : {}) } as Animation);
    });
  });
  paneSel = null;
}

function setOnSelected(app: App, label: string, fn: (a: Animation) => void): void {
  const ids = new Set(selectedAnims(app).map((a) => a.id));
  if (!ids.size) { toast('Select an animated object first.'); return; }
  edit(app, label, (o) => { if (isSlide(o)) for (const a of o.anims) if (ids.has(a.id)) fn(a); });
}

function move(app: App, dir: -1 | 1): void {
  const ids = new Set(selectedAnims(app).map((a) => a.id));
  edit(app, dir < 0 ? 'Move Earlier' : 'Move Later', (o) => {
    if (!isSlide(o)) return;
    const l = o.anims;
    if (dir < 0) { for (let i = 1; i < l.length; i++) if (ids.has(l[i].id) && !ids.has(l[i - 1].id)) [l[i], l[i - 1]] = [l[i - 1], l[i]]; }
    else for (let i = l.length - 2; i >= 0; i--) if (ids.has(l[i].id) && !ids.has(l[i + 1].id)) [l[i], l[i + 1]] = [l[i + 1], l[i]];
  });
}

function effectMenu(id: string, app: App): MenuEntry[] {
  const curFx = selectedAnims(app)[0];
  const out: MenuEntry[] = [];
  if (id === 'anim.apply') out.push({ id, arg: 'none', label: 'None', checked: !curFx });
  for (const cls of ['entr', 'emph', 'exit', 'path'] as AnimClass[]) {
    out.push({ heading: CLS_HEAD[cls] });
    for (const e of EFFECTS.filter((x) => x.cls === cls)) out.push({ id, arg: `${cls}:${e.effect}`, label: e.label, icon: e.icon, checked: curFx?.cls === cls && curFx.effect === e.effect });
  }
  return out;
}

async function previewAnim(app: App): Promise<void> {
  const s = slideOf(app);
  if (!s || !s.anims.length) { toast('This slide has no animations.'); return; }
  const { renderAnimatedSlide, playStep } = await import('../render/animate');
  const steps = buildSteps(s);
  const W = Math.min(720, innerWidth * 0.8);
  const box = h('div', { style: `width:${W}px;background:#000` });
  let stop = false;
  const play = async () => {
    stop = false;
    box.textContent = '';
    const svg = renderAnimatedSlide(app.deck, s, 0);
    svg.setAttribute('style', 'width:100%;height:auto;display:block');
    box.appendChild(svg);
    for (let i = 1; i < steps.length && !stop; i++) { await playStep(svg, steps[i], { size: app.deck.size }); await new Promise((r) => setTimeout(r, 350)); }
  };
  setTimeout(play, 50);
  await openDialog({ title: 'Animation Preview', content: box, ok: 'Close', cancel: false, buttons: [{ label: 'Play Again', onClick: () => void play() }] });
  stop = true;
}

async function effectDialog(app: App): Promise<void> {
  const a = selectedAnims(app)[0];
  const s = slideOf(app);
  if (!a || !s) { toast('Select an animated object first.'); return; }
  const shapes = s.elements.filter((e) => e.id !== a.target).map((e) => ({ value: e.id, label: e.name || e.kind }));
  const r = await openDialog({ title: `Effect Options: ${effectLabel(a.cls, a.effect)}`, fields: [
    { key: 'trigger', label: 'Start', type: 'select', options: [{ value: 'click', label: 'On Click' }, { value: 'with', label: 'With Previous' }, { value: 'after', label: 'After Previous' }], value: a.trigger },
    { key: 'delay', label: 'Delay (seconds)', type: 'number', value: (a.delay || 0) / 1000, min: 0, step: 0.25 },
    { key: 'dur', label: 'Duration (seconds)', type: 'number', value: (a.dur ?? defaultDur(a)) / 1000, min: 0.05, step: 0.25 },
    { key: 'repeat', label: 'Repeat (times)', type: 'number', value: a.repeat || 1, min: 1, max: 99 },
    { key: 'dir', label: 'Direction', type: 'select', options: [{ value: '', label: '(default)' }, ...Object.entries(DIRS).map(([value, label]) => ({ value, label }))], value: a.dir || '' },
    { key: 'byPara', label: 'Animate text by paragraph', type: 'checkbox', value: !!a.byPara },
    { key: 'onShape', label: 'Trigger: start when this shape is clicked', type: 'select', options: [{ value: '', label: '(part of the click sequence)' }, ...shapes], value: a.onShape || '' },
    ...(a.cls === 'emph' && (a.effect === 'spin' || a.effect === 'growShrink') ? [{ key: 'amount', label: a.effect === 'spin' ? 'Degrees' : 'Size (%)', type: 'number' as const, value: a.amount ?? (a.effect === 'spin' ? 360 : 150) }] : []),
  ] });
  if (!r) return;
  setOnSelected(app, 'Effect Options', (x) => {
    x.trigger = r.trigger; x.delay = Math.round(+r.delay * 1000) || undefined; x.dur = Math.round(+r.dur * 1000); x.repeat = +r.repeat > 1 ? +r.repeat : undefined;
    x.dir = r.dir || undefined; x.byPara = r.byPara || undefined; x.onShape = r.onShape || undefined;
    if (r.amount != null) x.amount = +r.amount;
  });
}

let painter: Animation[] | null = null;

registerPane({
  id: 'animations', title: 'Animation Pane',
  render(app, el) { this.update!(app, el, {}); },
  update(app, el) {
    const s = slideOf(app);
    const sig = `${app.deck.version}:${s?.id}:${paneSel}:${app.tab.ui?.selection.join()}`;
    if (el.dataset.sig === sig || typingIn(el)) return;
    el.dataset.sig = sig;
    clear(el);
    if (!s) { el.appendChild(h('p', { class: 'ql-help' }, 'Animations belong to slides; go to a slide to see them.')); return; }
    el.appendChild(h('div', { class: 'ql-row' }, h('button', { class: 'ql-btn', onclick: () => previewAnim(app) }, icon('play_arrow'), ' Play All'), h('button', { class: 'ql-btn', onclick: () => app.exec('anim.apply') }, icon('add'), ' Add')));
    if (!s.anims.length) { el.appendChild(h('p', { class: 'ql-help' }, 'Select an object and pick an effect on the Animations tab.')); return; }
    let click = 0;
    s.anims.forEach((a, i) => {
      if (a.trigger === 'click' && !a.onShape) click++;
      const target = s.elements.find((e) => e.id === a.target);
      const on = paneSel === a.id || (!paneSel && app.tab.ui.selection.includes(a.target));
      const row = h('div', { class: 'ql-nav-item' + (on ? ' ql-on' : ''), draggable: 'true', style: 'display:flex;align-items:center;gap:6px;cursor:pointer' },
        h('span', { class: 'ql-help', style: 'min-width:1.5em' }, a.onShape ? '⚡' : a.trigger === 'click' ? String(click) : ''),
        icon(a.trigger === 'click' ? 'mouse' : a.trigger === 'with' ? 'drag_handle' : 'schedule'),
        h('span', { style: 'flex:1' }, animationSummary(a, target?.name || target?.kind)),
        h('button', { class: 'ql-iconbtn ql-sm', title: 'Move earlier', onclick: (e: Event) => { e.stopPropagation(); paneSel = a.id; move(app, -1); } }, icon('arrow_upward')),
        h('button', { class: 'ql-iconbtn ql-sm', title: 'Move later', onclick: (e: Event) => { e.stopPropagation(); paneSel = a.id; move(app, 1); } }, icon('arrow_downward')),
        h('button', { class: 'ql-iconbtn ql-sm', title: 'Effect options', onclick: (e: Event) => { e.stopPropagation(); paneSel = a.id; void effectDialog(app); } }, icon('tune')),
        h('button', { class: 'ql-iconbtn ql-sm', title: 'Remove', onclick: (e: Event) => { e.stopPropagation(); edit(app, 'Remove Animation', (o) => { if (isSlide(o)) o.anims = o.anims.filter((x) => x.id !== a.id); }); } }, icon('close')));
      row.addEventListener('click', () => { paneSel = a.id; app.tab.ui.select([a.target]); paneSel = a.id; app.refresh(); });
      row.addEventListener('dragstart', (e) => e.dataTransfer!.setData('text/x-qs-anim', String(i)));
      row.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-qs-anim')) e.preventDefault(); });
      row.addEventListener('drop', (e) => { e.preventDefault(); const from = +e.dataTransfer!.getData('text/x-qs-anim'); if (from === i) return; edit(app, 'Reorder Animations', (o) => { if (!isSlide(o)) return; const [x] = o.anims.splice(from, 1); o.anims.splice(i, 0, x); }); });
      el.appendChild(row);
    });
  },
  onClose() { paneSel = null; },
});

registerPane({
  id: 'buildOrder', title: 'Build Order',
  render(app, el) { this.update!(app, el, {}); },
  update(app, el) {
    const s = slideOf(app);
    const sig = `${app.deck.version}:${s?.id}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    clear(el);
    if (!s) return;
    const steps = buildSteps(s);
    el.appendChild(h('p', { class: 'ql-help' }, `${steps.length - 1} build step(s). Drag a build onto another step to merge it there; use the arrows to change the order.`));
    steps.slice(1).forEach((st, k) => {
      const box = h('div', { class: 'qs-build-step', style: 'border:1px solid var(--line,#ccc);border-radius:6px;padding:4px;margin:6px 0' }, h('b', null, `Build ${k + 1}`));
      box.addEventListener('dragover', (e) => e.preventDefault());
      box.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = e.dataTransfer!.getData('text/x-qs-anim-id');
        const first = st.effects[0]?.anim.id;
        if (!id || !first || id === first) return;
        edit(app, 'Build Order', (o) => {
          if (!isSlide(o)) return;
          const i = o.anims.findIndex((a) => a.id === id);
          const [a] = o.anims.splice(i, 1);
          a.trigger = 'with';
          const j = o.anims.findIndex((x) => x.id === st.effects[st.effects.length - 1].anim.id);
          o.anims.splice(j + 1, 0, a);
        });
      });
      for (const ef of st.effects) {
        const t = s.elements.find((e) => e.id === ef.anim.target);
        const row = h('div', { draggable: 'true', style: 'display:flex;gap:4px;align-items:center' }, icon('drag_indicator'), h('span', { style: 'flex:1' }, animationSummary(ef.anim, t?.name || t?.kind) + (ef.para != null ? ` (paragraph ${ef.para + 1})` : '')),
          h('button', { class: 'ql-iconbtn ql-sm', title: 'Move earlier', onclick: () => { paneSel = ef.anim.id; move(app, -1); paneSel = null; } }, icon('arrow_upward')),
          h('button', { class: 'ql-iconbtn ql-sm', title: 'Move later', onclick: () => { paneSel = ef.anim.id; move(app, 1); paneSel = null; } }, icon('arrow_downward')));
        row.addEventListener('dragstart', (e) => e.dataTransfer!.setData('text/x-qs-anim-id', ef.anim.id));
        box.appendChild(row);
      }
      el.appendChild(box);
    });
  },
});

const perEffect: Command[] = EFFECTS.map((e) => ({
  id: `anim.${CLS_PREFIX[e.cls]}.${e.cls === 'exit' && e.effect === 'appear' ? 'disappear' : e.effect}`, label: `${CLS_HEAD[e.cls].replace(/s$/, '')}: ${e.label}`, icon: e.icon, tab: 'Animations', group: 'Animation', edits: true, isEnabled: hasSel,
  run: (app: App) => addEffect(app, e.cls, e.effect, true),
}));

def([
  { id: 'anim.preview', label: 'Preview', icon: 'play_circle', tab: 'Animations', group: 'Preview', edits: false, noRecord: true, isEnabled: (app) => !!slideOf(app)?.anims.length, tip: 'Play this slide\'s animations', run: (app) => previewAnim(app) },
  {
    id: 'anim.apply', label: 'Animation', icon: 'auto_awesome', tab: 'Animations', group: 'Animation', kind: 'gallery', edits: true, isEnabled: hasSel,
    tip: 'Animate the selected objects (replaces their animations)',
    run: (app, arg?: string) => {
      if (!arg) { app.ui.openCommandMenu({ id: 'anim.apply', label: 'Animation', tab: 'Animations', run: () => 0, menu: (a: App) => effectMenu('anim.apply', a) }, app.ui.anchorFor('anim.apply')); return; }
      if (arg === 'none') { const ids = new Set(app.selected.map((e) => e.id)); edit(app, 'Remove Animation', (o) => { if (isSlide(o)) o.anims = o.anims.filter((a) => !ids.has(a.target)); }); return; }
      const [cls, effect] = arg.split(':') as [AnimClass, AnimEffect];
      addEffect(app, cls, effect, true);
    },
    menu: (app) => effectMenu('anim.apply', app),
  },
  {
    id: 'anim.add', label: 'Add Animation', icon: 'add_circle', tab: 'Animations', group: 'Advanced Animation', kind: 'menu', edits: true, isEnabled: hasSel,
    tip: 'Add another effect to the selected objects',
    run: (app, arg?: string) => { if (!arg) return; const [cls, effect] = arg.split(':') as [AnimClass, AnimEffect]; addEffect(app, cls, effect, false); },
    menu: (app) => effectMenu('anim.add', app),
  },
  { id: 'anim.addMenu', label: 'Add Animation…', icon: 'auto_awesome', tab: 'Animations', group: 'Advanced Animation', internal: true, edits: false, run: (app) => app.ui.openCommandMenu({ id: 'anim.add', label: 'Add Animation', tab: 'Animations', run: () => 0, menu: (a: App) => effectMenu('anim.add', a) } as any, app.ui.anchorFor('anim.add')) },
  ...perEffect,
  {
    id: 'anim.effectOptions', label: 'Effect Options', icon: 'tune', tab: 'Animations', group: 'Animation', kind: 'menu', edits: true, isEnabled: (app) => selectedAnims(app).length > 0,
    run: (app, opt?: string) => {
      if (!opt) { void effectDialog(app); return; }
      if (opt === 'byPara' || opt === 'asOne') setOnSelected(app, 'Sequence', (a) => { a.byPara = opt === 'byPara' || undefined; });
      else setOnSelected(app, 'Direction', (a) => { a.dir = opt as Animation['dir']; });
    },
    menu: (app) => { const a = selectedAnims(app)[0]; return [{ heading: 'Direction' }, ...Object.entries(DIRS).map(([k, v]) => ({ id: 'anim.effectOptions', arg: k, label: v, checked: a?.dir === k })), { heading: 'Sequence' }, { id: 'anim.effectOptions', arg: 'asOne', label: 'As One Object', checked: !a?.byPara }, { id: 'anim.effectOptions', arg: 'byPara', label: 'By Paragraph', checked: !!a?.byPara }, { separator: true }, { id: 'anim.effectDialog', label: 'More Options…' }]; },
  },
  { id: 'anim.effectDialog', label: 'Effect Options Dialog', icon: 'settings', tab: 'Animations', group: 'Animation', edits: true, isEnabled: (app) => selectedAnims(app).length > 0, run: (app) => effectDialog(app) },
  { id: 'anim.pane', label: 'Animation Pane', icon: 'view_list', tab: 'Animations', group: 'Advanced Animation', edits: false, noRecord: true, run: (app) => app.ui.togglePane('animations'), isActive: (app) => app.ui.paneOpen('animations') },
  {
    id: 'anim.trigger', label: 'Trigger', icon: 'bolt', tab: 'Animations', group: 'Advanced Animation', kind: 'menu', edits: true, isEnabled: (app) => selectedAnims(app).length > 0,
    tip: 'Start the selected animation when another shape is clicked',
    run: (app, shapeId?: string) => { if (shapeId === undefined) return; setOnSelected(app, 'Trigger', (a) => { a.onShape = shapeId || undefined; }); },
    menu: (app) => { const s = slideOf(app); const a = selectedAnims(app)[0]; return [{ id: 'anim.trigger', arg: '', label: 'Part of Click Sequence', checked: !a?.onShape }, { heading: 'On Click of' }, ...(s?.elements.filter((e) => e.id !== a?.target).map((e) => ({ id: 'anim.trigger', arg: e.id, label: e.name || e.kind, checked: a?.onShape === e.id })) || [])]; },
  },
  {
    id: 'anim.painter', label: 'Animation Painter', icon: 'format_paint', tab: 'Animations', group: 'Advanced Animation', keys: ['Alt-Shift-c'], kind: 'toggle', edits: true,
    tip: 'Copy the selected object\'s animations; run again with another object selected to paste them',
    isActive: () => !!painter,
    run: (app) => {
      if (!painter) { const a = selectedAnims(app); if (!a.length) { toast('Select an animated object first.'); return; } painter = a.map((x) => clone(x)); toast('Animations copied. Select another object and click Animation Painter again.'); return; }
      const src = painter; painter = null;
      const ids = app.selected.map((e) => e.id);
      if (!ids.length) return;
      edit(app, 'Animation Painter', (o) => { if (!isSlide(o)) return; o.anims = o.anims.filter((a) => !ids.includes(a.target)); for (const id of ids) for (const a of src) o.anims.push({ ...clone(a), id: newId('an'), target: id }); });
    },
  },
  ...(['click', 'with', 'after'] as const).map((t) => ({
    id: t === 'click' ? 'anim.startOnClick' : t === 'with' ? 'anim.startWithPrevious' : 'anim.startAfterPrevious', label: t === 'click' ? 'Start: On Click' : t === 'with' ? 'Start: With Previous' : 'Start: After Previous',
    icon: t === 'click' ? 'mouse' : t === 'with' ? 'drag_handle' : 'schedule', tab: 'Animations', group: 'Timing', kind: 'toggle' as const, edits: true,
    isEnabled: (app: App) => selectedAnims(app).length > 0, isActive: (app: App) => selectedAnims(app)[0]?.trigger === t,
    run: (app: App) => setOnSelected(app, 'Start', (a) => { a.trigger = t; }),
  })),
  {
    id: 'anim.duration', label: 'Duration', icon: 'timer', tab: 'Animations', group: 'Timing', kind: 'size', edits: true, isEnabled: (app) => selectedAnims(app).length > 0,
    value: (app) => { const a = selectedAnims(app)[0]; return a ? +((a.dur ?? defaultDur(a)) / 1000).toFixed(2) : null; },
    run: (app, sec?: number) => { if (sec == null || !Number.isFinite(+sec)) return; setOnSelected(app, 'Animation Duration', (a) => { a.dur = Math.max(10, +sec * 1000); }); },
    menu: () => [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5].map((v) => ({ id: 'anim.duration', arg: v, label: `${v} s` })),
  },
  {
    id: 'anim.delay', label: 'Delay', icon: 'hourglass_top', tab: 'Animations', group: 'Timing', kind: 'size', edits: true, isEnabled: (app) => selectedAnims(app).length > 0,
    value: (app) => { const a = selectedAnims(app)[0]; return a ? +((a.delay || 0) / 1000).toFixed(2) : null; },
    run: (app, sec?: number) => { if (sec == null || !Number.isFinite(+sec)) return; setOnSelected(app, 'Animation Delay', (a) => { a.delay = Math.max(0, +sec * 1000) || undefined; }); },
    menu: () => [0, 0.25, 0.5, 1, 2, 3, 5].map((v) => ({ id: 'anim.delay', arg: v, label: `${v} s` })),
  },
  { id: 'anim.moveEarlier', label: 'Move Earlier', icon: 'arrow_upward', tab: 'Animations', group: 'Timing', edits: true, isEnabled: (app) => selectedAnims(app).length > 0, run: (app) => move(app, -1) },
  { id: 'anim.moveLater', label: 'Move Later', icon: 'arrow_downward', tab: 'Animations', group: 'Timing', edits: true, isEnabled: (app) => selectedAnims(app).length > 0, run: (app) => move(app, 1) },
  { id: 'anim.remove', label: 'Remove Animation', icon: 'remove_circle', tab: 'Animations', group: 'Timing', edits: true, isEnabled: (app) => selectedAnims(app).length > 0, run: (app) => { const ids = new Set(selectedAnims(app).map((a) => a.id)); paneSel = null; edit(app, 'Remove Animation', (o) => { if (isSlide(o)) o.anims = o.anims.filter((a) => !ids.has(a.id)); }); } },
  { id: 'anim.removeAll', label: 'Remove All Animations on Slide', icon: 'layers_clear', tab: 'Animations', group: 'Timing', edits: true, isEnabled: (app) => !!slideOf(app)?.anims.length, run: (app) => edit(app, 'Remove All Animations', (o) => { if (isSlide(o)) o.anims = []; }) },
  { id: 'anim.buildOrder', label: 'Build Order', icon: 'format_list_numbered', tab: 'Animations', group: 'Advanced Animation', edits: false, noRecord: true, origin: 'Keynote', tip: 'See and change the order in which objects build on this slide', run: (app) => app.ui.togglePane('buildOrder'), isActive: (app) => app.ui.paneOpen('buildOrder') },
  {
    id: 'anim.revealSteps', label: 'Reveal by Step', icon: 'format_list_bulleted', tab: 'Animations', group: 'Advanced Animation', edits: true, origin: 'Beamer overlays',
    tip: 'Make the text of the selected placeholders (or all text placeholders on the slide) appear one paragraph per click',
    isEnabled: (app) => !!slideOf(app),
    run: async (app) => {
      const s = slideOf(app)!;
      let targets = app.selected.filter((e) => e.kind === 'shape' && (e.text?.paras.length || 0) > 0);
      if (!targets.length) targets = s.elements.filter((e) => e.kind === 'shape' && e.ph && !['title', 'ctrTitle'].includes(e.ph.type) && (e.text?.paras.some((p) => p.runs.some((r) => r.text)) ?? false));
      if (!targets.length) { toast('No text to reveal on this slide.'); return; }
      const r = await openDialog({ title: 'Reveal by Step', fields: [{ key: 'effect', label: 'Effect', type: 'select', options: [{ value: 'appear', label: 'Appear' }, { value: 'fade', label: 'Fade' }, { value: 'wipe', label: 'Wipe' }, { value: 'fly', label: 'Fly In' }], value: 'appear' }, { key: 'dim', label: 'Note: earlier steps stay visible (as in Beamer overlays)', type: 'info', html: '' }] });
      if (!r) return;
      const ids = targets.map((t) => t.id);
      edit(app, 'Reveal by Step', (o) => {
        if (!isSlide(o)) return;
        o.anims = o.anims.filter((a) => !ids.includes(a.target));
        for (const id of ids) o.anims.push({ id: newId('an'), target: id, cls: 'entr', effect: r.effect, trigger: 'click', byPara: true, dur: defaultDur({ cls: 'entr', effect: r.effect }), ...(r.effect === 'fly' || r.effect === 'wipe' ? { dir: 'd' as const } : {}) });
      });
    },
  },
]);
