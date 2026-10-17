# File formats

QuillStage recognizes files by their **content, not their extension** (`sniffFormat` in
`src/io/index.ts`): a misnamed file opens with the right reader, and the person is told that the
name and the content disagree. Damaged files go through the recovery pipeline automatically
([RECOVERY.md](RECOVERY.md)).

This file describes what is implemented now. The longer list of historical formats QuillStage
intends to read is in [FORMATS-PLAN.md](FORMATS-PLAN.md).

## Summary

| Format | Extensions | Open | Save | Code |
|---|---|---|---|---|
| PowerPoint presentation, show, template | .pptx .ppsx .potx | Yes | Yes | `src/io/pptx/` |
| PowerPoint macro-enabled | .pptm (.ppsm .potm open) | Yes | Yes (VBA kept byte for byte, never run) | `src/io/pptx/` |
| PowerPoint 97–2003 | .ppt .pps .pot | Yes | No (save as .pptx) | `src/io/ppt.ts`, `src/io/cfb.ts` |
| OpenDocument presentation and template | .odp .otp | Yes | Yes | `src/io/odp.ts` |
| Flat OpenDocument presentation | .fodp | Yes | Yes | `src/io/odp.ts` |
| Markdown slides (Marp, reveal.js, Slidev, remark, Deckset conventions) | .md | Yes | Yes | `src/io/markdown.ts` |
| Plain-text outline | .txt | Yes | Yes | `src/io/outline.ts` |
| Word document as an outline | .docx | Yes | No | `src/io/outline.ts` |
| RTF outline | .rtf | Yes | Yes | `src/io/outline.ts` |
| QuillStage presentation | .qsp | Yes | Yes | `src/io/qsp.ts` |
| Encrypted QuillStage presentation (AES-256-GCM) | .qspe | Yes | Yes | `src/io/qsp.ts` |
| QuillStage JSON | .json | Yes | Yes | `src/io/qsp.ts` |

## PowerPoint (.pptx family)

Read and written from ECMA-376 with JSZip and the browser's XML parser. Elements are matched by
local name, so Strict and Transitional files read the same way.

**Kept on open and save:** slide size and first slide number; themes (color scheme, major/minor
fonts; the theme's format scheme is carried through); masters with their title, body and other
text styles per level, color map, background and graphics; layouts with type, placeholders, list
styles, background and "hide master graphics"; slides with placeholders and inheritance, shapes
(every preset geometry with its adjustments, custom geometry), solid, gradient, picture and
pattern fills, outlines with dashes and arrowheads, shadow, glow, soft edge and reflection
effects; rich text (bold, italic, underline, strike, size, font, color, highlight,
superscript/subscript, caps, spacing, hyperlinks, line breaks, slide-number and date fields),
paragraph alignment, indents, line and paragraph spacing, bullets (character, auto-number, none),
body properties (anchor, insets, wrap, vertical text, columns, shrink-on-overflow and resize-shape
autofit); pictures with crop and shape (grayscale and transparency are also written); tables (column widths, row heights, merged
cells, cell fills, borders, insets, anchors, style flags); charts (column, bar, line, area, pie,
doughnut, scatter, radar, with categories, series, title, legend, stacking and data labels);
groups (nested, child coordinates resolved); connectors (read with their glue; written as lines, without glue); video and audio with poster frames;
SmartArt diagrams through their saved drawing; speaker notes; transitions (the common effects,
speed, advance on click or after a time; Morph is written with a Fade fallback); animations
(entrance, emphasis, exit and motion-path effects with click/with/after triggers, delays,
durations, directions and paragraph-by-paragraph builds); hidden slides; sections; custom shows;
loop and kiosk show settings; document properties; the VBA project of .pptm.

**Limits:**
- Charts are written with literal data caches and no embedded workbook, so PowerPoint shows and
  formats them but asks for the data before editing it. The chart part read from a file is kept
  in the model (`rawXml`) but is regenerated on save.
- Animation import maps the common preset effects to QuillStage's effect list; rarer presets fall
  back to the nearest effect (usually Fade). Interactive trigger sequences are read; on save they
  are written into the main sequence.
- The newer 3-D transitions (Vortex, Ripple, Prism…) are read as the closest 2-D effect.
- Embedded OLE objects are read as their preview picture; ink, 3-D models and comments are not
  read yet.
- Theme fill, line and effect style matrices are kept as written; shapes that refer to them by
  index get the reference color.
- SVG pictures are written as SVG parts without a PNG fallback; older PowerPoint versions show
  a placeholder for them.

## PowerPoint 97–2003 (.ppt)

Import only, from the published [MS-PPT] and [MS-ODRAW] specifications: the compound file is
read with a bounds-checked, cycle-guarded reader; slides come from the persist directory and the
slide list in document order. For each slide QuillStage reads the text boxes (title, centered
title, subtitle, body and other text) with their positions, paragraph levels and bullets, the
pictures (from the blip store or the `Pictures` stream: PNG, JPEG, DIB, TIFF, EMF, WMF, PICT),
and the speaker notes. Pictures that cannot be placed on a slide are put on a "Recovered
pictures" slide and the open report says so.

**Not read:** fonts, colors and character formatting, shapes without text, tables as tables
(their cells become positioned text boxes), charts (their picture is kept), transitions and
animations. EMF/WMF pictures are kept and saved back to .pptx, but browsers cannot draw them.

## OpenDocument (.odp, .otp, .fodp)

Read and written from ISO/IEC 26300 (ODF 1.3). Master pages become masters (title and outline
styles per level, background, master graphics) with a "Title, Content" and a "Blank" layout;
pages become slides. Supported on both open and save: frames with text (title, subtitle, outline,
notes and footer classes, plain text boxes), custom shapes (mapped to and from the preset shapes
by name, including LibreOffice's `ooxml-*` shapes; others as paths), rectangles, ellipses, lines,
connectors, polygons and paths, pictures (with crop), tables (spans, covered cells, fills, column
widths, row heights), video and audio, groups, rotation, fills, strokes, arrowheads, text
properties, paragraph properties, nested lists with bullet or number styles, speaker notes, page
backgrounds, transitions (SMIL type, subtype, direction, speed and automatic advance), hidden
pages and document metadata. Flat .fodp files carry pictures inline (base64).

**Limits:** charts are saved as SVG pictures (they open in every ODF program but are no longer
editable charts); animations are not read or written yet; gradients are reduced to their first
color on save; bitmap fills are read but saved as solid fills.

## Markdown

`---` separates slides; YAML-style front matter sets `size` (16:9 or 4:3), `theme` (one of
QuillStage's themes by name), `title` and `author`. The first heading is the slide title (a level-1
heading alone makes a title or section slide); `-`, `*`, `+` and numbered lists become bullets,
nested by indentation; `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` and links are kept;
images become pictures (data: URLs are embedded; other URLs become a labeled placeholder, since
QuillStage does not fetch them); fenced code becomes a monospace text box; `Note:`, `???` and
HTML comments are speaker notes; `<!-- section: Name -->` starts a section. Export writes the
same conventions (Marp-compatible front matter), embeds pictures as data: URLs, and writes tables
as Markdown tables.

## Outlines

- **Text:** lines without indentation are slide titles; indented lines (tabs or spaces) are bullets
  by depth. A text without indentation is split into slides at blank lines (**Text to Deck**), or
  one slide per line.
- **Word (.docx):** each Heading 1 (or Title) starts a slide; Heading 2–9 and list paragraphs become
  bullets by level; other paragraphs become first-level bullets.
- **RTF:** `\outlinelevelN` paragraphs (as Word writes outlines) or indented lines.
- **Export:** text (tab-indented), RTF (with outline levels, opens as an outline in word processors)
  and Markdown.

## Native formats

- **.qsp:** a ZIP package with a stored `mimetype` (`application/x-quillstage`), `deck.json` (the
  model) and `media/<id>` entries. Lossless.
- **.qspe:** the same model encrypted with AES-256-GCM under a PBKDF2-SHA256 key (310,000
  iterations, random salt and IV), as in QuillPen and QuillGrid. The password is never stored.
- **.json:** the model with media inline (base64), for scripts and diffs.

## Tests

`tests/unit/io.test.ts` builds a deck exercising every element kind in code, saves it in every
writable format and reads it back; checks that every XML part of the .pptx and .odp packages is
well-formed, that `[Content_Types].xml` covers every part and that every relationship target
exists; and reads files written by LibreOffice (`tests/fixtures/deck.*` and `tests/fixtures/lo-rich.*`,
the latter LibreOffice's own .pptx, .odp and .ppt conversions of a QuillStage deck). During
development the exported .pptx, .odp and .fodp were also opened and converted by LibreOffice
headless to confirm they load.
