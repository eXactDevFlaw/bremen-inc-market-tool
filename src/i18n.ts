// Minimalistischer Server-seitiger i18n-Helfer fuer generierte Fliesstexte
// (summary/reasoning/note-Felder). Kein grosses Framework noetig - die
// Anzahl der Textbausteine ist ueberschaubar und aendert sich selten.
// Die UI selbst ist Englisch per Default (siehe public/js/i18n.js); das
// Backend rechnet und formuliert dieselben Texte auf Anfrage (?lang=de) auch
// auf Deutsch, damit z.B. "reasoning"/"note"-Felder zur UI-Sprache passen.
export type Lang = "en" | "de";

export function parseLang(value: unknown): Lang {
  return value === "de" ? "de" : "en";
}

/** Waehlt zwischen einer englischen und einer deutschen Formulierung. */
export function pick(lang: Lang, en: string, de: string): string {
  return lang === "de" ? de : en;
}
