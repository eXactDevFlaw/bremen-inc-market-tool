import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { TradeCandidate } from "../trading/analyzer.js";
import { getAnthropicApiKey } from "../settings.js";

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super("Kein Anthropic API Key konfiguriert - bitte in den Einstellungen hinterlegen");
  }
}

const RecommendationSchema = z.object({
  itemName: z.string(),
  strategy: z.enum(["station_trading", "hauling"]),
  route: z.string().describe("z.B. 'Jita' bei Station-Trading oder 'Jita -> Amarr' beim Haulen"),
  expectedProfitPerUnit: z.number(),
  expectedMarginPercent: z.number(),
  liquidityAssessment: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  reasoning: z.string(),
});

const AdvisorResponseSchema = z.object({
  summary: z.string(),
  recommendations: z.array(RecommendationSchema),
});

export type TradeRecommendation = z.infer<typeof RecommendationSchema>;
export type AdvisorResponse = z.infer<typeof AdvisorResponseSchema>;

function rankByOpportunity(candidates: TradeCandidate[]): TradeCandidate[] {
  const score = (c: TradeCandidate): number => {
    const marginPct = c.kind === "station" ? c.spreadPct : c.profitPct;
    const volume = c.avgDailyVolume;
    // Bevorzugt hohe Marge UND ausreichend Handelsvolumen (illiquide Ausreisser abwerten).
    return marginPct * Math.log10(Math.max(volume, 1) + 1);
  };
  return [...candidates].sort((a, b) => score(b) - score(a));
}

export async function getAiTradeRecommendations(
  candidates: TradeCandidate[],
  walletBalance?: number,
): Promise<AdvisorResponse> {
  if (candidates.length === 0) {
    return { summary: "Keine Handelskandidaten gefunden.", recommendations: [] };
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new MissingAnthropicKeyError();

  const topCandidates = rankByOpportunity(candidates).slice(0, 30);
  const client = new Anthropic({ apiKey });

  const walletNote = walletBalance
    ? `Verfuegbares Kapital des Charakters: ${walletBalance.toLocaleString("de-DE")} ISK.`
    : "Kein Kapitalbetrag angegeben - gehe von moderatem Kapital aus.";

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "Du bist ein erfahrener EVE-Online-Markthaendler. Du bewertest vorab berechnete " +
      "Marktkandidaten (Spreads aus echten ESI-Marktdaten) und waehlst die tatsaechlich " +
      "lukrativsten und praktikabelsten Trades aus. Beruecksichtige Liquiditaet " +
      "(avgDailyVolume), Wettbewerb (Anzahl Orders), Kapitalbedarf und Risiko " +
      "(z.B. Fat-Finger-Gefahr bei wenigen Orders, Broker-Fees/Sales-Tax von ca. 3-8%, " +
      "die die reale Marge schmaelern). Sei ehrlich, wenn ein Kandidat zu illiquide oder " +
      "zu knapp kalkuliert ist, um empfohlen zu werden.",
    messages: [
      {
        role: "user",
        content:
          `${walletNote}\n\nHier sind vorberechnete Handelskandidaten (JSON):\n` +
          JSON.stringify(topCandidates, null, 2) +
          "\n\nWaehle die 5-10 besten Trades aus, ranke sie nach realistischer Attraktivitaet " +
          "(nicht nur nach roher Marge) und liefere eine kurze Gesamteinschaetzung.",
      },
    ],
    output_config: {
      format: zodOutputFormat(AdvisorResponseSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude-Antwort konnte nicht als strukturiertes JSON geparst werden");
  }
  return response.parsed_output;
}
