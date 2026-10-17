/** Video and audio: play, trim, poster frame, volume, start, loop. */
import { def } from './registry';
import type { App } from '../app';
import type { MediaElement } from '../model/types';
import { edit } from '../edit/ops';
import { openDialog, toast } from '../ui/dialog';
import { h } from '../ui/dom';

const media = (app: App) => app.selected.filter((e): e is MediaElement => e.kind === 'media');
const one = (app: App) => media(app).length === 1;
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(1).padStart(4, '0')}`;

function setMedia(app: App, label: string, fn: (m: MediaElement) => void): void {
  const ids = new Set(media(app).map((m) => m.id));
  edit(app, label, (o) => { for (const e of o.elements) if (ids.has(e.id)) fn(e as MediaElement); });
}

function player(app: App, m: MediaElement): HTMLMediaElement {
  const el = document.createElement(m.mediaKind === 'video' ? 'video' : 'audio');
  el.src = app.deck.mediaUrl(m.media);
  el.controls = true;
  el.style.width = '100%';
  el.style.maxHeight = '50vh';
  if (m.volume != null) el.volume = Math.max(0, Math.min(1, m.volume));
  return el;
}

def([
  {
    id: 'media.play', label: 'Play', icon: 'play_arrow', tab: 'Playback', group: 'Preview', edits: false, noRecord: true, isEnabled: one,
    run: async (app) => {
      const m = media(app)[0];
      const p = player(app, m);
      p.addEventListener('loadedmetadata', () => { p.currentTime = (m.start || 0) / 1000; void p.play().catch(() => undefined); });
      p.addEventListener('timeupdate', () => { if (m.end && p.currentTime * 1000 >= m.end) p.pause(); });
      await openDialog({ title: m.name || 'Play', content: h('div', { style: 'min-width:min(80vw,640px)' }, p), ok: 'Close', cancel: false });
      p.pause();
    },
  },
  {
    id: 'media.trim', label: 'Trim', icon: 'content_cut', tab: 'Playback', group: 'Editing', edits: true, isEnabled: one,
    tip: 'Choose where playback starts and ends (the file itself is not changed)',
    run: async (app) => {
      const m = media(app)[0];
      const p = player(app, m);
      let dur = 0;
      const info = h('div', { class: 'ql-help' }, 'Play to a point, then use the buttons, or type times in seconds.');
      const r = await openDialog({ title: 'Trim', content: h('div', { style: 'min-width:min(80vw,640px)' }, p, info), fields: [
        { key: 'start', label: 'Start time (s)', type: 'number', value: (m.start || 0) / 1000, min: 0, step: 0.1, half: true },
        { key: 'end', label: 'End time (s, 0 = end of file)', type: 'number', value: (m.end || 0) / 1000, min: 0, step: 0.1, half: true },
      ], onOpen: (ctl) => {
        p.addEventListener('loadedmetadata', () => { dur = p.duration; info.textContent = `Length ${fmt(dur * 1000)}. Play to a point, then use the buttons, or type times in seconds.`; });
      }, buttons: [
        { label: 'Set Start Here', onClick: (_v, ctl) => ctl.set('start', +p.currentTime.toFixed(1)) },
        { label: 'Set End Here', onClick: (_v, ctl) => ctl.set('end', +p.currentTime.toFixed(1)) },
      ] });
      p.pause();
      if (!r) return;
      const s = Math.max(0, +r.start * 1000), e = Math.max(0, +r.end * 1000);
      if (e && e <= s) { toast('The end must come after the start.'); return; }
      setMedia(app, 'Trim', (x) => { x.start = s || undefined; x.end = e || undefined; });
      void dur;
    },
  },
  {
    id: 'media.posterFrame', label: 'Poster Frame', icon: 'image', tab: 'Playback', group: 'Editing', edits: true, isEnabled: (app) => one(app) && media(app)[0].mediaKind === 'video',
    tip: 'The picture shown before the video plays: a frame of the video, or a picture file',
    run: async (app) => {
      const m = media(app)[0];
      const p = player(app, m) as HTMLVideoElement;
      p.crossOrigin = 'anonymous';
      const r = await openDialog({ title: 'Poster Frame', content: h('div', { style: 'min-width:min(80vw,640px)' }, p, h('div', { class: 'ql-help' }, 'Pause on the frame you want, then choose Use Current Frame.')), ok: 'Use Current Frame', buttons: [{ label: 'Reset', onClick: (_v, ctl) => ctl.close({ reset: true }) }] });
      p.pause();
      if (!r) return;
      if (r.reset) { setMedia(app, 'Reset Poster Frame', (x) => { x.poster = undefined; }); return; }
      if (!p.videoWidth) { toast('The video frame is not available yet.'); return; }
      const c = document.createElement('canvas');
      c.width = p.videoWidth; c.height = p.videoHeight;
      c.getContext('2d')!.drawImage(p, 0, 0);
      const url = c.toDataURL('image/jpeg', 0.88);
      const id = app.deck.addMedia({ mime: 'image/jpeg', b64: url.split(',')[1], name: `${m.name || 'video'} poster` });
      setMedia(app, 'Poster Frame', (x) => { x.poster = id; });
    },
  },
  {
    id: 'media.volume', label: 'Volume', icon: 'volume_up', tab: 'Playback', group: 'Options', kind: 'menu', edits: true, isEnabled: (app) => media(app).length > 0,
    run: (app, v?: number) => { if (v != null) setMedia(app, 'Volume', (x) => { x.volume = +v === 1 ? undefined : +v; }); },
    menu: (app) => { const cur = media(app)[0]?.volume ?? 1; return [[0.25, 'Low'], [0.5, 'Medium'], [1, 'High'], [0, 'Mute']].map(([v, l]) => ({ id: 'media.volume', arg: v, label: l as string, checked: cur === v })); },
  },
  {
    id: 'media.start', label: 'Start', icon: 'play_circle', tab: 'Playback', group: 'Options', kind: 'menu', edits: true, isEnabled: (app) => media(app).length > 0,
    tip: 'Play automatically when the slide appears, or when clicked',
    run: (app, mode?: 'auto' | 'click') => { if (mode) setMedia(app, 'Start', (x) => { x.autoplay = mode === 'auto' || undefined; }); },
    menu: (app) => { const a = !!media(app)[0]?.autoplay; return [{ id: 'media.start', arg: 'auto', label: 'Automatically', checked: a }, { id: 'media.start', arg: 'click', label: 'When Clicked On', checked: !a }]; },
  },
  {
    id: 'media.loop', label: 'Loop until Stopped', icon: 'repeat', tab: 'Playback', group: 'Options', kind: 'toggle', edits: true, isEnabled: (app) => media(app).length > 0,
    isActive: (app) => !!media(app)[0]?.loop, run: (app) => { const on = !media(app)[0]?.loop; setMedia(app, 'Loop', (x) => { x.loop = on || undefined; }); },
  },
]);
