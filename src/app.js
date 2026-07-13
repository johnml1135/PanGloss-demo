import initWasm, { PanGlossGrammar } from "../pkg/hc_wasm.js";
import { fetchTranslationsForLanguage, fetchBooks, fetchChapterText } from "./ebible.js";

// The wasm-bindgen grammar handle is kept OUTSIDE Alpine's reactive state on purpose: Alpine wraps
// x-data in a reactive Proxy, and proxying a wasm-bindgen class instance (internally just a raw
// pointer + a `free()` method) risks the proxy machinery touching it in ways it isn't meant for.
// Only plain JSON data (grammar list, tokens, chapter text) needs to be reactive.
let activeGrammar = null;

async function fetchTextOrNull(url) {
  if (!url) return null;
  const res = await fetch(url);
  return res.ok ? await res.text() : null;
}

export default function pangloss() {
  return {
    mode: "view", // "view" | "edit"

    grammars: [],
    selectedGrammarId: "",
    grammarStatus: "", // human-readable status/error line, empty when fine

    translations: [],
    selectedTranslationId: "",
    books: [],
    selectedBookId: "",
    chapter: 1,
    maxChapter: 1,
    ebibleStatus: "",

    chapterText: "",
    tokens: [],
    analyzing: false,
    // Bumped on every analyze() so x-for's :key changes and Alpine tears down + recreates every
    // token element -- otherwise keyed diffing would reuse old DOM nodes across re-analyses and
    // each word's x-init tippy() call (which only fires once, on element creation) would never
    // re-run with the new tooltip content.
    analysisRun: 0,

    async init() {
      await this.loadWasm();
      await this.loadGrammarList();
      if (this.grammars.length > 0) {
        this.selectedGrammarId = this.grammars[0].id;
        await this.onGrammarChange();
      }
    },

    async loadWasm() {
      await initWasm();
    },

    async loadGrammarList() {
      const [fwIndex, sampleIndex] = await Promise.all([
        fetch("/.data/index.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch("/samples/manifest.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      this.grammars = [
        ...sampleIndex.map((g) => ({ ...g, source: "sample" })),
        ...fwIndex.map((g) => ({ ...g, source: "fieldworks" })),
      ];
    },

    get selectedGrammarMeta() {
      return this.grammars.find((g) => g.id === this.selectedGrammarId) ?? null;
    },

    async onGrammarChange() {
      const meta = this.selectedGrammarMeta;
      if (!meta) return;
      this.grammarStatus = "Loading grammar...";
      this.tokens = [];
      activeGrammar = null;
      try {
        const [xml, realizeToml] = await Promise.all([
          fetchTextOrNull(meta.hcXmlUrl),
          fetchTextOrNull(meta.realizeTomlUrl),
        ]);
        if (!xml) throw new Error(`could not fetch ${meta.hcXmlUrl}`);
        activeGrammar = new PanGlossGrammar(xml, realizeToml);
        this.grammarStatus = "";
      } catch (err) {
        this.grammarStatus = `Failed to load grammar: ${err.message ?? err}`;
        return;
      }
      await this.loadTranslationsForCurrentGrammar();
    },

    async loadTranslationsForCurrentGrammar() {
      const meta = this.selectedGrammarMeta;
      this.translations = [];
      this.selectedTranslationId = "";
      this.ebibleStatus = "Looking up eBible translations...";
      try {
        const matches = await fetchTranslationsForLanguage(meta?.vernacularWs);
        this.translations = matches;
        if (matches.length > 0) {
          this.ebibleStatus = "";
          this.selectedTranslationId = matches[0].id;
          await this.onTranslationChange();
        } else {
          this.ebibleStatus = meta?.vernacularWs
            ? `No eBible translation found for language "${meta.vernacularWs}" -- use Edit mode to paste your own text.`
            : "";
          this.chapterText = meta?.sampleText ?? "";
          await this.analyze();
        }
      } catch (err) {
        this.ebibleStatus = `Failed to reach eBible API: ${err.message ?? err}`;
      }
    },

    async onTranslationChange() {
      if (!this.selectedTranslationId) return;
      this.books = [];
      this.selectedBookId = "";
      try {
        this.books = await fetchBooks(this.selectedTranslationId);
        if (this.books.length > 0) {
          this.selectedBookId = this.books[0].id;
          await this.onBookChange();
        }
      } catch (err) {
        this.ebibleStatus = `Failed to load book list: ${err.message ?? err}`;
      }
    },

    async onBookChange() {
      const book = this.books.find((b) => b.id === this.selectedBookId);
      this.maxChapter = book?.numberOfChapters ?? 1;
      this.chapter = 1;
      await this.loadChapter();
    },

    async loadChapter() {
      if (!this.selectedTranslationId || !this.selectedBookId) return;
      this.ebibleStatus = "Loading chapter...";
      try {
        this.chapterText = await fetchChapterText(
          this.selectedTranslationId,
          this.selectedBookId,
          this.chapter
        );
        this.ebibleStatus = "";
        await this.analyze();
      } catch (err) {
        this.ebibleStatus = `Failed to load chapter: ${err.message ?? err}`;
      }
    },

    async setMode(next) {
      if (next === "view") await this.analyze();
      this.mode = next;
    },

    async analyze() {
      if (!activeGrammar) {
        this.grammarStatus = "No grammar loaded yet.";
        return;
      }
      this.analyzing = true;
      try {
        // Yield a frame so the "analyzing..." state actually paints before the (synchronous,
        // potentially chapter-sized) wasm call blocks the main thread.
        await new Promise((resolve) => setTimeout(resolve, 0));
        this.tokens = activeGrammar.analyzeText(this.chapterText);
        this.analysisRun++;
      } catch (err) {
        this.grammarStatus = `Analysis failed: ${err.message ?? err}`;
        this.tokens = [];
      } finally {
        this.analyzing = false;
      }
    },

    // -- View-mode display helpers -------------------------------------------------------------

    primaryAnalysis(token) {
      return token.analyses && token.analyses.length > 0 ? token.analyses[0] : null;
    },

    morphLine(token) {
      return this.primaryAnalysis(token)?.leipzig ?? "?";
    },

    glossLine(token) {
      const a = this.primaryAnalysis(token);
      if (!a) return "";
      return a.residue && a.residue.length > 0 ? `${a.gloss} (${a.residue.join("-")})` : a.gloss;
    },

    tooltipHtml(token) {
      if (!token.analyses || token.analyses.length === 0) {
        return "<em>no analysis available</em>";
      }
      return token.analyses
        .map((a, i) => {
          const marker = a.guessed ? " (guessed root)" : "";
          const residue = a.residue && a.residue.length > 0 ? ` (${a.residue.join("-")})` : "";
          return `<div class="py-0.5"><strong>${i + 1}.</strong> ${a.leipzig} &rarr; ${a.gloss}${residue}${marker}</div>`;
        })
        .join("");
    },
  };
}
