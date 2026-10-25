/**
 * Web exports: a self-contained HTML slide show (one file: slides as inline SVG, media as data URLs,
 * keyboard/touch/click navigation, builds, timings, notes, overview), and a responsive scrolling
 * "story" page.
 */
import type { Deck } from '../model/deck';
import type { MediaElement, Slide } from '../model/types';
import { resolveBox } from '../model/inherit';
import { slideSvg } from '../render/slide';
import { buildSteps, renderAnimatedSlide, stateAt } from '../render/animate';
import { slideOutline } from './outline';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** JSON safe to put inside a <script> element. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');

function serialize(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

interface SlidePlan { hidden: string[][]; adv: number | null; click: boolean; trans: string; notes: string; media: { src: string; kind: string; x: number; y: number; w: number; h: number; autoplay: boolean; loop: boolean }[] }

function planSlide(deck: Deck, s: Slide): { svg: string; plan: SlidePlan } {
  const steps = buildSteps(s);
  const svg = renderAnimatedSlide(deck, s, steps.length, { number: deck.slideIndex(s.id) + (deck.data.firstNumber ?? 1) });
  // Clear the visibility the renderer applied; the player applies the state of each step.
  for (const g of svg.querySelectorAll<SVGGElement>('g.qs-anim')) g.style.visibility = '';
  const keys = [...svg.querySelectorAll('g.qs-anim')].map((g) => g.getAttribute('data-for')!);
  const hidden: string[][] = [];
  for (let n = 1; n <= Math.max(1, steps.length); n++) {
    const st = stateAt(s, n, steps);
    hidden.push(keys.filter((k) => { const [id, p] = k.split('#'); return st.hide.has(id) || (p != null && !st.paraVisible.get(id)?.has(+p)); }));
  }
  const { w, h } = deck.size;
  const media = s.elements.filter((e): e is MediaElement => e.kind === 'media' && !!deck.media[e.media]).map((m) => {
    const b = resolveBox(deck, s, m);
    return { src: deck.mediaUrl(m.media), kind: m.mediaKind, x: (b.x / w) * 100, y: (b.y / h) * 100, w: (b.w / w) * 100, h: (b.h / h) * 100, autoplay: !!m.autoplay, loop: !!m.loop };
  });
  const t = s.transition;
  return {
    svg: serialize(svg),
    plan: { hidden, adv: t?.advAfter ?? null, click: t?.advClick !== false, trans: t?.type === 'push' ? 'push' : t && t.type !== 'none' && t.type !== 'cut' ? 'fade' : 'none', notes: slideOutline(s).notes.join('\n'), media },
  };
}

const SHOW_CSS = `
html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,sans-serif}
#stage{position:absolute;inset:0;margin:auto;width:min(100vw,calc(100vh*var(--r)));height:min(100vh,calc(100vw/var(--r)));overflow:hidden}
.slide{position:absolute;inset:0;display:none}.slide.on{display:block}
.slide>svg{width:100%;height:100%;display:block}
.slide video,.slide audio{position:absolute;object-fit:contain;background:#000}
.fade{animation:qf .6s ease both}@keyframes qf{from{opacity:0}to{opacity:1}}
.push{animation:qp .6s ease both}@keyframes qp{from{transform:translateX(100%)}to{transform:none}}
#bar{position:fixed;left:12px;bottom:12px;color:#ddd;background:#202124cc;border-radius:8px;padding:6px 10px;font-size:13px;opacity:0;transition:opacity .3s}
body:hover #bar{opacity:1}
#notes{position:fixed;left:0;right:0;bottom:0;max-height:35vh;overflow:auto;background:#202124f2;color:#eee;padding:12px 18px;white-space:pre-wrap;display:none;font-size:16px;line-height:1.45}
#grid{position:fixed;inset:0;overflow:auto;background:#111;display:none;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;padding:20px}
#grid button{border:2px solid transparent;padding:0;background:#fff;cursor:pointer;aspect-ratio:var(--r)}
#grid button svg{width:100%;height:100%;display:block}
#grid button.cur{border-color:#F2B544}
@media (prefers-reduced-motion:reduce){.fade,.push{animation:none}}
@media print{#bar,#notes,#grid{display:none!important}html,body{overflow:visible;height:auto}#stage{position:static;width:100%;height:auto}.slide{position:relative;display:block;page-break-after:always;aspect-ratio:var(--r)}}
`;

const SHOW_JS = `
(function(){
var P=JSON.parse(document.getElementById('plan').textContent);
var slides=[].slice.call(document.querySelectorAll('.slide'));
var cur=-1,step=0,timer=null,buf='';
function apply(){var s=slides[cur],h=P[cur].hidden[step]||[];[].forEach.call(s.querySelectorAll('g.qs-anim'),function(g){g.style.visibility=h.indexOf(g.getAttribute('data-for'))>=0?'hidden':'';});}
function media(on){slides.forEach(function(s,i){[].forEach.call(s.querySelectorAll('video,audio'),function(m){if(i!==cur||!on){m.pause();}else if(m.dataset.autoplay){m.play().catch(function(){});}});});}
function sched(){clearTimeout(timer);var a=P[cur].adv;if(a!=null)timer=setTimeout(next,step<P[cur].hidden.length-1?Math.max(50,a/(P[cur].hidden.length-step)):a);}
function go(i,built){if(i<0||i>=slides.length)return;var old=cur;cur=i;step=built?P[i].hidden.length-1:0;slides.forEach(function(s,k){s.classList.toggle('on',k===i);s.classList.remove('fade','push');});
if(old>=0&&!built&&P[i].trans!=='none')slides[i].classList.add(P[i].trans);apply();media(true);
document.getElementById('count').textContent=(i+1)+' / '+slides.length;document.getElementById('notes').textContent=P[i].notes||'No notes.';sched();}
function next(){if(step<P[cur].hidden.length-1){step++;apply();sched();}else if(cur<slides.length-1)go(cur+1);}
function prev(){if(step>0){step--;apply();}else if(cur>0)go(cur-1,true);}
function grid(){var g=document.getElementById('grid');if(g.style.display==='grid'){g.style.display='none';return;}g.innerHTML='';slides.forEach(function(s,i){var b=document.createElement('button');b.className=i===cur?'cur':'';b.setAttribute('aria-label','Slide '+(i+1));var c=s.querySelector('svg').cloneNode(true);[].forEach.call(c.querySelectorAll('g.qs-anim'),function(x){x.style.visibility='';});b.appendChild(c);b.onclick=function(){g.style.display='none';go(i,true);};g.appendChild(b);});g.style.display='grid';}
document.addEventListener('keydown',function(e){var k=e.key;if(/^[0-9]$/.test(k)){buf+=k;return;}
if(k==='Enter'&&buf){go(parseInt(buf,10)-1);buf='';return;}buf='';
if(['ArrowRight','ArrowDown',' ','PageDown','Enter'].indexOf(k)>=0||k==='n'){next();}
else if(['ArrowLeft','ArrowUp','Backspace','PageUp'].indexOf(k)>=0||k==='p'){prev();}
else if(k==='Home'){go(0);}else if(k==='End'){go(slides.length-1,true);}
else if(k==='N'||(k==='n'&&e.shiftKey)){var n=document.getElementById('notes');n.style.display=n.style.display==='block'?'none':'block';}
else if(k==='g'||k==='G'){grid();}else if(k==='Escape'){document.getElementById('grid').style.display='none';}
else return;e.preventDefault();});
document.getElementById('stage').addEventListener('click',function(e){if(e.target.closest('video,audio'))return;if(P[cur].click)next();});
var sx=0;document.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});
document.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>60){dx<0?next():prev();}},{passive:true});
go(0);})();
`;

export function deckToHtmlShow(deck: Deck, opts: { title?: string } = {}): string {
  const title = opts.title || deck.data.props.title || 'Presentation';
  const { w, h } = deck.size;
  const visible = deck.slides.filter((s) => !s.hidden);
  const plans: SlidePlan[] = [];
  const parts: string[] = [];
  visible.forEach((s, i) => {
    const { svg, plan } = planSlide(deck, s);
    plans.push(plan);
    const media = plan.media.map((m) => `<${m.kind === 'audio' ? 'audio' : 'video'} src="${esc(m.src)}" controls${m.loop ? ' loop' : ''}${m.autoplay ? ' data-autoplay="1"' : ''} style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%"></${m.kind === 'audio' ? 'audio' : 'video'}>`).join('');
    parts.push(`<section class="slide" aria-label="Slide ${i + 1}${slideOutline(s).title ? `: ${esc(slideOutline(s).title)}` : ''}">${svg}${media}</section>`);
    // Media data now lives in the media tags; the plan keeps only positions.
    plan.media = plan.media.map((m) => ({ ...m, src: '' }));
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="Anne's Stage">
<title>${esc(title)}</title><style>:root{--r:${w / h}}${SHOW_CSS}</style></head>
<body><main id="stage">${parts.join('\n')}</main>
<div id="bar"><span id="count"></span> · Arrows or click to advance · N notes · G all slides</div>
<div id="notes" aria-live="polite"></div><div id="grid" role="listbox" aria-label="All slides"></div>
<script type="application/json" id="plan">${scriptJson(plans)}</script>
<script>${SHOW_JS}</script></body></html>
`;
}

const STORY_CSS = `
body{margin:0;font:18px/1.6 Georgia,"Gelasio",serif;color:#1f1f1f;background:#fafaf8}
header{padding:12vh 6vw 6vh;background:#3A2418;color:#fff}header h1{font:600 clamp(32px,6vw,64px)/1.1 system-ui,sans-serif;margin:0}
section{max-width:860px;margin:0 auto;padding:6vh 6vw;border-bottom:1px solid #e4e0da}
section h2{font:600 clamp(24px,3.5vw,36px)/1.2 system-ui,sans-serif;margin:0 0 .6em}
figure{margin:0 0 1.2em}figure svg{width:100%;height:auto;display:block;border-radius:6px;box-shadow:0 2px 10px #0002}
figcaption{font-size:14px;color:#666;margin-top:.4em}
ul{padding-left:1.2em}.l1{margin-left:1.2em}.l2{margin-left:2.4em}.l3{margin-left:3.6em}
aside{font-size:15px;color:#555;border-left:3px solid #C2502A;padding-left:12px}
@media (prefers-color-scheme:dark){body{background:#151515;color:#e8e8e8}section{border-color:#333}aside{color:#bbb}}
`;

/** Responsive scrolling web page: one section per slide with its picture and its text. */
export function deckToStory(deck: Deck, opts: { title?: string; notes?: boolean } = {}): string {
  const visible = deck.slides.filter((s) => !s.hidden);
  const title = opts.title || deck.data.props.title || slideOutline(visible[0] || deck.slides[0] || { elements: [], notes: [] } as any).title || 'Presentation';
  const sections = visible.map((s, i) => {
    const o = slideOutline(s);
    const steps = buildSteps(s);
    const st = stateAt(s, steps.length, steps);
    const svg = slideSvg(deck, s, { mode: 'print', hide: st.hide, paraVisible: st.paraVisible, number: deck.slideIndex(s.id) + (deck.data.firstNumber ?? 1) });
    const body = o.body.length ? `<ul>${o.body.map((b) => `<li class="l${Math.min(3, b.level)}">${esc(b.text)}</li>`).join('')}</ul>` : '';
    const notes = opts.notes !== false && o.notes.join('').trim() ? `<aside>${o.notes.map((n) => esc(n)).join('<br>')}</aside>` : '';
    return `<section id="slide-${i + 1}">${o.title ? `<h2>${esc(o.title)}</h2>` : ''}<figure role="img" aria-label="${esc(o.title || `Slide ${i + 1}`)}">${svg}<figcaption>Slide ${i + 1}</figcaption></figure>${body}${notes}</section>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="Anne's Stage">
<title>${esc(title)}</title><style>${STORY_CSS}</style></head>
<body><header><h1>${esc(title)}</h1>${deck.data.props.author ? `<p>${esc(deck.data.props.author)}</p>` : ''}</header>
<main>${sections.join('\n')}</main></body></html>
`;
}
