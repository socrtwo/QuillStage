/**
 * Slide transitions. 2-D effects use the Web Animations API on the two slide layers (HTML elements
 * holding the slide SVGs); 3-D effects use CSS 3-D transforms with perspective; Smooth Morph matches
 * elements between the slides and tweens them. People who ask for reduced motion get a cut.
 */
import type { Deck } from '../model/deck';
import type { Element as ModelElement, ShapeElement, Slide, Transition, TransitionType } from '../model/types';
import { resolveBox } from '../model/inherit';
import { reducedMotion } from './animate';

export const TRANSITIONS: { type: TransitionType; label: string; icon: string; group: 'Subtle' | 'Exciting' | 'Dynamic'; dirs?: Transition['dir'][] }[] = [
  { type: 'none', label: 'None', icon: 'block', group: 'Subtle' },
  { type: 'morph', label: 'Smooth Morph', icon: 'auto_awesome_motion', group: 'Subtle' },
  { type: 'fade', label: 'Fade', icon: 'gradient', group: 'Subtle' },
  { type: 'push', label: 'Push', icon: 'arrow_forward', group: 'Subtle', dirs: ['u', 'd', 'l', 'r'] },
  { type: 'wipe', label: 'Wipe', icon: 'swipe_right', group: 'Subtle', dirs: ['l', 'r', 'u', 'd'] },
  { type: 'split', label: 'Split', icon: 'vertical_split', group: 'Subtle', dirs: ['horz', 'vert'] },
  { type: 'reveal', label: 'Reveal', icon: 'flip_to_back', group: 'Subtle', dirs: ['l', 'r'] },
  { type: 'cut', label: 'Cut', icon: 'content_cut', group: 'Subtle' },
  { type: 'randomBars', label: 'Random Bars', icon: 'view_week', group: 'Subtle', dirs: ['horz', 'vert'] },
  { type: 'shape', label: 'Shape', icon: 'circle', group: 'Subtle', dirs: ['in', 'out'] },
  { type: 'circle', label: 'Circle', icon: 'radio_button_unchecked', group: 'Subtle' },
  { type: 'diamond', label: 'Diamond', icon: 'diamond', group: 'Subtle' },
  { type: 'plus', label: 'Plus', icon: 'add', group: 'Subtle' },
  { type: 'uncover', label: 'Uncover', icon: 'flip_to_front', group: 'Subtle', dirs: ['l', 'r', 'u', 'd'] },
  { type: 'cover', label: 'Cover', icon: 'layers', group: 'Subtle', dirs: ['l', 'r', 'u', 'd'] },
  { type: 'pull', label: 'Pull', icon: 'call_received', group: 'Subtle', dirs: ['l', 'r', 'u', 'd'] },
  { type: 'zoom', label: 'Zoom', icon: 'zoom_in', group: 'Exciting', dirs: ['in', 'out'] },
  { type: 'dissolve', label: 'Dissolve', icon: 'blur_on', group: 'Exciting' },
  { type: 'blinds', label: 'Blinds', icon: 'blinds', group: 'Exciting', dirs: ['horz', 'vert'] },
  { type: 'checker', label: 'Checkerboard', icon: 'grid_on', group: 'Exciting' },
  { type: 'comb', label: 'Comb', icon: 'view_stream', group: 'Exciting', dirs: ['horz', 'vert'] },
  { type: 'clock', label: 'Clock', icon: 'schedule', group: 'Exciting' },
  { type: 'wedge', label: 'Wedge', icon: 'change_history', group: 'Exciting' },
  { type: 'flip', label: 'Flip', icon: 'flip', group: 'Exciting', dirs: ['l', 'r'] },
  { type: 'cube', label: 'Cube', icon: 'view_in_ar', group: 'Exciting', dirs: ['l', 'r', 'u', 'd'] },
  { type: 'gallery', label: 'Gallery', icon: 'photo_library', group: 'Exciting', dirs: ['l', 'r'] },
];

export function transitionLabel(t: TransitionType): string { return TRANSITIONS.find((x) => x.type === t)?.label || t; }

export function defaultTransitionDur(t: TransitionType): number {
  return t === 'cut' || t === 'none' ? 0 : t === 'morph' ? 2000 : t === 'cube' || t === 'gallery' || t === 'flip' || t === 'clock' ? 1200 : 700;
}

export interface MorphContext { deck: Deck; from: Slide; to: Slide }

const textOf = (e: ModelElement) => (e.kind === 'shape' && e.text ? e.text.paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n').trim() : '');

/**
 * Smooth Morph matching: pairs of [element id on `a`, element id on `b`], matched by name (names
 * starting with "!!" force a match, as other programs do), then by identical text, then by kind and
 * geometry (pictures by media).
 */
export function matchMorph(a: Slide, b: Slide): [string, string][] {
  const pairs: [string, string][] = [];
  const freeA = [...a.elements], freeB = [...b.elements];
  const take = (pred: (x: ModelElement, y: ModelElement) => boolean) => {
    for (const x of [...freeA]) {
      const yi = freeB.findIndex((y) => pred(x, y));
      if (yi < 0) continue;
      pairs.push([x.id, freeB[yi].id]);
      freeB.splice(yi, 1);
      freeA.splice(freeA.indexOf(x), 1);
    }
  };
  const genericName = (n?: string) => !n || /^(title|subTitle|ctrTitle|body|obj|dt|ftr|sldNum)\b|^(Rectangle|Oval|TextBox|Text Box|Picture|Shape|Group)\s*\d*$/i.test(n.trim());
  take((x, y) => !!x.name && x.name === y.name && (x.name.startsWith('!!') || !genericName(x.name)));
  take((x, y) => !!textOf(x) && textOf(x) === textOf(y));
  take((x, y) => x.kind === 'picture' && y.kind === 'picture' && x.media === y.media);
  take((x, y) => !!x.ph && !!y.ph && x.ph.type === y.ph.type && (x.ph.idx ?? 0) === (y.ph.idx ?? 0));
  take((x, y) => x.kind === 'shape' && y.kind === 'shape' && (x as ShapeElement).geom === (y as ShapeElement).geom && !x.ph && !y.ph && !textOf(x) && !textOf(y));
  return pairs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a transition from `outgoing` to `incoming`. Both are absolutely positioned layers of the same
 * size inside `container`; `incoming` is already in the container (on top). Resolves when done; the
 * caller removes `outgoing`.
 */
export async function runTransition(container: HTMLElement, outgoing: HTMLElement | null, incoming: HTMLElement, t: Transition | undefined, morph?: MorphContext): Promise<void> {
  const type = t?.type || 'none';
  if (!outgoing || type === 'none' || type === 'cut' || reducedMotion() || typeof incoming.animate !== 'function') {
    if (type === 'cut' && t?.thruBlk && outgoing) { outgoing.style.visibility = 'hidden'; incoming.style.visibility = 'hidden'; await sleep(120); incoming.style.visibility = ''; }
    return;
  }
  const dur = t?.dur ?? defaultTransitionDur(type);
  const dir = t?.dir;
  const W = container.clientWidth || 960, H = container.clientHeight || 540;
  const o = { duration: dur, easing: 'ease-in-out', fill: 'both' as FillMode };
  const vec = (d: Transition['dir'], k = 1): [number, number] => (d === 'r' ? [-W * k, 0] : d === 'u' ? [0, H * k] : d === 'd' ? [0, -H * k] : [W * k, 0]);
  const run = (el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions = o) => el.animate(frames, opts).finished.catch(() => undefined);
  const both = async (...ps: Promise<unknown>[]) => { await Promise.all(ps); };
  const clip = (from: string, to: string) => run(incoming, [{ clipPath: from }, { clipPath: to }]);
  container.style.perspective = '1600px';
  try {
    switch (type) {
      case 'fade':
        if (t?.thruBlk) { await run(outgoing, [{ opacity: 1 }, { opacity: 0 }], { ...o, duration: dur / 2 }); outgoing.style.opacity = '0'; await run(incoming, [{ opacity: 0 }, { opacity: 1 }], { ...o, duration: dur / 2 }); }
        else await run(incoming, [{ opacity: 0 }, { opacity: 1 }]);
        break;
      case 'dissolve':
        await run(incoming, [0, 0.15, 0.1, 0.4, 0.35, 0.7, 0.6, 1].map((v) => ({ opacity: v })), { ...o, easing: 'steps(8, end)' });
        break;
      case 'push': {
        const [dx, dy] = vec(dir || 'l');
        await both(run(outgoing, [{ transform: 'none' }, { transform: `translate(${-dx}px,${-dy}px)` }]), run(incoming, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }]));
        break;
      }
      case 'cover': case 'pull': {
        const [dx, dy] = vec(dir || 'l');
        if (type === 'cover') await run(incoming, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }]);
        else { container.insertBefore(incoming, outgoing); await run(outgoing, [{ transform: 'none' }, { transform: `translate(${-dx}px,${-dy}px)` }]); }
        break;
      }
      case 'uncover': case 'reveal': {
        const [dx, dy] = vec(dir || 'l');
        container.insertBefore(incoming, outgoing);
        await run(outgoing, type === 'reveal' ? [{ transform: 'none', opacity: 1 }, { transform: `translate(${-dx * 0.3}px,${-dy * 0.3}px)`, opacity: 0 }] : [{ transform: 'none' }, { transform: `translate(${-dx}px,${-dy}px)` }]);
        break;
      }
      case 'wipe': {
        const d = dir || 'l';
        const from = d === 'l' ? 'inset(0 0 0 100%)' : d === 'r' ? 'inset(0 100% 0 0)' : d === 'u' ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)';
        await clip(from, 'inset(0 0 0 0)');
        break;
      }
      case 'split':
        await clip(dir === 'vert' ? 'inset(50% 0 50% 0)' : 'inset(0 50% 0 50%)', 'inset(0 0 0 0)');
        break;
      case 'shape': case 'circle':
        if (dir === 'out') { container.insertBefore(incoming, outgoing); await run(outgoing, [{ clipPath: 'circle(75% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }]); }
        else await clip('circle(0% at 50% 50%)', 'circle(75% at 50% 50%)');
        break;
      case 'diamond':
        await clip('polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)', 'polygon(50% -50%, 150% 50%, 50% 150%, -50% 50%)');
        break;
      case 'plus':
        await clip('polygon(50% 50%,50% 50%,50% 50%,50% 50%,50% 50%,50% 50%,50% 50%,50% 50%,50% 50%,50% 50%,50% 50%,50% 50%)',
          'polygon(0% 0%,100% 0%,100% 0%,100% 0%,100% 100%,100% 100%,100% 100%,0% 100%,0% 100%,0% 100%,0% 0%,0% 0%)');
        break;
      case 'zoom':
        if (dir === 'out') await both(run(outgoing, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.3)', opacity: 0 }]), run(incoming, [{ opacity: 0 }, { opacity: 1 }]));
        else await run(incoming, [{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]);
        break;
      case 'randomBars': case 'blinds': case 'comb': case 'checker':
        await barsMask(incoming, type, dir, dur);
        break;
      case 'clock': case 'wedge': {
        const steps = 24;
        const frames: Keyframe[] = [];
        for (let i = 0; i <= steps; i++) frames.push({ clipPath: wedgePolygon(i / steps, type === 'wedge') });
        await run(incoming, frames, { ...o, easing: 'linear' });
        break;
      }
      case 'flip': {
        const s = dir === 'r' ? -1 : 1;
        incoming.style.backfaceVisibility = outgoing.style.backfaceVisibility = 'hidden';
        await both(run(outgoing, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${180 * s}deg)` }]), run(incoming, [{ transform: `rotateY(${-180 * s}deg)` }, { transform: 'rotateY(0deg)' }]));
        break;
      }
      case 'cube': {
        const d = dir || 'l';
        const axis = d === 'u' || d === 'd' ? 'X' : 'Y';
        const s = d === 'r' || d === 'u' ? -1 : 1;
        const half = (axis === 'Y' ? W : H) / 2;
        const tf = (deg: number) => `translateZ(${-half}px) rotate${axis}(${deg}deg) translateZ(${half}px)`;
        incoming.style.backfaceVisibility = outgoing.style.backfaceVisibility = 'hidden';
        await both(run(outgoing, [{ transform: tf(0) }, { transform: tf(-90 * s * (axis === 'X' ? -1 : 1)) }]), run(incoming, [{ transform: tf(90 * s * (axis === 'X' ? -1 : 1)) }, { transform: tf(0) }]));
        break;
      }
      case 'gallery': {
        const s = dir === 'r' ? -1 : 1;
        await both(run(outgoing, [{ transform: 'none' }, { transform: `translateX(${-W * s}px) rotateY(${35 * s}deg) scale(0.8)` }]), run(incoming, [{ transform: `translateX(${W * s}px) rotateY(${-35 * s}deg) scale(0.8)` }, { transform: 'none' }]));
        break;
      }
      case 'morph':
        if (morph) await morphTransition(outgoing, incoming, morph, dur);
        else await run(incoming, [{ opacity: 0 }, { opacity: 1 }]);
        break;
      default:
        await run(incoming, [{ opacity: 0 }, { opacity: 1 }]);
    }
  } finally {
    container.style.perspective = '';
    for (const el of [incoming, outgoing]) { el.getAnimations?.().forEach((a) => a.cancel()); el.style.backfaceVisibility = ''; }
  }
}

function wedgePolygon(p: number, wedge: boolean): string {
  // A pie slice from 12 o'clock growing clockwise (clock) or both ways (wedge), as a polygon.
  const pts = ['50% 50%'];
  const n = 32;
  const from = wedge ? -p * Math.PI : 0, to = wedge ? p * Math.PI : p * 2 * Math.PI;
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n - Math.PI / 2;
    pts.push(`${(50 + Math.cos(a) * 75).toFixed(2)}% ${(50 + Math.sin(a) * 75).toFixed(2)}%`);
  }
  return `polygon(${pts.join(',')})`;
}

/** Bars, blinds, comb and checkerboard: a CSS mask of stripes that widen. */
async function barsMask(el: HTMLElement, type: string, dir: Transition['dir'], dur: number): Promise<void> {
  const vert = dir === 'vert';
  const count = type === 'checker' ? 8 : type === 'comb' ? 12 : type === 'blinds' ? 6 : 20;
  const style = el.style as any;
  const set = (p: number) => {
    const pct = Math.min(100, p * 100);
    let img: string;
    if (type === 'randomBars') {
      // Deterministic pseudo-random order of bars.
      const stops: string[] = [];
      for (let i = 0; i < count; i++) {
        const order = ((i * 7) % count) / count;
        const on = p >= order;
        const a = (i / count) * 100, b = ((i + 1) / count) * 100;
        stops.push(`${on ? '#000' : 'transparent'} ${a}% ${b}%`);
      }
      img = `linear-gradient(${vert ? 'to right' : 'to bottom'}, ${stops.join(',')})`;
    } else if (type === 'checker') {
      img = `repeating-linear-gradient(to right, #000 0 ${pct / count}%, transparent ${pct / count}% ${100 / count}%)`;
    } else {
      img = `repeating-linear-gradient(${vert ? 'to right' : 'to bottom'}, #000 0 ${pct / count}%, transparent ${pct / count}% ${100 / count}%)`;
    }
    style.maskImage = style.webkitMaskImage = img;
  };
  const start = performance.now();
  await new Promise<void>((res) => {
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / Math.max(1, dur));
      set(p);
      if (p < 1) requestAnimationFrame(tick); else res();
    };
    tick();
  });
  style.maskImage = style.webkitMaskImage = '';
}

/** Smooth Morph: tween matched elements from their old boxes; fade the rest. */
async function morphTransition(outgoing: HTMLElement, incoming: HTMLElement, m: MorphContext, dur: number): Promise<void> {
  const pairs = matchMorph(m.from, m.to);
  const inSvg = incoming.querySelector('svg');
  const outSvg = outgoing.querySelector('svg');
  if (!inSvg || !outSvg) { await incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur }).finished; return; }
  const matchedIn = new Set(pairs.map((p) => p[1]));
  const matchedOut = new Set(pairs.map((p) => p[0]));
  const wrap = (svg: Element, id: string) => svg.querySelector<SVGGElement>(`g.qs-anim[data-for="${id.replace(/["\\]/g, '\\$&')}"]`) || (svg.querySelector<SVGGElement>(`g[data-id="${id.replace(/["\\]/g, '\\$&')}"]`)?.parentElement as unknown as SVGGElement | null);
  const anims: Promise<unknown>[] = [];
  const o = { duration: dur, easing: 'ease-in-out', fill: 'both' as FillMode };
  // Outgoing: matched elements vanish at once (their incoming twins take over); the rest fades out.
  for (const id of matchedOut) { const g = wrap(outSvg, id); if (g) g.style.visibility = 'hidden'; }
  anims.push(outgoing.animate([{ opacity: 1 }, { opacity: 0 }], o).finished.catch(() => undefined));
  // Incoming: background and unmatched elements fade in.
  const bg = inSvg.querySelector<SVGElement>('.qs-bg');
  if (bg) anims.push(bg.animate([{ opacity: 0 }, { opacity: 1 }], o).finished.catch(() => undefined));
  for (const w of inSvg.querySelectorAll<SVGGElement>('g.qs-anim')) {
    const id = (w.getAttribute('data-for') || '').split('#')[0];
    if (!matchedIn.has(id)) anims.push(w.animate([{ opacity: 0 }, { opacity: 1 }], o).finished.catch(() => undefined));
  }
  for (const [ida, idb] of pairs) {
    const ea = m.from.elements.find((e) => e.id === ida)!, eb = m.to.elements.find((e) => e.id === idb)!;
    const A = resolveBox(m.deck, m.from, ea), B = resolveBox(m.deck, m.to, eb);
    const g = wrap(inSvg, idb);
    if (!g) continue;
    g.style.transformBox = 'view-box';
    g.style.transformOrigin = `${B.x}px ${B.y}px`;
    const sx = B.w ? A.w / B.w : 1, sy = B.h ? A.h / B.h : 1;
    const from = `translate(${A.x - B.x}px,${A.y - B.y}px) scale(${sx},${sy})`;
    anims.push(g.animate([{ transform: from }, { transform: 'none' }], o).finished.catch(() => undefined));
  }
  await Promise.all(anims);
  for (const w of inSvg.querySelectorAll<SVGGElement>('g.qs-anim')) { w.getAnimations().forEach((a) => a.cancel()); w.style.transformBox = 'fill-box'; w.style.transformOrigin = 'center'; }
  bg?.getAnimations().forEach((a) => a.cancel());
}
