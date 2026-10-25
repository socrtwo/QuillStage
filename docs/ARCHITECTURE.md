# Architecture

Anne's Stage is a TypeScript web application built with **Vite** and tested with **vitest**. The Android and iOS releases package it with **Capacitor 8**, the Windows, macOS and Linux releases with **Electron**, and the same build runs in a browser as an installable, offline-capable **PWA**. It shares its application shell with Anne's Pen and Anne's Grid: command registry, Quick Access Bar, customizable tabs and keyboard, dialogs, command search, macro recorder, AI setup and providers, spelling and dictionary downloads, the recovery engine's generic parts, and the platform layer. [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) is the plan this follows; this file describes the code as it is.

## Source layout

```
src/
  main.ts                 entry: fonts, command registry, App + Shell, launch files, back button, ?audience follower
  app.ts                  App (presentation tabs, exec(), macro recording, autosave) and DeckTab (deck + view state)
  prefs.ts                per-device preferences: QAT (QAT_STANDARD, QAT_EXTRAS, addAllQatChoices), custom tabs,
                          keymap, macros, AutoCorrect, grid/guides, slide show options
  templates/              original themes (decorated masters) and content starters
  model/
    types.ts              Deck data: masters, layouts, slides, placeholders, shapes, pictures, tables, charts,
                          media, groups, text (paragraphs/runs/levels), transitions, animations, comments, ink
    deck.ts               Deck with transactions and before-image undo/redo; default master and 11 layouts
    theme.ts              theme presets, scheme colors, color map, tints/shades, contrast
    inherit.ts            slide → layout placeholder → master placeholder → master text styles → theme
    geometry.ts           preset shapes (OOXML preset names, original drawings) and custom paths
  render/
    slide.ts              the one slide renderer: SVG for edit view, thumbnails, show, presenter, print, export
    text.ts               Anne's Stage's own line breaking, bullets and numbering, autofit (shrink on overflow)
    chart.ts              column, bar, line, area, pie, doughnut, scatter, radar
    animate.ts            build steps from the animation list; Web Animations playback
    transitions.ts        2-D and 3-D transitions, Smooth Morph (object matching and tweening)
  edit/
    workspace.ts          views: Normal (rail, canvas, notes), Outline, Slide Sorter, Notes Page, Reading, Master
    canvas.ts             selection, move/resize/rotate, smart guides, snapping, marquee, insert tools, ink, pinch zoom
    textEdit.ts           in-place text editing (contenteditable island bound to the model)
    ops.ts                editing operations shared by commands and the canvas
  show/
    player.ts             slide show: builds, transitions, timings, hidden slides, custom shows, links, media,
                          pen/highlighter/laser/eraser, black/white screens, grid, zoom, rehearse timings
    presenter.ts          presenter view with an audience window (BroadcastChannel; Electron places it on
                          the second display), rehearse mode on one screen
  export/
    images.ts             PNG/JPEG (fonts embedded for rasterizing) and SVG per slide
    pdf.ts                PDF writer: slides (optionally per build step), handouts, notes pages, outline
    print.ts              print preview and printing through the system print service
    html.ts               self-contained HTML show; responsive "story" page
  commands/
    registry.ts           Command interface and registry: the single source for QAT, tabs, keys, macros, search
    *.ts                  command modules by area (file, edit, fmt, slide, insert, draw, design, trans, anim,
                          show, review, view, master, arrange, shape, picture, table, chart, media, tools, ai, dev, help)
  io/
    index.ts              format table, content sniffing, importDeck()/exportDeck()
    pptx/                 PresentationML import and export (.pptx, .pptm, .ppsx, .potx)
    odp.ts                OpenDocument presentation (.odp, .otp, .fodp)
    ppt.ts, cfb.ts        PowerPoint 97–2003 binary import (text and pictures)
    markdown.ts           Markdown slides
    outline.ts            text, RTF and .docx outlines; outline export
    qsp.ts                native .qsp (ZIP + JSON) and AES-256-GCM encrypted .qspe
    recover/              recovery pipeline (identification, ZIP salvage, ImmortalInflate, XML repair, rebuild)
  proof/                  spelling worker (nspell / Hunspell) and dictionary downloads — shared with the suite
  ai/                     providers, client, settings, on-device model, ensembles — shared; slides.ts has the prompts
  ui/                     shell, ribbon layout, dialogs, panes, backstage, customize dialogs, wizards, color picker
  platform/native.ts      Capacitor plugin and Electron bridge, with browser fallbacks
android/ ios/ electron/   native packaging
tests/unit/               vitest: model, rendering, formats, recovery, commands, show, export, catalog
tests/e2e/                browser smoke test (Playwright)
```

## Key decisions

- **Commands are data.** The ribbon, Quick Access Bar, context menus, keyboard shortcuts, macros and command search all refer to command ids. `npm run catalog` writes [COMMANDS.md](COMMANDS.md), including the planned ids that are not implemented yet; a unit test fails when a tab refers to an unknown id, a command lacks a label or icon, or COMMANDS.md is out of date. A command is registered only when it works.
- **The model follows PresentationML.** Masters, layouts, placeholders with inheritance, theme-relative colors (`'accent1'`, `{ s: 'accent1', lum: 0.4 }`), per-level text styles, and a timing list per slide. Units are points; OOXML EMU and ODF lengths are converted at the file boundary.
- **Transactions record before-images.** Every change runs inside `Deck.transact()`. Edits within slides record those slides; anything else records the document. Undo swaps images, so no command needs inverse logic.
- **One renderer.** `render/slide.ts` produces SVG markup for every surface. Text is laid out by Anne's Stage (`render/text.ts`), so line breaks match between the editor, the show and exports. Editing text uses a contenteditable island over the shape; it is read back into paragraphs and runs on every formatting change and when editing ends.
- **Fonts.** Decks naming common proprietary fonts render with metric-compatible open fonts (Carlito, Caladea, Tinos, Arimo, Cousine, Gelasio, EB Garamond); installed originals are preferred.

## Known limits

- Text in the editing island is laid out by the browser while you type and by Anne's Stage once you finish; the two can break a line differently at the margin.
- Video and animated GIF export, phone remote, live audience polls, recording and 3D models are not implemented yet (see [ROADMAP.md](ROADMAP.md) and the missing list in [COMMANDS.md](COMMANDS.md)).
