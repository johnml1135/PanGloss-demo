# PanGloss Demo

A zero-server, static-frontend demo of [PanGloss](https://github.com/sillsdev/machine)'s
Rust morphological analyzer/glosser, compiled to WebAssembly. Runs eBible chapters (fetched
live from the [HelloAO Bible API](https://bible.helloao.org), a JSON mirror of eBible.org) or
your own FieldWorks project's text through the real analyze -> gloss -> natural-English-realize
pipeline, and displays it as an interactive interlinear view.

## Quick start

```
npm install
npm run dev
```

Then open http://localhost:8080/. `npm run dev` does three things in order:

1. `npm run convert` -- converts any FieldWorks backups you've dropped in `fwbackups/` (see below).
   No-op if you haven't dropped any in; the demo still works against the committed toy grammar.
2. `npm run build:wasm` -- builds the `hc-wasm` crate (in the sibling `../PanGloss/rust` engine
   repo) to a browser ES module in `pkg/`.
3. `npm run serve` -- a tiny static file server (plain HTTP is required for the wasm fetch and ES
   module imports to work; opening `index.html` as a `file://` URL will not work).

## Using your own FieldWorks project

Drop a `.fwbackup` file into `fwbackups/` (gitignored -- never committed) and re-run `npm run dev`
(or just `npm run convert`). The conversion script:

1. Unzips the backup and finds its `.fwdata` file.
2. Runs FieldWorks' own `GenerateHCConfig.exe` on it to produce a HermitCrab grammar XML.
3. Reads the project's primary vernacular writing system (`CurVernWss`) so the demo can look up a
   matching eBible translation automatically.

This step requires FieldWorks itself installed locally (tested against FieldWorks 9's
`C:\Program Files\SIL\FieldWorks 9\GenerateHCConfig.exe`; override the path with the
`FW_GENERATEHCCONFIG_PATH` env var if yours lives elsewhere). Without FieldWorks installed, the
conversion step just skips with a warning -- the toy grammar sample still works.

Converted output lands in `.data/` (also gitignored): derived data from a real linguistic project
is still real project data, so none of it is ever meant to be committed, same as the engine repo's
own `samples/data/*-hc.xml` policy.

## The committed sample

`samples/toy-hc.xml` (+ `toy-realize.toml`) is a small, original, hand-built HermitCrab grammar --
not derived from any real language -- so the demo has something to show on a fresh clone with no
FieldWorks backup at all.

## Layout

- `index.html`, `src/app.js`, `src/ebible.js` -- the frontend (Tailwind + Alpine.js + Tippy.js, all
  via CDN, no bundler).
- `../PanGloss/rust/crates/hc-wasm` -- the `wasm-bindgen` crate this demo loads (lives in the
  engine repo, not here).
- `tools/convert-fwbackups.mjs`, `tools/build-wasm.mjs`, `tools/serve.mjs` -- the three `npm run
  dev` steps.
- `fwbackups/`, `.data/`, `pkg/` -- all gitignored; regenerated locally.
