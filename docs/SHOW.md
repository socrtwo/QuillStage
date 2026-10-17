# Slide show, presenter view and export

This describes what is implemented in `src/show/`, `src/render/animate.ts`, `src/render/transitions.ts` and `src/export/`. Items marked *not yet* are planned in [ROADMAP.md](ROADMAP.md).

## Slide show

The show runs full screen over the app (`startShow` in `src/show/player.ts`). It draws every slide with the same renderer as the edit view, plays builds (animations) and transitions, follows timings, links and interactive triggers, plays video and audio, and keeps ink drawn during the show until the end, when it asks **Keep your ink annotations?**

| Keys | Action |
|---|---|
| N, Space, Right, Down, Enter, Page Down, click, tap, swipe left | Next animation or slide |
| P, Backspace, Left, Up, Page Up, swipe right | Previous animation or slide |
| Number, then Enter | Go to that slide (hidden slides too) |
| Home / End | First / last slide |
| B or . | Black screen (press again, or any key that advances, to return) |
| W or , | White screen |
| G, Ctrl+S, - | See all slides (grid) |
| Z | Zoom: click a point to zoom in; Z, a click or Esc zooms out |
| Ctrl+P / Ctrl+I | Pen / highlighter |
| Ctrl+L | Laser pointer |
| Ctrl+A | Arrow (stop drawing) |
| E | Erase the ink on this slide |
| Ctrl+M | Show or hide ink |
| Ctrl+H | Hide the pointer |
| S | Stop or resume automatic advance |
| J | Live subtitles on or off |
| ? or F1 | List of keys |
| Esc | Leave zoom or the drawing tool, otherwise end the show |
| Right-click or long-press | Show menu |

An auto-hiding toolbar at the bottom left offers the same tools for mouse and touch.

- **Builds.** `buildSteps(slide)` turns the slide's animation list into steps: the automatic group that starts with the slide, then one step per click; *With Previous* effects start together, *After Previous* effects follow; *by paragraph* builds animate each paragraph (one click each when started on click). A click during an animation finishes it at once. Going back steps one build back, or shows the previous slide fully built. Entrance, exit and emphasis effects and motion paths (lines, arcs, circles, custom SVG paths) are played with the Web Animations API.
- **Transitions:** Fade (also through black), Push, Wipe, Split, Reveal, Cover, Uncover, Pull, Zoom, Random Bars, Shape/Circle/Diamond/Plus, Dissolve, Blinds, Checkerboard, Comb, Clock, Wedge, Flip, Cube, Gallery and **Smooth Morph**. Smooth Morph pairs objects on the two slides by name (names beginning with `!!` always pair), then identical text, then the same picture, then the same placeholder, then the same shape, and moves and resizes each pair while the rest fades. Several effects are approximations of their desktop counterparts.
- **Timings.** Slides with *Advance after* move on by themselves unless *Use Timings* is off in Set Up Slide Show; remaining builds are spread over the slide's time. **Rehearse Timings** (`startShow(app, { rehearse: true })`) records the time spent on each slide and offers to keep them.
- **Set Up Slide Show** settings honored: loop until Esc, kiosk (browsed at a kiosk: only links, Home, End and Esc), slide range, custom show, show without animation, show narration (media controls), pen and laser colors.
- **Reduced motion.** When the system asks for reduced motion, transitions become cuts and animations take effect at once.
- **Live subtitles** use the platform's speech recognition (`SpeechRecognition`) where the browser or WebView offers it; elsewhere QuillStage says that it is unavailable.
- With **End with black slide** (`prefs.showEndBlack`), the show ends on a black screen: "End of slide show, click to exit."

## Presenter view

`startPresenter` (`src/show/presenter.ts`) opens the **audience** in a second window and shows the **presenter view** in the main window: the current slide with its builds, the next build or slide, the speaker notes (larger/smaller), an elapsed timer (pause, reset), the clock, the slide counter, all slides, pen, highlighter, laser and eraser (drawn on the presenter's slide, shown to the audience), black and white screens, and *Swap displays*.

| Platform | Audience screen | Presenter screen |
|---|---|---|
| Web (Chrome, Edge) | A second window; with the Window Management permission it is moved to the other display (`getScreenDetails`). Otherwise drag it there and press F11 or click it to go full screen. | This window |
| Web (other browsers) | A second window placed by the user | This window |
| Desktop app (Electron) | Needs the main process to allow the audience window (see below); until then the show runs on one screen | |
| Android, iOS, phones | One screen: the show runs on this screen. Use **Rehearse** to practise with the presenter view. External-display presentation through the QuillNative plugin is *not yet* implemented. | |

If the second window cannot open (blocked pop-up, phone), the show starts on this screen with a notice.

**Rehearse** (`startPresenter(app, { singleScreen: true })`) shows the presenter view alone, with the timer, for practice.

**Following from another tab.** Each frame of the presenter view is also posted on `BroadcastChannel('quillstage-show')`. `followBroadcast(root)` shows those frames; a page opened with `?audience` can call it so a second tab (for example on a projector) follows the show.

## Export

| Output | Function | Notes |
|---|---|---|
| PNG / JPEG / SVG pictures | `exportImages`, `slidePng`, `standaloneSvg` (`src/export/images.ts`) | Rasterized from the renderer's SVG; the bundled fonts the slide uses are embedded so text keeps its font. |
| PDF | `deckToPdf` (`src/export/pdf.ts`) | Slides (optionally one page per build step), handouts (1, 2, 3, 4, 6 or 9 per page; 3 per page adds lines for notes), notes pages (continued on further pages when long) and outline. Built-in writer, no dependency. Slides are embedded as JPEG pictures; text written by the exporter uses Helvetica with WinAnsi encoding, so characters outside Western European languages become "?" in notes and outline pages. For a vector PDF with selectable slide text, use **Print ▸ Save as PDF**. |
| Print | `printDeck`, `printPreviewDialog` (`src/export/print.ts`) | Slides, handouts with frames, notes pages or outline; slide range; hidden slides; one page per build step; grayscale; Letter or A4. Printed from SVG, so *Save as PDF* in the print dialog is vector. |
| HTML show | `deckToHtmlShow` (`src/export/html.ts`) | One self-contained file: slides as inline SVG, media as data URLs, keys, click and swipe, builds, timings, notes (Shift+N), all slides (G), fade and push transitions. Fonts are not embedded; the page uses each font's fallbacks. |
| Story | `deckToStory` | Responsive scrolling page: one section per slide with its picture, its text as headings and lists, and notes. |

## Not yet implemented

Video (WebM/MP4) and animated GIF export, the phone remote, audience polls, word clouds, quizzes and Q&A, the rehearsal coach, recording (camera, narration), cast to display and external displays on Android and iOS, and 2-D slide stacks. These are planned for milestone M6 and later.

## Desktop app note

The Electron main process currently denies every `window.open`. For the presenter view on the desktop, `setWindowOpenHandler` must allow the about:blank window named `quillstage-audience` (and may place it full screen on a secondary display from `screen.getAllDisplays()`).
