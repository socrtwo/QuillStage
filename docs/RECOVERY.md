# Recovering damaged presentations

Anne's Stage inherits the suite's recovery engine, which descends from the author's tools: byte-level
ZIP salvage and the ImmortalInflate decoder of
[Immortal Unzipper / Immortal Zip](https://socrtwo.github.io/Immortal-Zip/), XML healing and strings
scans from [Word Recovery](https://github.com/socrtwo/wordrecovery-SF), and the S2 File Identifier.

## When it runs

- **Automatically**, when a file fails to open normally or opens with damaged parts (a slide,
  master or layout that cannot be parsed, a CRC mismatch). `importDeck` then returns the best
  recovered deck together with the report.
- **On purpose**, from *File ▸ Open ▸ Open and Repair* (`importDeck(…, { repair: true })`), which
  runs every method even on a file that opens.
- From *Recover a file…* in the Manual Recovery Options dialog (`src/ui/recovery.ts`), which accepts
  any file.

The report (`RecoveryReport`, shown by `showRecoveryReport`) lists each method, what it found,
and whether some content comes from a damaged area and should be checked. The app opens the
recovered deck as "*name* (Recovered)", unsaved, so the damaged original is not overwritten. For
ZIP-based files the report also offers the **repaired package** itself (a clean .pptx or .odp).

## Methods

Implemented in `src/io/recover/index.ts`. Methods run in order; the candidate deck with the most
recovered content (slides, objects, pictures, words, weighted by how trustworthy the method is)
wins.

| Step | Method | What it does |
|---|---|---|
| a | File identification | Identifies the bytes (pptx, pptm, odp, fodp, ppt, qsp, encrypted Office package, or something else), finds concatenated or embedded data and repairs the presentation piece; tells the person when the extension is wrong. Encrypted packages are reported, not attacked. |
| b | Normal open | The regular importer in lenient mode; a slide or shape that cannot be read is skipped with a warning. |
| c | ZIP salvage | Reads every entry from its local header (so a missing or damaged central directory does not matter), inflates damaged data with ImmortalInflate (keeping everything before the damage) and checks CRC-32 values. |
| d | XML repair and rebuild | Heals each XML part; cuts a damaged slide at the last complete shape (`</p:sp>`, `</p:pic>`, `</p:graphicFrame>`, `</p:grpSp>`, `</p:cxnSp>`) and closes what is open; rebuilds a slide whose shapes are all lost from its text, in place; drops unusable masters and layouts (defaults replace them); removes relationships whose targets are gone; rebuilds `presentation.xml` and its relationships from the slide parts found; regenerates `[Content_Types].xml` and `_rels/.rels`. The rebuilt package is offered for saving. |
| e | Slide-by-slide salvage | Each slide is read on its own, so one broken slide never costs the others. |
| f | Media harvest | Pictures, video and audio that survive in `ppt/media/` but are not on any recovered slide go on "Recovered media" slides; when the ZIP structure is lost, a signature scan of the raw bytes recovers PNG, JPEG and GIF pictures. |
| g | Slide text scan | `<a:t>` runs of slide fragments, grouped by shape with the title first, rebuilt as title-and-content slides. |
| h | PowerPoint 97–2003 record salvage | The lenient .ppt reader; when the compound file is unreadable, a scan of the PowerPoint Document stream (or of the raw bytes) for text records, grouped into slides at slide boundaries. |
| i | OpenDocument salvage | Heals `content.xml`, cuts it at the last complete `</draw:page>`, repairs or drops `styles.xml`, re-reads the package; otherwise scans pages for text. |
| j | Strings scan | Last resort: readable ASCII and UTF-16 text runs, eight lines per slide, labeled as text-only recovery. |

## Tests

`tests/unit/recover.test.ts` builds valid decks in code, damages them (malformed slide XML,
truncation, a removed central directory, a missing `presentation.xml`, dangling relationships,
slides with no surviving shapes, a truncated `content.xml`, a .ppt with its header wiped, junk
with embedded text, concatenated data, an empty file) and checks what is recovered and that the
repaired package opens normally.

## Manual recovery

The Manual Recovery Options dialog has per-platform guidance (AutoRecover folders, temporary files,
previous versions, other programs' repair functions, command-line extraction) and links to the
author's specialized S2 recovery tools.
