/** Prompts and output parsing for the presentation AI features. */

export const SLIDES_SYSTEM = 'You are a presentation assistant inside Anne\'s Stage, an offline-first presentation app. Follow the format instructions exactly. Do not add commentary before or after the requested output.';

export interface OutlineSlide { title: string; bullets: string[]; notes?: string }

export const OUTLINE_FORMAT = 'Reply with JSON only: an array of slides, each {"title": string, "bullets": [string, …] (at most 6 short bullets; indent a sub-point by starting it with two spaces), "notes": string (speaker notes, 1–3 sentences)}.';

export function draftDeckPrompt(topic: string, n: number, audience: string, tone: string): string {
  return `Write a presentation outline of about ${n} slides about: ${topic}\nAudience: ${audience || 'general'}\nTone: ${tone || 'clear and professional'}\nStart with a title slide (its "bullets" holds one subtitle line) and end with a summary or next-steps slide.\n${OUTLINE_FORMAT}`;
}

export function docToDeckPrompt(text: string, n: number): string {
  return `Turn this document into a presentation of about ${n} slides. Keep its facts; do not invent numbers.\n${OUTLINE_FORMAT}\n\nDocument:\n"""\n${text}\n"""`;
}

export function outlineToSlidesPrompt(text: string): string {
  return `Turn these notes or outline into presentation slides. Group related points; one idea per slide.\n${OUTLINE_FORMAT}\n\nNotes:\n"""\n${text}\n"""`;
}

export function addSlidePrompt(topic: string, context: string): string {
  return `Write ONE slide about: ${topic}\nIt goes into this presentation (other slide titles for context): ${context}\n${OUTLINE_FORMAT.replace('an array of slides', 'an array with exactly one slide')}`;
}

export const TEXT_TASKS: Record<string, { label: string; prompt: (t: string, arg?: string) => string }> = {
  rewrite: { label: 'Rewrite', prompt: (t) => `Rewrite this slide text to be clearer and more direct. Keep the same number of lines (one per line) and the meaning.\n"""\n${t}\n"""` },
  shorten: { label: 'Shorten', prompt: (t) => `Shorten this slide text to about half its length, keeping the key points. One line per bullet, no bullet characters.\n"""\n${t}\n"""` },
  expand: { label: 'Expand', prompt: (t) => `Expand this slide text slightly with concrete detail (at most 6 lines, one per line, no bullet characters).\n"""\n${t}\n"""` },
  tone: { label: 'Change Tone', prompt: (t, tone) => `Rewrite this slide text in a ${tone || 'more formal'} tone. One line per line of input.\n"""\n${t}\n"""` },
  assertionHeadline: { label: 'Bullets to Sentence Headline', prompt: (t) => `Write one complete-sentence headline (an assertion, at most 15 words) that states the main point these bullets support. Reply with the sentence only.\n"""\n${t}\n"""` },
  proofread: { label: 'Proofread', prompt: (t) => `Correct spelling, grammar and punctuation in this text. Change nothing else; keep line breaks.\n"""\n${t}\n"""` },
  translate: { label: 'Translate', prompt: (t, lang) => `Translate into ${lang || 'English'}. Keep line breaks; reply with the translation only.\n"""\n${t}\n"""` },
  writeNotes: { label: 'Write Speaker Notes', prompt: (t) => `Write speaker notes (what to say, 60–120 words, natural spoken language) for a slide with this content.\n"""\n${t}\n"""` },
  notesToSlide: { label: 'Notes to Slide Text', prompt: (t) => `Turn these speaker notes into at most 5 short slide bullets (one per line, no bullet characters).\n"""\n${t}\n"""` },
  slideToNotes: { label: 'Slide Text to Notes', prompt: (t) => `Turn these slide bullets into speaker notes in full sentences (what the presenter says).\n"""\n${t}\n"""` },
  summarize: { label: 'Summarize Deck', prompt: (t) => `Summarize this presentation in 4–6 bullet points for a final "Summary" slide (one per line, no bullet characters).\n"""\n${t}\n"""` },
  anticipateQuestions: { label: 'Anticipate Questions', prompt: (t) => `List the 6 questions an audience is most likely to ask after this presentation, each with a one-sentence suggested answer. Format: "Q: …" then "A: …" lines.\n"""\n${t}\n"""` },
  quizFromDeck: { label: 'Generate Quiz', prompt: (t) => `Write 5 multiple-choice questions that test the key points of this presentation. Reply with JSON only: [{"question": string, "choices": [string, string, string, string], "answer": number (0-based index)}].\n"""\n${t}\n"""` },
  altText: { label: 'Generate Alt Text', prompt: (t) => `Write alternative text (one sentence, at most 25 words, no "image of") for this picture on a slide. Context: ${t}` },
  suggestChart: { label: 'Suggest Chart', prompt: (t) => `Choose the best chart for this table. Reply with JSON only: {"type": "column"|"bar"|"line"|"pie"|"area"|"scatter", "title": string}.\n"""\n${t}\n"""` },
};

/** Strips code fences, quotes and bullet characters the model may add. */
export function cleanText(s: string): string {
  return s.replace(/^```[a-z]*\s*|\s*```$/gi, '').replace(/^"""|"""$/g, '').trim();
}

export function linesOf(s: string): string[] {
  return cleanText(s).split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trimEnd()).filter((l) => l.trim());
}

/** Parses JSON that may be wrapped in prose or code fences. */
export function parseJsonLoose<T = any>(s: string): T | null {
  const t = cleanText(s);
  try { return JSON.parse(t); } catch { /* look inside */ }
  const a = t.indexOf('['), o = t.indexOf('{');
  const start = a >= 0 && (o < 0 || a < o) ? a : o;
  if (start < 0) return null;
  const close = t[start] === '[' ? ']' : '}';
  const end = t.lastIndexOf(close);
  if (end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

/** Parses an outline answer: JSON first, then Markdown headings and bullets. */
export function parseOutline(s: string): OutlineSlide[] {
  const j = parseJsonLoose<any>(s);
  const arr = Array.isArray(j) ? j : Array.isArray(j?.slides) ? j.slides : null;
  if (arr) {
    return arr.filter((x: any) => x && (x.title || x.bullets)).map((x: any) => ({
      title: String(x.title || '').trim(),
      bullets: Array.isArray(x.bullets) ? x.bullets.map((b: any) => String(b)).filter((b: string) => b.trim()) : typeof x.bullets === 'string' ? x.bullets.split('\n') : [],
      notes: x.notes ? String(x.notes) : undefined,
    }));
  }
  const out: OutlineSlide[] = [];
  for (const raw of cleanText(s).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const head = /^\s*#{1,3}\s+(.*)$/.exec(line) || /^\s*(?:Slide\s*\d+\s*[:.-]\s*)(.*)$/i.exec(line);
    if (head) { out.push({ title: head[1].replace(/\*\*/g, '').trim(), bullets: [] }); continue; }
    const b = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (!out.length) out.push({ title: b ? '' : line.trim(), bullets: [] });
    if (b) out[out.length - 1].bullets.push(' '.repeat(Math.min(4, b[1].length >= 2 ? 2 : 0)) + b[2].trim());
    else if (/^notes?:/i.test(line.trim())) out[out.length - 1].notes = line.trim().replace(/^notes?:\s*/i, '');
    else if (out[out.length - 1].title) out[out.length - 1].bullets.push(line.trim());
    else out[out.length - 1].title = line.trim();
  }
  return out.filter((x) => x.title || x.bullets.length);
}
