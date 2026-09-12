import { Router, type Request } from "express";
import {
  findRouteCandidates,
  findTradeCandidates,
  findTradeCandidatesAtLocation,
  findTradeCandidatesFullMarket,
  quoteItemAtTwoLocations,
} from "../trading/analyzer.js";
import { rankCandidatesLocally, type ScoredCandidate } from "../trading/scoring.js";
import { getGroqDailyAnalysis, MissingGroqKeyError } from "../ai/groqAdvisor.js";
import type { TradeFeeSkills } from "../trading/fees.js";
import { computeHaulProfit } from "../economics/profit.js";
import { computeRoiPct } from "../economics/roi.js";
import { getCharacterWalletBalance, getSkillLevelsByName } from "../esi/character.js";
import { DEFAULT_WATCHLIST, EXPANDED_WATCHLIST, TRADE_HUBS } from "../trading/hubs.js";
import { getMarketHistory } from "../trading/marketData.js";
import { getSystemIdForStation, getTypeInfo, resolveLocation, resolveTypeIdsByName, type ResolvedLocation, type SearchCategory } from "../esi/universe.js";
import { parseLang, pick } from "../i18n.js";

export const tradingRouter = Router();

async function resolveSkills(characterId: number | undefined): Promise<{
  skills: TradeFeeSkills;
  skillsSource: "connected_character" | "default_untrained";
  walletBalance: number | undefined;
}> {
  if (!characterId) {
    return { skills: { brokerRelationsLevel: 0, accountingLevel: 0 }, skillsSource: "default_untrained", walletBalance: undefined };
  }
  const [levelsByName, wallet] = await Promise.all([
    getSkillLevelsByName(characterId).catch(() => null),
    getCharacterWalletBalance(characterId).catch(() => undefined),
  ]);
  if (!levelsByName) {
    return { skills: { brokerRelationsLevel: 0, accountingLevel: 0 }, skillsSource: "default_untrained", walletBalance: wallet };
  }
  return {
    skills: {
      brokerRelationsLevel: levelsByName.get("Broker Relations") ?? 0,
      accountingLevel: levelsByName.get("Accounting") ?? 0,
    },
    skillsSource: "connected_character",
    walletBalance: wallet,
  };
}

/** Loest einen Ort entweder ueber einen Hub-Kurznamen (?<prefix>Hub=Jita) oder ueber eine Freitextsuche-Auswahl auf. */
async function resolveNamedLocation(req: Request, prefix: string): Promise<ResolvedLocation | null> {
  const hubName = req.query[`${prefix}Hub`] as string | undefined;
  if (hubName) {
    const hub = TRADE_HUBS.find((h) => h.name.toLowerCase() === hubName.toLowerCase());
    if (!hub) return null;
    const systemId = await getSystemIdForStation(hub.stationId);
    return { regionId: hub.regionId, systemId, stationId: hub.stationId, label: hub.name };
  }
  const category = req.query[`${prefix}LocationCategory`] as SearchCategory | undefined;
  const id = req.query[`${prefix}LocationId`] ? Number(req.query[`${prefix}LocationId`]) : undefined;
  const label = (req.query[`${prefix}LocationLabel`] as string | undefined) ?? "";
  if (!category || !id) return null;
  return resolveLocation(category, id, label || `#${id}`);
}

// Rein algorithmische Marktauswertung - keine KI, keine laufenden Kosten.
// Ohne locationCategory/locationId: klassischer 5-Hub-Vergleich (Station-Trading + Hauling).
// Mit locationCategory/locationId (aus /api/universe/search): Einzelort-Scan
// an einer frei gewaehlten Station/System/Region.
tradingRouter.get("/opportunities", async (req, res) => {
  try {
    const lang = parseLang(req.query.lang);
    const characterId = req.query.characterId ? Number(req.query.characterId) : undefined;
    const { skills, skillsSource, walletBalance } = await resolveSkills(characterId);

    const locationCategory = req.query.locationCategory as SearchCategory | undefined;
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    const locationLabel = (req.query.locationLabel as string | undefined) ?? "";

    let candidates;
    let mode: "five_hub" | "five_hub_full_market" | "custom_location";

    if (locationCategory && locationId) {
      const location = await resolveLocation(locationCategory, locationId, locationLabel || `#${locationId}`);
      candidates = await findTradeCandidatesAtLocation(location, EXPANDED_WATCHLIST, lang);
      mode = "custom_location";
    } else {
      // Standard: Vollmarkt-Scan (siehe findTradeCandidatesFullMarket) - wertet
      // wirklich JEDES an den 5 Hubs gehandelte Item aus, nicht nur eine
      // Watchlist. Nur wenn explizit ?watchlist=... mitgegeben wird (z.B. fuer
      // einen schnellen, gezielten Check weniger Items), greift stattdessen
      // der alte, schnellere Watchlist-Modus.
      const watchlistParam = req.query.watchlist as string | undefined;
      if (watchlistParam) {
        const watchlist = watchlistParam.split(",").map((s) => s.trim());
        candidates = await findTradeCandidates(watchlist.length > 0 ? watchlist : DEFAULT_WATCHLIST);
        mode = "five_hub";
      } else {
        candidates = await findTradeCandidatesFullMarket();
        mode = "five_hub_full_market";
      }
    }

    const recommendations = rankCandidatesLocally(candidates, { skills, limit: 20, lang });

    const skillsNote = pick(lang, skillsSource === "connected_character" ? "your real" : "untrained (level 0)", skillsSource === "connected_character" ? "deinen echten" : "ungetrainten (Level 0)");
    const summary =
      recommendations.length === 0
        ? pick(
            lang,
            `No profitable candidates found (${candidates.length} checked) - nothing in the checked list currently seems to be in the black after fees.`,
            `Keine profitablen Kandidaten gefunden (${candidates.length} geprueft) - aktuell scheint nichts aus der geprueften Liste nach Gebuehren im Plus zu liegen.`,
          )
        : mode === "custom_location"
          ? pick(
              lang,
              `${recommendations.length} profitable candidates at the chosen location out of ${candidates.length} checked items - calculated with ${skillsNote} fee skills.`,
              `${recommendations.length} profitable Kandidaten am gewaehlten Ort von ${candidates.length} geprueften Items - berechnet mit ${skillsNote} Gebuehren-Skills.`,
            )
          : pick(
              lang,
              `${recommendations.length} profitable candidates (after broker fee + sales tax) out of ${candidates.length} checked market pairs - calculated with ${skillsNote} fee skills.`,
              `${recommendations.length} profitable Kandidaten (nach Broker Fee + Sales Tax) von ${candidates.length} geprueften Markt-Konstellationen - berechnet mit ${skillsNote} Gebuehren-Skills.`,
            );

    res.json({
      mode,
      candidateCount: candidates.length,
      walletBalance,
      skillsSource,
      brokerRelationsLevel: skills.brokerRelationsLevel,
      accountingLevel: skills.accountingLevel,
      summary,
      recommendations,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Optionale, kostenlose KI-Tagesanalyse (Groq) der bereits geladenen
// Handelskandidaten - siehe ai/groqAdvisor.ts. Der Client schickt die vom
// /opportunities- bzw. /route-Endpoint zuletzt erhaltenen `recommendations`
// zurueck (nichts wird hier neu berechnet), auf Knopfdruck, kein Scheduler.
tradingRouter.post("/ai-analysis", async (req, res) => {
  const lang = parseLang(req.query.lang);
  try {
    const { recommendations, walletBalance } = req.body as {
      recommendations?: ScoredCandidate[];
      walletBalance?: number | null;
    };
    const analysis = await getGroqDailyAnalysis(recommendations ?? [], walletBalance ?? null, lang);
    res.json(analysis);
  } catch (err) {
    if (err instanceof MissingGroqKeyError) {
      res.status(400).json({ error: err.message, missingGroqKey: true });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

// Tagesgenauer Preis-/Volumenverlauf eines Items an einem frei gewaehlten Ort
// (Hub-Kurzname oder Freitextsuche-Auswahl) - Basis fuer die Charts im
// Market-Tab. Nutzt die bereits vorhandene ESI-Handelshistorie
// (/markets/{region}/history/), die bisher nirgends im Frontend exponiert war.
tradingRouter.get("/history", async (req, res) => {
  try {
    const lang = parseLang(req.query.lang);
    const location = (await resolveNamedLocation(req, "")) ?? { regionId: TRADE_HUBS[0]!.regionId, systemId: null, stationId: TRADE_HUBS[0]!.stationId, label: TRADE_HUBS[0]!.name };

    let typeId = req.query.typeId ? Number(req.query.typeId) : undefined;
    const typeName = req.query.typeName as string | undefined;
    if (!typeId && typeName) {
      const resolved = await resolveTypeIdsByName([typeName]);
      typeId = resolved.get(typeName);
    }
    if (!typeId) {
      res.status(400).json({ error: pick(lang, "typeId or typeName is required", "typeId oder typeName wird benoetigt") });
      return;
    }

    const [history, typeInfo] = await Promise.all([getMarketHistory(location.regionId, typeId), getTypeInfo(typeId).catch(() => null)]);

    const days = Math.min(365, Math.max(7, req.query.days ? Number(req.query.days) : 90));
    const trimmed = history.slice(-days);

    res.json({
      typeId,
      typeName: typeInfo?.name ?? typeName ?? `#${typeId}`,
      location: { regionId: location.regionId, systemId: location.systemId, stationId: location.stationId, label: location.label },
      history: trimmed,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Explizite Zwei-Orte-Route ("kaufe in Rens, verkaufe in Jita 4-4 - was bleibt
// an Gewinn?"). Mit typeId/typeName: detaillierte Einzel-Item-Rechnung
// inkl. Gebuehren-Aufschluesselung. Ohne: Scan der Watchlist auf dieser
// konkreten Route, gerankt mit derselben Scoring-Engine wie der 5-Hub-Vergleich.
tradingRouter.get("/route", async (req, res) => {
  try {
    const lang = parseLang(req.query.lang);
    const from = await resolveNamedLocation(req, "from");
    const to = await resolveNamedLocation(req, "to");
    if (!from || !to) {
      res.status(400).json({ error: pick(lang, "fromHub/toHub or from-/toLocationCategory+Id are required", "fromHub/toHub oder from-/toLocationCategory+Id werden benoetigt") });
      return;
    }

    const characterId = req.query.characterId ? Number(req.query.characterId) : undefined;
    const { skills, skillsSource, walletBalance } = await resolveSkills(characterId);

    let typeId = req.query.typeId ? Number(req.query.typeId) : undefined;
    const typeName = req.query.typeName as string | undefined;
    if (!typeId && typeName) {
      const resolved = await resolveTypeIdsByName([typeName]);
      typeId = resolved.get(typeName);
    }

    if (typeId) {
      const [quote, typeInfo] = await Promise.all([
        quoteItemAtTwoLocations(typeName ?? `#${typeId}`, typeId, from, to),
        getTypeInfo(typeId).catch(() => null),
      ]);
      const resolvedName = typeInfo?.name ?? typeName ?? `#${typeId}`;

      if (quote.buyPrice == null || quote.sellPrice == null) {
        res.json({
          mode: "single_item",
          item: { typeId, name: resolvedName },
          from: { label: from.label },
          to: { label: to.label },
          available: false,
          message: pick(
            lang,
            `No sell order at ${from.label} or no buy order at ${to.label} for ${resolvedName} right now.`,
            `Aktuell keine Sell-Order bei ${from.label} oder keine Buy-Order bei ${to.label} fuer ${resolvedName}.`,
          ),
        });
        return;
      }

      // computeHaulProfit() statt der frueheren netHaulProfit() (trading/fees.ts,
      // jetzt entfernt) - netMarginPct ist jetzt einheitlich ./. sellPrice
      // definiert (DECISIONS.md D013). Der bisherige (./. buyPrice) Zahlenwert
      // lebt unveraendert als roiPct weiter.
      const net = computeHaulProfit(quote.buyPrice, quote.sellPrice, skills);
      const capitalRequired = quote.buyPrice; // vorlaeufig pro Einheit, siehe DECISIONS.md D014
      const roiPct = computeRoiPct(net.netProfit, capitalRequired);
      res.json({
        mode: "single_item",
        item: { typeId, name: resolvedName },
        from: { label: from.label },
        to: { label: to.label },
        available: true,
        buyPrice: quote.buyPrice,
        sellPrice: quote.sellPrice,
        buyOrderCount: quote.buyOrderCount,
        sellOrderCount: quote.sellOrderCount,
        avgDailyVolume: quote.avgDailyVolume,
        avgDailyVolumeKnown: quote.avgDailyVolumeKnown,
        brokerFeePct: net.brokerFeePct,
        salesTaxPct: net.salesTaxPct,
        sellOrderFee: quote.sellPrice * (net.brokerFeePct / 100),
        salesTax: quote.sellPrice * (net.salesTaxPct / 100),
        netProfitPerUnit: net.netProfit,
        netMarginPct: net.netMarginPct,
        roiPct,
        capitalRequired,
        skillsSource,
        walletBalance,
        maxUnitsWithinWallet: walletBalance && quote.buyPrice > 0 ? Math.floor(walletBalance / quote.buyPrice) : null,
      });
      return;
    }

    const watchlistParam = req.query.watchlist as string | undefined;
    const watchlist = watchlistParam ? watchlistParam.split(",").map((s) => s.trim()) : EXPANDED_WATCHLIST;
    const candidates = await findRouteCandidates(from, to, watchlist);
    const recommendations = rankCandidatesLocally(candidates, { skills, limit: 20, lang });

    res.json({
      mode: "watchlist_scan",
      from: { label: from.label },
      to: { label: to.label },
      candidateCount: candidates.length,
      skillsSource,
      walletBalance,
      summary:
        recommendations.length === 0
          ? pick(
              lang,
              `No profitable items found for ${from.label} → ${to.label} (${candidates.length} checked).`,
              `Keine profitablen Items fuer ${from.label} → ${to.label} gefunden (${candidates.length} geprueft).`,
            )
          : pick(
              lang,
              `${recommendations.length} profitable items for ${from.label} → ${to.label} out of ${candidates.length} checked.`,
              `${recommendations.length} profitable Items fuer ${from.label} → ${to.label} von ${candidates.length} geprueften.`,
            ),
      recommendations,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
