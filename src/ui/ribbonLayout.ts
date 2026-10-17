/**
 * Default tab and group arrangement. Groups reference command ids only, so users can rebuild any of it
 * with Customize Tabs. Contextual tabs appear when their object (shape, picture, table, chart, media)
 * is selected. Command ids follow docs/COMMANDS-PLAN.md.
 */
import type { App } from '../app';
import type { Element } from '../model/types';

export interface RibbonGroup { id: string; label: string; items: string[]; launcher?: string }
export interface RibbonTab { id: string; label: string; groups: RibbonGroup[]; contextual?: (app: App) => boolean; accent?: string; custom?: boolean }

const sel = (app: App): Element[] => (app.tab?.ui ? app.selected : []);
const only = (app: App, kinds: string[]) => { const s = sel(app); return s.length > 0 && s.every((e) => kinds.includes(e.kind)); };

export const DEFAULT_TABS: RibbonTab[] = [
  {
    id: 'home', label: 'Home', groups: [
      { id: 'clipboard', label: 'Clipboard', items: ['edit.paste', 'edit.cut', 'edit.copy', 'edit.duplicate', 'edit.formatPainter'], launcher: 'edit.clipboardPane' },
      { id: 'slides', label: 'Slides', items: ['slide.new', 'slide.layout', 'slide.reset', 'section.menu', 'slide.reuse'] },
      { id: 'font', label: 'Font', items: ['fmt.font', 'fmt.fontSize', 'fmt.growFont', 'fmt.shrinkFont', 'fmt.clearFormatting', 'fmt.bold', 'fmt.italic', 'fmt.underline', 'fmt.strike', 'fmt.shadow', 'fmt.charSpacing', 'fmt.changeCase', 'fmt.fontColor', 'fmt.highlight'], launcher: 'fmt.fontDialog' },
      { id: 'paragraph', label: 'Paragraph', items: ['fmt.bullets', 'fmt.numbering', 'fmt.outdent', 'fmt.indent', 'fmt.lineSpacing', 'fmt.alignLeft', 'fmt.alignCenter', 'fmt.alignRight', 'fmt.justify', 'fmt.columns', 'fmt.textDirection', 'fmt.verticalAlign', 'diagram.fromOutline'], launcher: 'fmt.paragraphDialog' },
      { id: 'drawing', label: 'Drawing', items: ['insert.shape', 'arrange.menu', 'shape.quickStyle', 'shape.fill', 'shape.outline', 'shape.effects'], launcher: 'shape.formatPane' },
      { id: 'editing', label: 'Editing', items: ['edit.find', 'edit.replace', 'edit.selectMenu', 'home.selectionPane'] },
      { id: 'designer', label: 'Designer', items: ['design.designIdeas'] },
    ],
  },
  {
    id: 'insert', label: 'Insert', groups: [
      { id: 'slides', label: 'Slides', items: ['slide.new', 'slide.reuse', 'insert.slidesFromOutline'] },
      { id: 'tables', label: 'Tables', items: ['insert.table', 'insert.drawTable'] },
      { id: 'images', label: 'Images', items: ['insert.picture', 'insert.screenshot', 'insert.photoAlbum'] },
      { id: 'illustrations', label: 'Illustrations', items: ['insert.shape', 'insert.diagram', 'insert.chart'] },
      { id: 'links', label: 'Links', items: ['insert.summaryZoom', 'insert.slideZoom', 'insert.link', 'insert.action', 'insert.actionButton'] },
      { id: 'comments', label: 'Comments', items: ['review.newComment'] },
      { id: 'text', label: 'Text', items: ['insert.textBox', 'insert.headerFooter', 'insert.decorativeText', 'insert.dateTime', 'insert.slideNumber', 'insert.codeBlock', 'insert.stickyNote'] },
      { id: 'symbols', label: 'Symbols', items: ['insert.equation', 'insert.symbol', 'insert.emoji'] },
      { id: 'media', label: 'Media', items: ['insert.video', 'insert.audio', 'insert.recordAudio'] },
    ],
  },
  {
    id: 'draw', label: 'Draw', groups: [
      { id: 'tools', label: 'Tools', items: ['draw.select', 'draw.eraser', 'draw.withTouch'] },
      { id: 'pens', label: 'Pens', items: ['draw.pen', 'draw.pencil', 'draw.highlighter', 'draw.penColor', 'draw.penWidth'] },
      { id: 'convert', label: 'Convert', items: ['ink.toShape'] },
      { id: 'ink', label: 'Ink', items: ['ink.toggleVisibility', 'ink.deleteAll', 'ink.replay'] },
      { id: 'background', label: 'Background', items: ['design.formatBackground'] },
    ],
  },
  {
    id: 'design', label: 'Design', groups: [
      { id: 'themes', label: 'Themes', items: ['design.theme', 'design.browseThemes', 'design.saveTheme'] },
      { id: 'variants', label: 'Variants', items: ['design.colors', 'design.fonts', 'design.backgroundStyles', 'design.customColors', 'design.customFonts'] },
      { id: 'customize', label: 'Customize', items: ['design.slideSize', 'design.formatBackground', 'design.backgroundApplyAll', 'design.backgroundReset'] },
      { id: 'designer', label: 'Designer', items: ['design.designIdeas', 'design.restyle', 'design.autoLayoutRules'] },
    ],
  },
  {
    id: 'transitions', label: 'Transitions', groups: [
      { id: 'preview', label: 'Preview', items: ['trans.preview'] },
      { id: 'transition', label: 'Transition to This Slide', items: ['trans.apply', 'trans.effectOptions'] },
      { id: 'timing', label: 'Timing', items: ['trans.duration', 'trans.applyAll', 'trans.advanceOnClick', 'trans.advanceAfter', 'trans.removeAll'] },
    ],
  },
  {
    id: 'animations', label: 'Animations', groups: [
      { id: 'preview', label: 'Preview', items: ['anim.preview'] },
      { id: 'animation', label: 'Animation', items: ['anim.apply', 'anim.effectOptions'], launcher: 'anim.effectDialog' },
      { id: 'advanced', label: 'Advanced Animation', items: ['anim.add', 'anim.pane', 'anim.trigger', 'anim.painter', 'anim.buildOrder'] },
      { id: 'timing', label: 'Timing', items: ['anim.startOnClick', 'anim.startWithPrevious', 'anim.startAfterPrevious', 'anim.duration', 'anim.delay', 'anim.moveEarlier', 'anim.moveLater', 'anim.remove'] },
    ],
  },
  {
    id: 'slideshow', label: 'Slide Show', groups: [
      { id: 'start', label: 'Start Slide Show', items: ['show.fromStart', 'show.fromCurrent', 'show.presenterView', 'show.rehearse', 'show.customShows'] },
      { id: 'setup', label: 'Set Up', items: ['show.setUp', 'slide.hide', 'show.rehearseTimings', 'show.useTimings', 'show.clearTimings', 'show.timedFormat'] },
      { id: 'monitors', label: 'Monitors', items: ['show.usePresenterView'] },
    ],
  },
  {
    id: 'review', label: 'Review', groups: [
      { id: 'proofing', label: 'Proofing', items: ['review.spelling', 'review.dictionaries', 'review.statistics'] },
      { id: 'accessibility', label: 'Accessibility', items: ['review.checkAccessibility', 'review.altText', 'review.readingOrder'] },
      { id: 'insights', label: 'Insights', items: ['review.designCheck', 'review.lookUp'] },
      { id: 'language', label: 'Language', items: ['review.translate', 'review.language'] },
      { id: 'comments', label: 'Comments', items: ['review.newComment', 'review.deleteComment', 'review.prevComment', 'review.nextComment', 'review.commentsPane'] },
      { id: 'compare', label: 'Compare', items: ['review.compare'] },
      { id: 'protect', label: 'Protect', items: ['file.markFinal', 'file.encrypt'] },
      { id: 'ink', label: 'Ink', items: ['ink.toggleVisibility'] },
    ],
  },
  {
    id: 'view', label: 'View', groups: [
      { id: 'views', label: 'Presentation Views', items: ['view.normal', 'view.outline', 'view.slideSorter', 'view.notesPage', 'view.reading'] },
      { id: 'masters', label: 'Master Views', items: ['view.slideMaster'] },
      { id: 'show', label: 'Show', items: ['view.gridlines', 'view.smartGuides', 'view.notes', 'view.thumbnails'], launcher: 'view.gridSettings' },
      { id: 'zoom', label: 'Zoom', items: ['view.zoom', 'view.fit', 'view.zoomIn', 'view.zoomOut'] },
      { id: 'color', label: 'Color/Grayscale', items: ['view.color', 'view.grayscale', 'view.blackWhite'] },
      { id: 'window', label: 'Window', items: ['view.newWindow', 'view.switchWindow', 'view.fullScreen'] },
      { id: 'panes', label: 'Panes', items: ['view.navigator', 'home.selectionPane', 'review.commentsPane'] },
      { id: 'macros', label: 'Macros', items: ['dev.macros'] },
    ],
  },
  {
    id: 'tools', label: 'Tools', groups: [
      { id: 'text', label: 'Text', items: ['fmt.fitTextToSlide', 'slide.splitByParagraph', 'slide.merge', 'tools.ocrCleanup', 'edit.replaceFonts'] },
      { id: 'cleanup', label: 'Clean Up', items: ['tools.offSlide', 'tools.unusedLayouts', 'tools.removeUnusedLayouts', 'tools.resetAll', 'tools.extractMedia'] },
      { id: 'reports', label: 'Reports', items: ['tools.speakingTime', 'tools.fontsUsed', 'review.statistics'] },
      { id: 'numbering', label: 'Numbering', items: ['tools.numbering'] },
    ],
  },
  {
    id: 'ai', label: 'AI', groups: [
      { id: 'setup', label: 'Setup', items: ['ai.setup', 'ai.active', 'ai.providers', 'ai.privacy', 'ai.stop'] },
      { id: 'create', label: 'Create', items: ['ai.draftDeck', 'ai.docToDeck', 'ai.outlineToSlides', 'ai.addSlide'] },
      { id: 'write', label: 'Write', items: ['ai.rewrite', 'ai.shorten', 'ai.expand', 'ai.tone', 'ai.assertionHeadline', 'ai.proofread', 'ai.translate'] },
      { id: 'notes', label: 'Notes', items: ['ai.writeNotes', 'ai.notesToSlide', 'ai.slideToNotes', 'ai.summarize', 'ai.anticipateQuestions'] },
      { id: 'more', label: 'More', items: ['ai.altText', 'ai.suggestChart', 'ai.quizFromDeck', 'ai.assistant', 'ai.prompts'] },
      { id: 'several', label: 'Several AIs', items: ['ai.ensembleMode', 'ai.ensembleMembers', 'ai.showDeliberation'] },
    ],
  },
  {
    id: 'developer', label: 'Developer', groups: [
      { id: 'code', label: 'Code', items: ['dev.macros', 'dev.recordMacro', 'dev.macroEditor', 'dev.macroSecurity', 'dev.viewVba'] },
      { id: 'data', label: 'Data', items: ['dev.tags', 'dev.exportJson', 'dev.importJson'] },
    ],
  },
  {
    id: 'help', label: 'Help', groups: [
      { id: 'help', label: 'Help', items: ['help.help', 'help.shortcuts', 'help.commandReference', 'help.tour', 'help.whatsNew', 'help.feedback', 'help.notices', 'help.about'] },
    ],
  },
  // Master view
  {
    id: 'slideMaster', label: 'Slide Master', contextual: (app) => app.tab?.view === 'master', accent: '#8F3618', groups: [
      { id: 'edit', label: 'Edit Master', items: ['master.insertMaster', 'master.insertLayout', 'master.delete', 'master.rename', 'master.preserve'] },
      { id: 'layout', label: 'Master Layout', items: ['master.insertPlaceholder', 'master.showTitle', 'master.showFooters'] },
      { id: 'theme', label: 'Edit Theme', items: ['design.theme', 'design.colors', 'design.fonts'] },
      { id: 'background', label: 'Background', items: ['design.backgroundStyles', 'master.hideBackgroundGraphics'] },
      { id: 'size', label: 'Size', items: ['design.slideSize'] },
      { id: 'close', label: 'Close', items: ['master.close'] },
    ],
  },
  // Contextual tabs
  {
    id: 'shapeFormat', label: 'Shape Format', contextual: (app) => only(app, ['shape', 'group']), accent: '#C2502A', groups: [
      { id: 'insert', label: 'Insert Shapes', items: ['insert.shape', 'shape.change', 'insert.textBox'] },
      { id: 'styles', label: 'Shape Styles', items: ['shape.quickStyle', 'shape.fill', 'shape.outline', 'shape.effects'], launcher: 'shape.formatPane' },
      { id: 'text', label: 'Decorative Text Styles', items: ['shape.textFill', 'shape.autofit', 'shape.wrapText', 'shape.textMargins'] },
      { id: 'accessibility', label: 'Accessibility', items: ['review.altText', 'shape.decorative'] },
      { id: 'arrange', label: 'Arrange', items: ['arrange.bringForward', 'arrange.sendBackward', 'home.selectionPane', 'arrange.align', 'arrange.group', 'arrange.rotate'] },
      { id: 'size', label: 'Size', items: ['shape.height', 'shape.width', 'shape.sizeDialog'] },
    ],
  },
  {
    id: 'pictureFormat', label: 'Picture Format', contextual: (app) => only(app, ['picture']), accent: '#C2502A', groups: [
      { id: 'adjust', label: 'Adjust', items: ['picture.removeColor', 'picture.corrections', 'picture.color', 'picture.transparency', 'picture.compress', 'picture.change', 'picture.reset'] },
      { id: 'styles', label: 'Picture Styles', items: ['picture.style', 'picture.border', 'picture.effects'] },
      { id: 'accessibility', label: 'Accessibility', items: ['review.altText', 'shape.decorative'] },
      { id: 'arrange', label: 'Arrange', items: ['arrange.bringForward', 'arrange.sendBackward', 'arrange.align', 'arrange.rotate'] },
      { id: 'size', label: 'Size', items: ['picture.crop', 'picture.cropToShape', 'picture.cropAspect', 'shape.height', 'shape.width'] },
    ],
  },
  {
    id: 'tableDesign', label: 'Table Design', contextual: (app) => only(app, ['table']), accent: '#2F6F8F', groups: [
      { id: 'options', label: 'Table Style Options', items: ['table.headerRow', 'table.totalRow', 'table.bandedRows', 'table.firstColumn', 'table.lastColumn', 'table.bandedColumns'] },
      { id: 'styles', label: 'Table Styles', items: ['table.style', 'table.shading', 'table.borders', 'table.clearStyle'] },
    ],
  },
  {
    id: 'tableLayout', label: 'Table Layout', contextual: (app) => only(app, ['table']), accent: '#2F6F8F', groups: [
      { id: 'rows', label: 'Rows & Columns', items: ['table.deleteMenu', 'table.insertAbove', 'table.insertBelow', 'table.insertLeft', 'table.insertRight'] },
      { id: 'merge', label: 'Merge', items: ['table.merge', 'table.split'] },
      { id: 'size', label: 'Cell Size', items: ['table.distributeRows', 'table.distributeColumns'] },
      { id: 'edit', label: 'Data', items: ['table.editCells', 'table.sort', 'table.toText'] },
      { id: 'align', label: 'Alignment', items: ['fmt.alignLeft', 'fmt.alignCenter', 'fmt.alignRight', 'table.align'] },
    ],
  },
  {
    id: 'chartDesign', label: 'Chart Design', contextual: (app) => only(app, ['chart']), accent: '#6B4E9B', groups: [
      { id: 'layouts', label: 'Chart Layouts', items: ['chart.addElement', 'chart.quickLayout'] },
      { id: 'styles', label: 'Chart Styles', items: ['chart.colors', 'chart.style'] },
      { id: 'data', label: 'Data', items: ['chart.switchRowCol', 'chart.editData'] },
      { id: 'type', label: 'Type', items: ['chart.changeType'] },
    ],
  },
  {
    id: 'mediaPlayback', label: 'Playback', contextual: (app) => only(app, ['media']), accent: '#3F8F7A', groups: [
      { id: 'preview', label: 'Preview', items: ['media.play'] },
      { id: 'editing', label: 'Editing', items: ['media.trim', 'media.posterFrame'] },
      { id: 'options', label: 'Options', items: ['media.volume', 'media.start', 'media.loop'] },
    ],
  },
];

export const BACKSTAGE_ITEMS = ['file.new', 'file.open', 'file.save', 'file.saveAs', 'file.print', 'file.share', 'file.export.pdf', 'file.properties', 'file.versions', 'file.close', 'file.options'];

export function tabsFor(app: App): RibbonTab[] {
  const p = app.prefs;
  const order = p.tabOrder.length ? p.tabOrder : [];
  const builtIn = DEFAULT_TABS.filter((t) => !p.hiddenTabs.includes(t.id));
  const custom: RibbonTab[] = p.customTabs.filter((t) => !t.hidden).map((t) => ({ id: t.id, label: t.label, groups: t.groups, custom: true }));
  const all = [...builtIn, ...custom];
  if (!order.length) return all;
  return [...all].sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
}

export function idsInTabs(): Set<string> {
  const s = new Set<string>();
  for (const t of DEFAULT_TABS) for (const g of t.groups) for (const id of g.items) s.add(id);
  return s;
}
