import { Router } from "express";
import { findCostIndices, getAllCostIndices, getCharacterBlueprints } from "../esi/industry.js";
import { getSystemIdForStation, resolveLocation, resolveNames, type SearchCategory } from "../esi/universe.js";
import { TRADE_HUBS } from "../trading/hubs.js";
import { parseLang, pick } from "../i18n.js";

export const industryRouter = Router();

// Vergleicht den System-Kosten-Index (oeffentliche ESI-Daten, taeglich von
// CCP aktualisiert) zwischen den 5 grossen Hub-Systemen und optional einem
// frei gewaehlten System (per locationCategory/locationId aus der
// Freitextsuche, oder direkt per systemId). Bewusst KEINE
// Baukosten-Simulation: dafuer fehlen die Blueprint-Materialbedarfe (Static
// Data Export, nicht Teil von ESI) - das waere eine eigene, spaetere
// Ausbaustufe.
industryRouter.get("/cost-indices", async (req, res) => {
  try {
    const lang = parseLang(req.query.lang);
    const all = await getAllCostIndices();

    let requestedSystemId = req.query.systemId ? Number(req.query.systemId) : undefined;
    const locationCategory = req.query.locationCategory as SearchCategory | undefined;
    const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
    let regionOnlyNote: string | null = null;

    if (locationCategory && locationId) {
      const location = await resolveLocation(locationCategory, locationId, (req.query.locationLabel as string) ?? "");
      if (location.systemId) {
        requestedSystemId = location.systemId;
      } else {
        regionOnlyNote = pick(
          lang,
          "A whole region has no single cost index - please choose a specific system or station.",
          "Eine ganze Region hat keinen einzelnen Kosten-Index - bitte ein konkretes System oder eine Station waehlen.",
        );
      }
    }

    const hubSystemIds = await Promise.all(TRADE_HUBS.map((h) => getSystemIdForStation(h.stationId)));
    const compareIds = [...new Set([...hubSystemIds, ...(requestedSystemId ? [requestedSystemId] : [])])];
    const names = await resolveNames(compareIds);

    const rows = compareIds
      .map((systemId) => {
        const indices = findCostIndices(all, systemId);
        const manufacturing = indices.find((i) => i.activity === "manufacturing")?.cost_index ?? null;
        return {
          systemId,
          systemName: names.get(systemId) ?? `#${systemId}`,
          isHub: hubSystemIds.includes(systemId),
          isSelected: systemId === requestedSystemId,
          manufacturingCostIndexPct: manufacturing !== null ? manufacturing * 100 : null,
          indices: indices.map((i) => ({ activity: i.activity, costIndexPct: i.cost_index * 100 })),
        };
      })
      .sort((a, b) => (a.manufacturingCostIndexPct ?? Infinity) - (b.manufacturingCostIndexPct ?? Infinity));

    res.json({
      rows,
      regionOnlyNote,
      note: pick(
        lang,
        "Cost index = the share of job installation cost that ESI reports live per system and activity (lower = cheaper). " +
          "Your own structure with rigs can lower the actual rate further, but that depends on the specific structure/rig fit " +
          "and is deliberately not factored in here.",
        "Cost-Index = Anteil der Job-Installationskosten, den ESI live pro System und Aktivitaet meldet (niedriger = guenstiger). " +
          "Eigene Struktur samt Rigs kann den tatsaechlichen Satz zusaetzlich senken, das haengt aber vom konkreten Struktur-/Rig-Fit ab " +
          "und ist hier bewusst nicht mit eingerechnet.",
      ),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

industryRouter.get("/blueprints", async (req, res) => {
  const lang = parseLang(req.query.lang);
  const characterId = Number(req.query.characterId);
  if (!characterId) {
    res.status(400).json({ error: pick(lang, "characterId is missing", "characterId fehlt") });
    return;
  }
  try {
    const blueprints = await getCharacterBlueprints(characterId);
    const names = await resolveNames(blueprints.map((b) => b.type_id));
    const enriched = blueprints
      .map((b) => ({
        itemId: b.item_id,
        typeId: b.type_id,
        typeName: names.get(b.type_id) ?? `Type ${b.type_id}`,
        isOriginal: b.runs === -1,
        runsRemaining: b.runs === -1 ? null : b.runs,
        materialEfficiency: b.material_efficiency,
        timeEfficiency: b.time_efficiency,
        locationId: b.location_id,
      }))
      .sort((a, b) => a.typeName.localeCompare(b.typeName));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
