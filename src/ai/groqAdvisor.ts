// Optionale, kostenlose KI-Tagesanalyse fuer die Trade Analysis: nutzt Groqs
// kostenlose, OpenAI-kompatible Chat-API (console.groq.com - Gratis-Account,
// grosszuegiges Free-Tier-Kontingent, kein Zahlungsmittel noetig), NICHT die
// (kostenpflichtige) Anthropic API aus tradeAdvisor.ts. Bewertet die bereits
// lokal berechneten, profitablen Handelskandidaten (siehe scoring.ts) und
// fasst sie je Risikostufe (niedrig/"sicheres Einkommen", mittel, hoch)
// zusammen - auf Knopfdruck im Trading-Tab, kein Hintergrund-Scheduler.
import { z } from "zod/v4";
import type { RiskLevel, ScoredCandidate } from "../trading/scoring.js";
import { getGroqApiKey } from "../settings.js";
import { pick, type Lang } from "../i18n.js";

export class MissingGroqKeyError extends Error {
  constructor(lang: Lang) {
    super(
      pick(
        lang,
        "No Groq API key configured - create a free one at console.groq.com and add it under Settings.",
        "Kein Groq API Key konfiguriert - kostenlos auf console.groq.com anlegen und in den Einstellungen hinterlegen.",
      ),
    );
  }
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Kostenloses Groq-Modell mit dem grosszuegigsten Free-Tier-Kontingent
// (14.4k Requests/Tag). "llama-3.3-70b-versatile" wurde zwischenzeitlich aus
// dem Gratis-Zugriff genommen (404 "does not exist or you do not have
// access to it" bei einem normalen kostenlosen Account) - falls Groq dieses
// Modell ebenfalls irgendwann abkuendigt, reicht es, diese eine Konstante auf
// ein aktuelles Modell aus https://console.groq.com/docs/models zu aendern.
const GROQ_MODEL = "llama-3.1-8b-instant";

const BucketSchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  headline: z.string(),
  analysis: z.string(),
  topPicks: z.array(z.string()).max(8),
});

const AnalysisSchema = z.object({
  overview: z.string(),
  buckets: z.array(BucketSchema),
});

export interface AiAnalysisBucket {
  level: RiskLevel;
  headline: string;
  analysis: string;
  topPicks: string[];
}

export interface DailyAiAnalysis {
  generatedAt: string;
  model: string;
  overview: string;
  buckets: AiAnalysisBucket[];
}

/** Reduziert die Kandidaten auf die fuers KI-Urteil relevanten Felder - haelt den Prompt klein und schnell. */
function toCompactCandidate(c: ScoredCandidate) {
  return {
    item: c.itemName,
    strategy: c.strategy,
    route: c.route,
    netProfitPerUnit: Math.round(c.netProfitPerUnit * 100) / 100,
    netMarginPct: Math.round(c.netMarginPct * 10) / 10,
    avgDailyVolume: Math.round(c.avgDailyVolume * 10) / 10,
    competingOrders: c.competingOrders,
    riskLevel: c.riskLevel,
  };
}

function buildSystemPrompt(lang: Lang): string {
  const base = pick(
    lang,
    'You are an experienced EVE Online market trader. You review pre-computed, already-profitable trade candidates (net margin already accounts for broker fee + sales tax) and write a short, honest daily analysis grouped by risk level (low/medium/high, matching the riskLevel already assigned to each candidate). For each risk level actually present in the data, pick the 2-5 most attractive candidates and briefly explain why. Be honest about limitations (illiquidity, thin margins, few competing orders) instead of overselling. Respond ONLY with a single JSON object of exactly this shape: {"overview": string, "buckets": [{"level": "low"|"medium"|"high", "headline": string, "analysis": string, "topPicks": string[]}]}. Only include buckets for risk levels that actually appear in the data. No markdown, no text outside the JSON.',
    'Du bist ein erfahrener EVE-Online-Markthaendler. Du bewertest vorberechnete, bereits profitable Handelskandidaten (die Netto-Marge beruecksichtigt schon Broker Fee + Sales Tax) und schreibst eine kurze, ehrliche Tagesanalyse, gruppiert nach Risikostufe (niedrig/mittel/hoch, passend zum bereits gesetzten riskLevel-Feld jedes Kandidaten). Waehle je tatsaechlich vorhandener Risikostufe die 2-5 attraktivsten Kandidaten aus und begruende kurz warum. Sei ehrlich bei Einschraenkungen (Illiquiditaet, knappe Margen, wenige konkurrierende Orders), statt schoenzureden. Antworte AUSSCHLIESSLICH mit einem einzelnen JSON-Objekt in exakt dieser Form: {"overview": string, "buckets": [{"level": "low"|"medium"|"high", "headline": string, "analysis": string, "topPicks": string[]}]}. Nimm nur Risikostufen auf, die tatsaechlich in den Daten vorkommen. Kein Markdown, kein Text ausserhalb des JSON.',
  );
  const langInstruction = pick(lang, "Answer in English.", "Antworte auf Deutsch.");
  return `${base} ${langInstruction}`;
}

/**
 * Fragt Groqs kostenlose Chat-API nach einer Tagesanalyse der uebergebenen,
 * bereits gerankten Handelskandidaten. Wirft MissingGroqKeyError, wenn kein
 * Key hinterlegt ist - das Frontend zeigt dann einen Hinweis samt Link zu
 * den Einstellungen statt eines rohen Fehlers.
 */
export async function getGroqDailyAnalysis(candidates: ScoredCandidate[], walletBalance: number | null | undefined, lang: Lang = "en"): Promise<DailyAiAnalysis> {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new MissingGroqKeyError(lang);

  if (candidates.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      model: GROQ_MODEL,
      overview: pick(lang, "No candidates to analyze - run the analysis above first.", "Keine Kandidaten zum Analysieren - zuerst oben die Analyse ausfuehren."),
      buckets: [],
    };
  }

  const compact = candidates.slice(0, 40).map(toCompactCandidate);
  const walletNote = walletBalance
    ? pick(lang, `Available capital: ${Math.round(walletBalance).toLocaleString("en-US")} ISK.`, `Verfuegbares Kapital: ${Math.round(walletBalance).toLocaleString("de-DE")} ISK.`)
    : pick(lang, "No capital amount given - assume moderate capital.", "Kein Kapitalbetrag angegeben - gehe von moderatem Kapital aus.");

  const userPrompt = `${walletNote}\n\n${pick(lang, "Pre-computed trade candidates (JSON)", "Vorberechnete Handelskandidaten (JSON)")}:\n${JSON.stringify(compact, null, 2)}`;

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(lang) },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });
  } catch (err) {
    throw new Error(pick(lang, `Could not reach Groq: ${(err as Error).message}`, `Groq nicht erreichbar: ${(err as Error).message}`));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(pick(lang, "Groq rejected the API key (401) - please check it under Settings.", "Groq hat den API Key abgelehnt (401) - bitte in den Einstellungen pruefen."));
    }
    throw new Error(`Groq API -> ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(pick(lang, "Groq returned no content.", "Groq hat keinen Inhalt zurueckgegeben."));
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(pick(lang, "Groq's response could not be read as JSON.", "Die Antwort von Groq konnte nicht als JSON gelesen werden."));
  }

  const parsed = AnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(pick(lang, "Groq's response did not match the expected format.", "Die Antwort von Groq hatte nicht das erwartete Format."));
  }

  return {
    generatedAt: new Date().toISOString(),
    model: GROQ_MODEL,
    overview: parsed.data.overview,
    buckets: parsed.data.buckets,
  };
}
