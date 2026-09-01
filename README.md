# قِرطاس — Qirtas

**Live at [qirtas.asasthaki.dev](https://qirtas.asasthaki.dev)**

A web app for Iraqi teachers to build A4 exam sheets and download them as PDF,
without Word or Google Docs. Arabic interface, RTL by default, built mobile-first.

*Qirtas* (قِرطاس) is the classical Arabic word for a sheet of paper.

Everything works offline and nothing is stored on a server. One optional
feature — the spelling check — sends the field being typed to Groq; it is the
only thing that leaves the device, and it can be switched off. See
[Privacy](#privacy).

## Running it

```bash
npm install
cp .env.example .env   # then paste your Groq key in, for the spelling check
npm run dev
```

`.env` is gitignored. Without it the app runs fine and the spelling check
switches itself off, saying so in the settings panel.

Build a deployable copy into `dist/`:

```bash
npm run build
```

`dist/` is a plain static folder — host it anywhere (Netlify, Vercel, GitHub
Pages, a school server). Paths are relative, so a subfolder works too. Serve it
over HTTPS so the service worker (offline support) can register.

## Deploying to qirtas.asasthaki.dev

`npm run build` produces `dist/`, a plain static folder. `vite.config.ts` sets
`base: './'`, so it works at a domain root or in a subfolder without changes.

Serve it over **HTTPS** — the service worker that makes the app work offline
will not register otherwise.

### Option A — Netlify / Vercel / Cloudflare Pages

Point the provider at this repo and use:

- Build command: `npm run build`
- Publish directory: `dist`

Set `VITE_GROQ_API_KEY` as an environment variable in the provider's dashboard,
or the deployed build ships without the spelling check — `.env` is not in the
repo, so the build has no other way to see it.

Then add `qirtas.asasthaki.dev` as a custom domain in the provider's dashboard
and follow its DNS instructions.

### Option B — GitHub Pages

Two extra pieces are needed:

1. A `public/CNAME` file containing exactly:

   ```
   qirtas.asasthaki.dev
   ```

2. A workflow at `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy
   on:
     push:
       branches: [main]
   permissions:
     contents: read
     pages: write
     id-token: write
   concurrency:
     group: pages
     cancel-in-progress: true
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: npm
         - run: npm ci
         - run: npm run build
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist
     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

   Then set **Settings → Pages → Source** to **GitHub Actions**, and point a
   DNS `CNAME` record for `qirtas` at `<your-username>.github.io`.

Either way, remember that the service worker caches aggressively. A returning
visitor gets the new `index.html` on the next load (it is fetched
network-first), and the new hashed assets follow from it.

## What the sheet is made of

- **Header** — three equal parts, each with its own alignment, plus an optional
  note line and a rule underneath.
- **Questions** — numbered `س١/` or `Q1/`. Each question can branch into
  `أ ، ب ، ج …` or `A, B, C …`, and every question or branch carries its own
  marks in the outer margin. Questions are separated by a **solid** or
  **dashed** divider, or none.
- **Footer** — two equal halves, each with its own alignment.

The three parts are colour-coded in the editor — sand for the header, green for
the questions, blue for the footer — so it stays obvious which part of the paper
you are editing.

Content flows onto as many A4 pages as it needs. The header can appear on the
first page only or repeat; same for the footer, which otherwise sits at the
bottom of the last page.

## Formatting

The toolbar appears when a field is focused: bold, italic, underline,
subscript, superscript, numbered list, bulleted list, text colour, text size,
line spacing, and four fonts — Inter, Arial, IBM Plex Sans Arabic, and
Times New Roman. Nothing more, by design.

The **π** button opens a symbol library — maths, chemistry, physics and arrows,
including the subscript and superscript digits that make `H₂SO₄` and `Ca²⁺` one
tap each instead of four. Tapping a symbol inserts it at the caret.

Defaults for the whole sheet (font, size, line spacing, colour, sheet
direction, numerals, branch labels, page margins) live in **الإعدادات**.

The interface is Arabic only. The *sheet* can still be written left-to-right —
that is a separate setting, for English-language subjects.

## The PDF

**تحميل PDF** downloads the file directly. No print dialog.

Each A4 page is rendered through an SVG `<foreignObject>`, so the browser's own
layout engine draws it: Arabic shaping, list markers and font fallbacks come out
exactly as they look on screen. The trade is that the text in the PDF is an
image rather than selectable text — the honest cost of skipping the print
dialog, since no client-side PDF library shapes Arabic correctly.

If a teacher does want selectable, searchable text, **الإعدادات → الطباعة بدل
التحميل** still offers the print route, which produces vector text.

## Spelling check (optional, on by default)

Arabic and English, through Groq. A word that looks misspelled gets a red wavy
underline; put the caret in it and the suggested spelling appears above it —
tap to accept. Obscene words are covered by a blur patch rather than deleted,
and a tap uncovers one for the rest of the session. The teacher's text is never
rewritten without a tap, and the blur is an editor-only affordance: the sheet
and the PDF always contain exactly what was typed.

Switch it off in **الإعدادات → التدقيق الإملائي**. Off means no requests at all.

### Setting it up

Put a Groq key in `.env` as `VITE_GROQ_API_KEY`. `VITE_GROQ_MODEL` overrides the
model, which defaults to `openai/gpt-oss-20b`.

**The key is public once you deploy.** Vite inlines env vars into the bundle at
build time, so anyone who opens devtools on the site can read it — `.env` keeps
it out of git and does nothing else. If that matters, put a small proxy in front
of Groq that holds the key server-side, and point `GROQ_ENDPOINT` at it.

### Why it is built the way it is

- **The model was chosen by measurement.** `openai/gpt-oss-20b` caught every
  planted error in a mixed Arabic/English paper, flagged nothing in a correctly
  written one, and answers in about 700 ms. Qwen was faster and missed all of
  the Arabic.
- **A false positive is worse than a miss.** A teacher who sees red under
  correctly written Arabic turns the feature off and never turns it back on, so
  the prompt refuses to guess and lists what it must never report — proper
  nouns, formulas, units, grammar, and absent tashkeel, which is normal writing
  and not an error. What it *is* told to report is the Arabic that actually goes
  wrong: hamza (`الايون` → `الأيون`), ة written as ه (`الرابطه` → `الرابطة`),
  and ى/ي at the end of a word.
- **Marks are an overlay, not markup.** Wrapping words in `<span>` would put the
  checker's opinion into the teacher's saved document, fight the caret on every
  keystroke, and be stripped by the sanitiser on the next load anyway. The
  underlines and blur patches are absolutely positioned boxes measured from
  `Range.getClientRects()`.
- **Failure is quiet.** No key, no network, a timeout, a 429 — all of them fall
  back to the local obscenity list, and a failure starts a cooldown so the app
  does not hammer a dead endpoint. Nothing ever blocks typing.

## Not losing work

This is treated as a hard requirement, not a nicety.

- Every edit is written to **localStorage** *and* **IndexedDB**. On load the
  newer of the two wins, with a rolling backup behind them.
- Saves are debounced by 500 ms, but also forced on `pagehide`, `beforeunload`,
  `blur` and `visibilitychange`. A reload 60 ms after a keystroke still keeps
  the keystroke.
- `navigator.storage.persist()` is requested so the browser will not evict the
  sheet when the device runs low on space.
- A **service worker** caches the app shell, so a reload with no network at all
  still opens the app with the sheet intact — and the PDF export still works,
  because its code chunks are prefetched while the app is idle.
- The save state is shown in the top bar, and if storage is genuinely
  unavailable (private browsing, for instance) the settings panel says so and
  points at *save a copy as a file*.
- **الإعدادات → ملفات الأوراق** saves or opens a sheet as a `.json` file, for
  moving between devices or keeping a backup.

Deleting a question or branch is undoable from the toast that appears, so no
confirmation dialog gets in the way. Replacing the whole sheet does ask first.

## Privacy

There is no account, no login, and no server that stores sheet content. The
sheet is saved on the device and the PDF is built in the browser, which is why
both work with the network off.

Two things can leave the device, and the privacy page
(**الإعدادات → الخصوصية**) names both in plain Arabic:

1. **The spelling check**, when it is on — which it is by default. It sends the
   text of the field being edited to Groq and nothing else: not the whole sheet,
   not the teacher's name, not the school, and no identifier tying one field to
   another. Turning it off stops all of it.
2. **A rating**, and only if the teacher chooses to send one.

If you would rather ship with the check off by default, change `spellcheck` in
`defaultPrefs` in [`src/lib/storage.ts`](src/lib/storage.ts). If you would
rather it did not exist, leave `VITE_GROQ_API_KEY` unset and the feature never
appears.

## Ratings (optional)

Ratings go to a Google Sheet you own, through a Google Apps Script web app.
**The feature stays completely hidden until you configure it** — nothing is
sent, and no rating entry appears in the settings.

**`src/lib/config.ts` and `Code.gs` currently hold the live endpoint and
spreadsheet id for qirtas.asasthaki.dev.** A clone that is run as-is posts its
ratings into that sheet. Replace both, or set `VITE_RATING_ENDPOINT` in `.env`,
which wins over the value in the source.

To turn it on, follow [`google-apps-script/README-SETUP.md`](google-apps-script/README-SETUP.md):
create a sheet, paste in [`google-apps-script/Code.gs`](google-apps-script/Code.gs),
deploy it as a web app with access set to **Anyone**, and put the `/exec` URL in
`src/lib/config.ts` (or in a `.env` file as `VITE_RATING_ENDPOINT`).

What gets sent: the star score, the optional comment, a coarse platform string
like `Android · Chrome`, and the app version. Never any part of the exam sheet.

Two details make the request actually work, and both are load-bearing:

- The body is posted as **`text/plain`**. That is a CORS-safelisted content
  type, so the browser skips the `OPTIONS` preflight — which matters because
  Apps Script web apps do not answer `OPTIONS` at all. Posting
  `application/json` fails every time for this reason.
- Apps Script answers `/exec` with a **302 to `googleusercontent.com`**. `fetch`
  follows it, and because the request is simple, the CORS check passes on both
  hops. `mode: 'no-cors'` is kept only as a fallback, since an opaque response
  cannot confirm anything.

If the device is offline, the rating is queued in `localStorage` and retried on
the next launch or when the connection returns. Each rating carries an id, and
`Code.gs` skips ids it has already stored, so a retry cannot double-count.

## Installing on a phone

The app ships a web manifest and icons, so Android Chrome offers *Add to home
screen* and iOS Safari can do the same from the share sheet. Installed, it opens
full-screen with no browser chrome and works offline.

## Layout

| Path | Purpose |
| --- | --- |
| `src/lib/types.ts` | Document model |
| `src/lib/doc.ts` | Defaults, numbering, sample sheet |
| `src/lib/storage.ts` | Dual-store persistence and recovery |
| `src/lib/paginate.ts` | Flattens the document and packs it into A4 pages |
| `src/lib/richtext.ts` | Formatting commands, sanitising, selection handling |
| `src/lib/pdf.ts` | Direct PDF export |
| `src/lib/i18n.ts` | Arabic string table |
| `src/lib/config.ts` | Rating endpoint, Groq key and model |
| `src/lib/rating.ts` | Rating submission, offline queue, retry |
| `src/lib/spellcheck.ts` | Groq client, prompt, cache, cooldown |
| `src/lib/profanity.ts` | Offline obscenity list |
| `src/lib/textmap.ts` | Field text ⇄ DOM offsets, whole-word search |
| `src/lib/symbols.ts` | The symbol library |
| `src/lib/keyboard.ts` | Where the on-screen keyboard is |
| `google-apps-script/Code.gs` | The Sheets receiver |
| `src/components/Sheet.tsx` | Measures content, renders the paginated A4 pages |
| `src/components/Editor.tsx` | Header / questions / footer editing |
| `src/components/Toolbar.tsx` | The formatting toolbar and symbol library |
| `src/components/RichText.tsx` | One editable field, and its spelling overlay |
| `src/components/SettingsPanel.tsx` | Sheet-wide settings |
| `public/sw.js` | Offline shell |

## Things worth knowing before you edit this

**Never use vertical margins inside `.page`.** Pagination measures every block
with `getBoundingClientRect`, which ignores margins — a stray `margin-top` in
there will silently over-pack pages and clip a teacher's question. Everything
inside the page uses padding. For the same reason the preview is scaled with
`transform`, not `zoom`: `zoom` re-rounds line boxes and drifts away from the
measured heights.

**The PDF exporter does its own rasterising.** `html-to-image`'s `toCanvas`
calls `HTMLImageElement.decode()` on an SVG data URL, which never settles in
some Chrome builds and hangs the export forever. `src/lib/pdf.ts` uses `toSvg`
and draws the result to a canvas through a plain `onload`.

**Imported files are sanitised, and the sanitiser walks live.** `Open a saved
sheet` accepts a file the app did not write, and every rich-text field ends up
in `dangerouslySetInnerHTML`. `migrate()` re-sanitises all of them. Inside
`sanitizeHtml`, the traversal deliberately uses `firstChild`/`nextSibling`
rather than a snapshot: unwrapping a disallowed element promotes its children
into the list, and those children have to be checked too — otherwise
`<svg onload=…><circle/></svg>` would leak the inner element.

**Whole-field formatting has to go inside the field.** With nothing selected,
the toolbar styles the whole field — and the only place that can live is inside
the field's own markup. `editor.style` is on the host element, which is never
part of `innerHTML`, so a style set there shows in the editor, never saves,
never reaches the PDF, and vanishes on reload. `styleWholeField` in
`src/lib/richtext.ts` wraps the contents instead, re-using the wrapper it made
last time so repeated taps do not nest.

**`Range.getClientRects()` returns one rect per character here.** Bidi text in a
contenteditable splits into that many runs, so the spelling overlay merges rects
back into one box per line before drawing. Without it every letter gets its own
underline segment.

**Symbols are LTR islands.** In an RTL interface the bidi algorithm mirrors `<`
to `>`, `⊂` to `⊃` and `→` to `←`, so a symbol button would advertise the
opposite of the character it inserts. `.tb-sym` is `direction: ltr;
unicode-bidi: isolate`. What the *field* does with the character afterwards is
the document's business and is correct as-is.

**The keyboard does not shrink the layout viewport.** `position: fixed;
bottom: 0` therefore puts the toolbar behind the keys on a phone. `--kb-inset`
(from `src/lib/keyboard.ts`) is the gap between the layout and visual viewports
— that is, what the keyboard covers — and everything pinned to the bottom sits
on top of it.

**Font embedding is deliberately narrow.** The SVG is its own document and
cannot reach the app's webfonts, so they are inlined — but only the families and
weights the sheet can actually use. Inlining all 37 `@font-face` rules on the
page takes long enough to look like a crash.

## Developer

Built and maintained by **[Asas Thaki](https://asasthaki.dev/)**.

## License

**Copyright © 2026 Asas Thaki. All rights reserved.**

This is proprietary software, not open source. The repository is readable, but
no licence is granted to copy, modify, distribute, or create derivative works
from any part of it. See [LICENSE](LICENSE) for the full terms, and
[asasthaki.dev](https://asasthaki.dev/) for licensing enquiries.
