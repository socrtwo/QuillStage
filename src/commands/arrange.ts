/** Arrange commands shared by Home ▸ Drawing and every Format tab: order, group, align, distribute, rotate, lock. */
import { def } from './registry';
import type { App } from '../app';
import { zOrder, group, ungroup, align, rotateSelection, nudge, selection, edit, setBox, boxOf, type AlignHow } from '../edit/ops';
import { openDialog, toast } from '../ui/dialog';

const has = (n = 1) => (app: App) => !!app.tab?.ui && app.selected.length >= n;
let toSlide = false;
let lastGroup: string[] | null = null;

function alignCmd(id: string, how: AlignHow, label: string, icon: string) {
  return { id, label, icon, tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(1), run: (app: App) => align(app, how, toSlide) };
}

def([
  { id: 'arrange.bringToFront', label: 'Bring to Front', icon: 'flip_to_front', tab: 'Home', group: 'Arrange', keys: ['Mod-Shift-]'], edits: true, isEnabled: has(1), run: (app) => zOrder(app, 'front') },
  { id: 'arrange.bringForward', label: 'Bring Forward', icon: 'move_up', tab: 'Home', group: 'Arrange', keys: ['Mod-]'], edits: true, isEnabled: has(1), run: (app) => zOrder(app, 'forward') },
  { id: 'arrange.sendToBack', label: 'Send to Back', icon: 'flip_to_back', tab: 'Home', group: 'Arrange', keys: ['Mod-Shift-['], edits: true, isEnabled: has(1), run: (app) => zOrder(app, 'back') },
  { id: 'arrange.sendBackward', label: 'Send Backward', icon: 'move_down', tab: 'Home', group: 'Arrange', keys: ['Mod-['], edits: true, isEnabled: has(1), run: (app) => zOrder(app, 'backward') },
  {
    id: 'arrange.group', label: 'Group', icon: 'join', tab: 'Home', group: 'Arrange', keys: ['Mod-g'], edits: true, isEnabled: has(2), kind: 'split',
    menu: () => [{ id: 'arrange.group', label: 'Group' }, { id: 'arrange.ungroup', label: 'Ungroup' }, { id: 'arrange.regroup', label: 'Regroup' }],
    run: (app) => group(app),
  },
  {
    id: 'arrange.ungroup', label: 'Ungroup', icon: 'call_split', tab: 'Home', group: 'Arrange', keys: ['Mod-Shift-g'], edits: true, isEnabled: (app) => app.selected?.some((e) => e.kind === 'group'),
    run: (app) => { const ids = app.selected.filter((e) => e.kind === 'group').flatMap((g: any) => g.children.map((c: any) => c.id)); ungroup(app); lastGroup = ids; },
  },
  {
    id: 'arrange.regroup', label: 'Regroup', icon: 'join_inner', tab: 'Home', group: 'Arrange', edits: true,
    tip: 'Group again the objects of the group you last ungrouped',
    isEnabled: () => !!lastGroup?.length,
    run: (app) => { const ids = (lastGroup || []).filter((id) => app.owner?.elements.some((e) => e.id === id)); if (ids.length < 2) { toast('Nothing to regroup.'); return; } app.tab.ui.select(ids); group(app); lastGroup = null; },
  },
  alignCmd('arrange.alignLeft', 'left', 'Align Left', 'align_horizontal_left'),
  alignCmd('arrange.alignCenter', 'center', 'Align Center', 'align_horizontal_center'),
  alignCmd('arrange.alignRight', 'right', 'Align Right', 'align_horizontal_right'),
  alignCmd('arrange.alignTop', 'top', 'Align Top', 'align_vertical_top'),
  alignCmd('arrange.alignMiddle', 'middle', 'Align Middle', 'align_vertical_center'),
  alignCmd('arrange.alignBottom', 'bottom', 'Align Bottom', 'align_vertical_bottom'),
  alignCmd('arrange.distributeH', 'distH', 'Distribute Horizontally', 'horizontal_distribute'),
  alignCmd('arrange.distributeV', 'distV', 'Distribute Vertically', 'vertical_distribute'),
  { id: 'arrange.alignToSlide', label: 'Align to Slide', icon: 'crop_landscape', tab: 'Home', group: 'Arrange', kind: 'toggle', noRecord: true, isActive: () => toSlide, run: () => { toSlide = true; } },
  { id: 'arrange.alignToSelection', label: 'Align Selected Objects', icon: 'select_all', tab: 'Home', group: 'Arrange', kind: 'toggle', noRecord: true, isActive: () => !toSlide, run: () => { toSlide = false; } },
  {
    id: 'arrange.align', label: 'Align', icon: 'align_horizontal_left', tab: 'Home', group: 'Arrange', kind: 'menu', isEnabled: has(1),
    menu: () => [
      { id: 'arrange.alignLeft', label: 'Align Left', icon: 'align_horizontal_left' }, { id: 'arrange.alignCenter', label: 'Align Center', icon: 'align_horizontal_center' }, { id: 'arrange.alignRight', label: 'Align Right', icon: 'align_horizontal_right' },
      { separator: true },
      { id: 'arrange.alignTop', label: 'Align Top', icon: 'align_vertical_top' }, { id: 'arrange.alignMiddle', label: 'Align Middle', icon: 'align_vertical_center' }, { id: 'arrange.alignBottom', label: 'Align Bottom', icon: 'align_vertical_bottom' },
      { separator: true },
      { id: 'arrange.distributeH', label: 'Distribute Horizontally', icon: 'horizontal_distribute' }, { id: 'arrange.distributeV', label: 'Distribute Vertically', icon: 'vertical_distribute' },
      { separator: true },
      { id: 'arrange.alignToSlide', label: 'Align to Slide', checked: toSlide }, { id: 'arrange.alignToSelection', label: 'Align Selected Objects', checked: !toSlide },
    ],
    run: (app) => align(app, 'left', toSlide),
  },
  { id: 'arrange.rotateRight', label: 'Rotate Right 90°', icon: 'rotate_right', tab: 'Home', group: 'Arrange', keys: ['Alt-ArrowRight'], edits: true, isEnabled: has(1), run: (app) => rotateSelection(app, 90) },
  { id: 'arrange.rotateLeft', label: 'Rotate Left 90°', icon: 'rotate_left', tab: 'Home', group: 'Arrange', keys: ['Alt-ArrowLeft'], edits: true, isEnabled: has(1), run: (app) => rotateSelection(app, -90) },
  { id: 'arrange.flipV', label: 'Flip Vertical', icon: 'flip', tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(1), run: (app) => rotateSelection(app, 'flipV') },
  { id: 'arrange.flipH', label: 'Flip Horizontal', icon: 'flip', tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(1), run: (app) => rotateSelection(app, 'flipH') },
  {
    id: 'arrange.rotateDialog', label: 'More Rotation Options…', icon: 'rotate_90_degrees_cw', tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(1),
    run: async (app) => {
      const e = selection(app)[0];
      const r = await openDialog({ title: 'Rotation', fields: [{ key: 'rot', label: 'Rotation (degrees)', type: 'number', min: -360, max: 360, step: 1, value: boxOf(app, e).rot || 0 }] });
      if (!r) return;
      edit(app, 'Rotate', () => { for (const x of selection(app)) setBox(app, x, { rot: +r.rot || 0 }); });
    },
  },
  {
    id: 'arrange.rotate', label: 'Rotate', icon: 'rotate_right', tab: 'Home', group: 'Arrange', kind: 'menu', isEnabled: has(1),
    menu: () => [{ id: 'arrange.rotateRight', label: 'Rotate Right 90°' }, { id: 'arrange.rotateLeft', label: 'Rotate Left 90°' }, { id: 'arrange.flipV', label: 'Flip Vertical' }, { id: 'arrange.flipH', label: 'Flip Horizontal' }, { separator: true }, { id: 'arrange.rotateDialog', label: 'More Rotation Options…' }],
    run: (app) => rotateSelection(app, 90),
  },
  { id: 'arrange.lock', label: 'Lock Position', icon: 'lock', tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(1), tip: 'Keep the selected objects from being moved or resized', run: (app) => edit(app, 'Lock', () => { for (const e of selection(app)) e.locked = true; }) },
  { id: 'arrange.unlock', label: 'Unlock Position', icon: 'lock_open', tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(1), run: (app) => edit(app, 'Unlock', () => { for (const e of selection(app)) delete e.locked; }) },
  {
    id: 'arrange.nudge', label: 'Nudge', icon: 'open_with', tab: 'Home', group: 'Arrange', kind: 'menu', edits: true, isEnabled: has(1),
    menu: () => [{ id: 'arrange.nudge', arg: 'left', label: 'Left' }, { id: 'arrange.nudge', arg: 'right', label: 'Right' }, { id: 'arrange.nudge', arg: 'up', label: 'Up' }, { id: 'arrange.nudge', arg: 'down', label: 'Down' }],
    run: (app, dir?: string) => { const s = app.prefs.gridSize; const d: Record<string, [number, number]> = { left: [-s, 0], right: [s, 0], up: [0, -s], down: [0, s] }; const v = d[dir || 'right']; if (v) nudge(app, v[0], v[1]); },
  },
  {
    id: 'arrange.matchSize', label: 'Match Size', icon: 'aspect_ratio', tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(2),
    tip: 'Make the selected objects the size of the first one selected',
    run: (app) => { const [first, ...rest] = selection(app); const b = boxOf(app, first); edit(app, 'Match Size', () => { for (const e of rest) setBox(app, e, { w: b.w, h: b.h }); }); },
  },
  {
    id: 'arrange.pastePosition', label: 'Match Position', icon: 'pin_drop', tab: 'Home', group: 'Arrange', edits: true, isEnabled: has(1),
    tip: 'Move the selection to the position of the object on the clipboard (same place on another slide)',
    run: (app) => { const c = app.clip; if (c?.kind !== 'elements' || !c.data.length) { toast('Copy an object first; its position is used.'); return; } const src = c.data[0]; edit(app, 'Match Position', () => { for (const e of selection(app)) setBox(app, e, { x: src.x, y: src.y }); }); },
  },
  {
    id: 'arrange.menu', label: 'Arrange', icon: 'layers', tab: 'Home', group: 'Drawing', kind: 'menu', isEnabled: has(1),
    menu: () => [
      { heading: 'Order Objects' }, { id: 'arrange.bringToFront', label: 'Bring to Front', icon: 'flip_to_front' }, { id: 'arrange.sendToBack', label: 'Send to Back', icon: 'flip_to_back' }, { id: 'arrange.bringForward', label: 'Bring Forward', icon: 'move_up' }, { id: 'arrange.sendBackward', label: 'Send Backward', icon: 'move_down' },
      { heading: 'Group Objects' }, { id: 'arrange.group', label: 'Group', icon: 'join' }, { id: 'arrange.ungroup', label: 'Ungroup', icon: 'call_split' }, { id: 'arrange.regroup', label: 'Regroup', icon: 'join_inner' },
      { heading: 'Position Objects' }, { label: 'Align', icon: 'align_horizontal_left', submenu: [{ id: 'arrange.alignLeft', label: 'Align Left' }, { id: 'arrange.alignCenter', label: 'Align Center' }, { id: 'arrange.alignRight', label: 'Align Right' }, { id: 'arrange.alignTop', label: 'Align Top' }, { id: 'arrange.alignMiddle', label: 'Align Middle' }, { id: 'arrange.alignBottom', label: 'Align Bottom' }, { separator: true }, { id: 'arrange.distributeH', label: 'Distribute Horizontally' }, { id: 'arrange.distributeV', label: 'Distribute Vertically' }] },
      { label: 'Rotate', icon: 'rotate_right', submenu: [{ id: 'arrange.rotateRight', label: 'Rotate Right 90°' }, { id: 'arrange.rotateLeft', label: 'Rotate Left 90°' }, { id: 'arrange.flipV', label: 'Flip Vertical' }, { id: 'arrange.flipH', label: 'Flip Horizontal' }] },
      { separator: true }, { id: 'home.selectionPane', label: 'Selection Pane…', icon: 'layers' },
    ],
    run: (app) => zOrder(app, 'front'),
  },
]);
