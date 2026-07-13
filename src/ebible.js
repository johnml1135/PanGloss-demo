// Thin client for the HelloAO Free Use Bible API (bible.helloao.org) -- a JSON mirror of
// eBible.org's open-licensed translations, picked over eBible.org's own raw USFM/zip downloads
// specifically because it's per-chapter JSON with (per its own "for App Integration" pitch)
// permissive CORS, so a zero-server static frontend can fetch it directly from the browser.
const API_ROOT = "https://bible.helloao.org/api";

let translationsCache = null;

/** Every available translation, normalized. Fetched once and cached for the session. */
export async function fetchTranslations() {
  if (translationsCache) return translationsCache;
  const res = await fetch(`${API_ROOT}/available_translations.json`);
  if (!res.ok) throw new Error(`fetch translations: HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.translations ?? []);
  translationsCache = list.map((t) => ({
    id: t.id,
    languageCode: t.language,
    languageName: t.languageEnglishName ?? t.languageName ?? t.language,
    name: t.englishName ?? t.name ?? t.id,
  }));
  return translationsCache;
}

/** Translations whose language code matches `languageCode` exactly (e.g. "seh", "amh"). */
export async function fetchTranslationsForLanguage(languageCode) {
  if (!languageCode) return [];
  const all = await fetchTranslations();
  return all.filter((t) => t.languageCode === languageCode);
}

export async function fetchBooks(translationId) {
  const res = await fetch(`${API_ROOT}/${translationId}/books.json`);
  if (!res.ok) throw new Error(`fetch books for ${translationId}: HTTP ${res.status}`);
  const data = await res.json();
  return (data.books ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    numberOfChapters: b.numberOfChapters,
  }));
}

/**
 * Plain display text for one chapter, verses joined with a leading verse number
 * (`"1 In the beginning... 2 And the earth..."`) -- exactly what a reader would expect from an
 * interlinear Bible view, and what Edit mode's textarea should show as editable raw text.
 */
export async function fetchChapterText(translationId, bookId, chapterNumber) {
  const res = await fetch(`${API_ROOT}/${translationId}/${bookId}/${chapterNumber}.json`);
  if (!res.ok) {
    throw new Error(`fetch ${translationId} ${bookId} ${chapterNumber}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const content = data.chapter?.content ?? [];
  const verses = content
    .filter((item) => item.type === "verse")
    .map((item) => {
      const text = (item.content ?? [])
        .filter((piece) => typeof piece === "string")
        .join("");
      return `${item.number} ${text}`;
    });
  return verses.join(" ");
}
