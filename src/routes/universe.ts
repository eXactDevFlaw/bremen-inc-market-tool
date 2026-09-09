import { Router } from "express";
import { getTradeHubSearchResults, searchItemTypes, searchLocations } from "../esi/universe.js";
import { parseLang, pick, type Lang } from "../i18n.js";

export const universeRouter = Router();

// Die 5 grossen Handelsknotenpunkte, damit das Orts-Dropdown sie schon beim
// Oeffnen (vor jeder Eingabe) anzeigen kann.
universeRouter.get("/hubs", (_req, res) => {
  res.json(getTradeHubSearchResults());
});

function searchErrorMessage(err: unknown, lang: Lang): string {
  const message = (err as Error).message ?? "";
  // Kein Charakter verbunden -> die authentifizierte ESI-Suche kann gar
  // nicht erst aufgerufen werden (siehe esi/universe.ts). Klare, uebersetzte
  // Meldung statt der rohen technischen Fehlermeldung.
  if (message.includes("Kein Charakter verbunden")) {
    return pick(lang, "Please connect a character first - search needs a connected character.", "Bitte zuerst einen Charakter verbinden - die Suche benoetigt einen verbundenen Charakter.");
  }
  return message;
}

// Autocomplete fuer die freie Orts-Auswahl (Region/System/Station) in der Trade Analysis.
universeRouter.get("/search", async (req, res) => {
  const term = (req.query.q as string | undefined) ?? "";
  const lang = parseLang(req.query.lang);
  try {
    const results = await searchLocations(term);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: searchErrorMessage(err, lang) });
  }
});

// Autocomplete fuer die Item-Auswahl (Market-Tab: Preis-Verlauf, Zwei-Orte-Rechner).
universeRouter.get("/search-items", async (req, res) => {
  const term = (req.query.q as string | undefined) ?? "";
  const lang = parseLang(req.query.lang);
  try {
    const results = await searchItemTypes(term);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: searchErrorMessage(err, lang) });
  }
});
