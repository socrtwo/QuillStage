/**
 * Templates (one per original theme) and content starters: guided outlines whose slides say what to
 * put on them (the idea of Freelance Graphics' SmartMasters). All designs and text are original.
 */
import { Deck, newId } from '../model/deck';
import { THEME_PRESETS } from '../model/theme';
import type { Element, Fill, Paragraph, ShapeElement, Slide } from '../model/types';

export interface Template { id: string; name: string; category: string; description: string; icon?: string; build: () => Deck }

const para = (text: string, level = 0): Paragraph => ({ level, runs: text ? [{ text }] : [] });

function fill(slide: Slide, type: string, paras: Paragraph[]): void {
  const el = slide.elements.find((e) => e.ph && (e.ph.type === type || (type === 'title' && e.ph.type === 'ctrTitle') || (type === 'body' && (e.ph.type === 'obj' || e.ph.type === 'subTitle')))) as ShapeElement | undefined;
  if (el) el.text = { ...(el.text || {}), paras };
}

function addSlide(d: Deck, layoutType: string, title: string, body: (string | [string, number])[] = [], notes = ''): Slide {
  const lay = d.layoutByType(layoutType) || d.data.layouts[1];
  const s = d.makeSlide(lay.id);
  fill(s, 'title', [para(title)]);
  if (body.length) fill(s, 'body', body.map((b) => (Array.isArray(b) ? para(b[0], b[1]) : para(b))));
  if (notes) s.notes = notes.split('\n').map((t) => para(t));
  d.data.slides.push(s);
  return s;
}

/** Decorates a theme's master with original graphics so templates look distinct. */
function decorate(d: Deck, style: number): void {
  const m = d.data.masters[0];
  const { w, h } = d.size;
  const shape = (x: number, y: number, ww: number, hh: number, f: Fill, geom = 'rect', extra: Partial<ShapeElement> = {}): Element => ({ id: newId('dec'), kind: 'shape', geom, name: 'Decoration', x, y, w: ww, h: hh, fill: f, line: { fill: { type: 'none' } }, ...extra });
  const title = d.data.layouts.find((l) => l.type === 'title')!;
  switch (style) {
    case 0: // Anne's Office: accent band at the left, thin rule under the title
      m.elements.push(shape(0, 0, 14, h, { type: 'solid', color: 'accent1' }), shape(66, 134, 120, 3, { type: 'solid', color: 'accent1' }));
      title.elements.push(shape(0, h * 0.62, w, h * 0.38, { type: 'solid', color: { s: 'accent1', lum: 0.85 } }));
      break;
    case 1: // Paper: top rule and footer rule
      m.elements.push(shape(66, 18, w - 132, 2, { type: 'solid', color: 'accent1' }), shape(66, h - 44, w - 132, 1, { type: 'solid', color: 'dk2' }));
      break;
    case 2: // Slate: dark background, accent bar
      m.bg = { type: 'solid', color: 'dk2' };
      m.clrMap = { bg1: 'dk1', tx1: 'lt1', bg2: 'dk2', tx2: 'lt2' };
      m.elements.push(shape(66, 130, 64, 4, { type: 'solid', color: 'accent1' }));
      title.bg = { type: 'gradient', angle: 135, stops: [{ pos: 0, color: 'dk2' }, { pos: 1, color: { s: 'accent1', lum: -0.6 } }] };
      break;
    case 3: // Meadow: soft gradient corner
      m.elements.push(shape(w - 220, h - 160, 260, 200, { type: 'solid', color: { s: 'accent1', alpha: 0.15 } }, 'ellipse'));
      title.bg = { type: 'gradient', angle: 90, stops: [{ pos: 0, color: 'lt2' }, { pos: 1, color: 'bg1' }] };
      break;
    case 4: // Studio: bold band under the title on the title slide
      title.elements.unshift(shape(0, h * 0.72, w, h * 0.28, { type: 'solid', color: 'accent2' }));
      m.elements.push(shape(w - 80, 0, 80, 8, { type: 'solid', color: 'accent1' }));
      break;
    case 5: // Archive: framed page
      m.bg = { type: 'solid', color: 'lt1' };
      m.elements.push(shape(18, 18, w - 36, h - 36, { type: 'none' }, 'rect', { line: { fill: { type: 'solid', color: 'accent1' }, width: 1.5 } }));
      break;
  }
}

function themed(preset: number): Deck {
  const d = new Deck(Deck.blankData(undefined, preset));
  decorate(d, preset);
  return d;
}

export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank Presentation', category: 'Themes', description: 'A plain white design', icon: 'crop_landscape', build: () => Deck.blank() },
  ...THEME_PRESETS.map((t, i): Template => ({
    id: `theme-${t.name.toLowerCase()}`, name: t.name, category: 'Themes', description: `${t.fonts.major} headings, ${t.fonts.minor} text`, icon: 'palette',
    build: () => {
      const d = themed(i);
      addSlide(d, 'title', `${t.name} Presentation`, ['Subtitle']);
      return d;
    },
  })),
];

export const STARTERS: Template[] = [
  {
    id: 'starter-status', name: 'Project Status Report', category: 'Content Starters', description: 'Where a project stands, its risks and next steps', icon: 'assignment',
    build: () => {
      const d = themed(1);
      addSlide(d, 'title', 'Project Name: Status Report', ['Reporting period and presenter']);
      addSlide(d, 'obj', 'Summary', ['Overall status: on track, at risk, or off track', 'The one thing the audience must remember'], 'Open with the conclusion; details follow.');
      addSlide(d, 'obj', 'Progress Since Last Report', ['Milestones completed', 'Work in progress', 'Changes to scope']);
      addSlide(d, 'twoObj', 'Schedule and Budget', ['Planned vs. actual dates', 'Budget used and remaining']);
      addSlide(d, 'obj', 'Risks and Issues', ['Risk, likelihood, impact, owner', 'Issues needing a decision']);
      addSlide(d, 'obj', 'Decisions Needed', ['What you need from this audience, and by when']);
      addSlide(d, 'obj', 'Next Steps', ['Action, owner, due date']);
      return d;
    },
  },
  {
    id: 'starter-pitch', name: 'Proposal or Pitch', category: 'Content Starters', description: 'Problem, solution, evidence, ask', icon: 'campaign',
    build: () => {
      const d = themed(4);
      addSlide(d, 'title', 'Proposal Title', ['Your name and organization']);
      addSlide(d, 'titleOnly', 'The Problem in One Sentence', [], 'State the problem from the audience\'s point of view.');
      addSlide(d, 'obj', 'Why It Matters Now', ['Cost of doing nothing', 'What has changed']);
      addSlide(d, 'obj', 'Our Solution', ['What it is', 'How it works', 'Why it is better']);
      addSlide(d, 'obj', 'Evidence', ['Results, pilots, testimonials, numbers']);
      addSlide(d, 'obj', 'Plan and Cost', ['Phases and timeline', 'Investment and return']);
      addSlide(d, 'secHead', 'The Ask', ['What you want the audience to approve today']);
      return d;
    },
  },
  {
    id: 'starter-lesson', name: 'Lesson or Lecture', category: 'Content Starters', description: 'Objectives, content, practice and review', icon: 'school',
    build: () => {
      const d = themed(3);
      addSlide(d, 'title', 'Lesson Title', ['Course · Session number']);
      addSlide(d, 'obj', 'Learning Objectives', ['By the end of this lesson you will be able to…', '…', '…']);
      addSlide(d, 'obj', 'What You Already Know', ['A question or example that connects to prior knowledge']);
      addSlide(d, 'secHead', 'Part 1: Concept', ['']);
      addSlide(d, 'obj', 'Key Idea', ['Definition', 'Example', 'Non-example']);
      addSlide(d, 'obj', 'Practice', ['A short exercise for the class']);
      addSlide(d, 'obj', 'Review', ['Three things to remember']);
      addSlide(d, 'obj', 'Assignment', ['What to do before the next session']);
      return d;
    },
  },
  {
    id: 'starter-research', name: 'Research Talk', category: 'Content Starters', description: 'Question, method, findings, implications (assertion–evidence headlines)', icon: 'science',
    build: () => {
      const d = themed(5);
      addSlide(d, 'title', 'A Sentence Headline That States Your Main Finding', ['Authors · Affiliation · Venue']);
      addSlide(d, 'obj', 'Prior work leaves one question open', ['What is known', 'The gap'], 'Assertion–evidence: each title is a full-sentence claim; the body shows the evidence.');
      addSlide(d, 'obj', 'We measured X in Y under Z', ['Data', 'Method', 'Controls']);
      addSlide(d, 'obj', 'Finding 1 stated as a sentence', ['Chart or figure as evidence']);
      addSlide(d, 'obj', 'Finding 2 stated as a sentence', ['Chart or figure as evidence']);
      addSlide(d, 'obj', 'These results change how we should think about …', ['Implications', 'Limitations']);
      addSlide(d, 'obj', 'Questions', ['Contact and links']);
      return d;
    },
  },
  {
    id: 'starter-pecha', name: 'Pecha Kucha (20 × 20 s)', category: 'Content Starters', description: 'Twenty slides that advance every 20 seconds', icon: 'timer',
    build: () => {
      const d = themed(2);
      addSlide(d, 'title', 'Talk Title', ['Speaker']);
      for (let i = 2; i <= 20; i++) addSlide(d, 'titleOnly', `Image or idea ${i}`, [], 'About 50 words for 20 seconds.');
      for (const s of d.slides) s.transition = { type: 'fade', dur: 500, advClick: false, advAfter: 20000 };
      return d;
    },
  },
  {
    id: 'starter-photo', name: 'Photo Story', category: 'Content Starters', description: 'Full pictures with short captions', icon: 'photo_library',
    build: () => {
      const d = themed(0);
      addSlide(d, 'title', 'Story Title', ['Place and date']);
      for (let i = 1; i <= 5; i++) addSlide(d, 'picTx', `Moment ${i}`, ['One or two sentences about the picture']);
      addSlide(d, 'secHead', 'Thank you', ['']);
      return d;
    },
  },
];
