// Erweiterte, "rundum"-Skillberatung fuers Handeln: Order-Slots (bestehend),
// Gebuehren-Skills, Remote-Handel und Hauling/Frachtraum-Skills. Rein
// deterministisch aus den ESI-Skilldaten berechnet, keine KI noetig.
import { computeOrderSlotAnalysis, type OrderSlotAnalysis } from "./orderSlots.js";
import { getBrokerFeePct, getSalesTaxPct } from "./fees.js";
import { pick, type Lang } from "../i18n.js";

export interface SkillLineInfo {
  skillName: string;
  currentLevel: number;
  description: string;
  nextLevelEffect?: string;
}

export interface SkillCategory {
  key: string;
  title: string;
  summary: string;
  items: SkillLineInfo[];
  recommendation?: string;
}

export interface TradingSkillProfile {
  orderSlots: OrderSlotAnalysis;
  categories: SkillCategory[];
}

function level(map: Map<string, number>, name: string): number {
  return map.get(name) ?? 0;
}

function feesCategory(map: Map<string, number>, lang: Lang): SkillCategory {
  const brokerLevel = level(map, "Broker Relations");
  const accountingLevel = level(map, "Accounting");

  const currentBrokerFee = getBrokerFeePct(brokerLevel);
  const currentSalesTax = getSalesTaxPct(accountingLevel);
  const nextBrokerFee = brokerLevel < 5 ? getBrokerFeePct(brokerLevel + 1) : null;
  const nextSalesTax = accountingLevel < 5 ? getSalesTaxPct(accountingLevel + 1) : null;

  const brokerGainPp = nextBrokerFee !== null ? currentBrokerFee - nextBrokerFee : 0;
  const taxGainPp = nextSalesTax !== null ? currentSalesTax - nextSalesTax : 0;

  let recommendation: string | undefined;
  if (nextBrokerFee === null && nextSalesTax === null) {
    recommendation = pick(lang, "Both fee skills are already trained to maximum.", "Beide Gebuehren-Skills bereits auf Maximum trainiert.");
  } else if (taxGainPp >= brokerGainPp && nextSalesTax !== null) {
    recommendation = pick(
      lang,
      `Next target: Accounting level ${accountingLevel + 1} - lowers sales tax from ${currentSalesTax.toFixed(2)}% to ${nextSalesTax.toFixed(2)}% (felt on every sale).`,
      `Naechstes Ziel: Accounting Level ${accountingLevel + 1} - senkt die Sales Tax von ${currentSalesTax.toFixed(2)}% auf ${nextSalesTax.toFixed(2)}% (spuerbar bei jedem Verkauf).`,
    );
  } else if (nextBrokerFee !== null) {
    recommendation = pick(
      lang,
      `Next target: Broker Relations level ${brokerLevel + 1} - lowers the broker fee from ${currentBrokerFee.toFixed(2)}% to ${nextBrokerFee.toFixed(2)}% (applies to every order you place).`,
      `Naechstes Ziel: Broker Relations Level ${brokerLevel + 1} - senkt die Broker Fee von ${currentBrokerFee.toFixed(2)}% auf ${nextBrokerFee.toFixed(2)}% (faellt bei jeder platzierten Order an).`,
    );
  }

  return {
    key: "fees",
    title: pick(lang, "FEES", "GEBUEHREN"),
    summary: pick(lang, `Currently: ${currentBrokerFee.toFixed(2)}% broker fee, ${currentSalesTax.toFixed(2)}% sales tax.`, `Aktuell: ${currentBrokerFee.toFixed(2)}% Broker Fee, ${currentSalesTax.toFixed(2)}% Sales Tax.`),
    items: [
      {
        skillName: "Broker Relations",
        currentLevel: brokerLevel,
        description: pick(
          lang,
          "Lowers the broker fee (applies when placing any buy/sell order, not on instant buy/sell) by 0.3 percentage points per level. Has no effect in player structures.",
          "Senkt die Broker Fee (faellt beim Platzieren jeder Buy-/Sell-Order an, nicht bei Instant-Kauf/-Verkauf) um 0.3 Prozentpunkte pro Level. Wirkt nicht in Spieler-Strukturen.",
        ),
        nextLevelEffect: nextBrokerFee !== null ? `Level ${brokerLevel + 1}: ${nextBrokerFee.toFixed(2)}% ${pick(lang, "instead of", "statt")} ${currentBrokerFee.toFixed(2)}%` : undefined,
      },
      {
        skillName: "Accounting",
        currentLevel: accountingLevel,
        description: pick(
          lang,
          "Lowers sales tax (applies on every sale, including instant-sell) by 11% of the current rate per level, down to a minimum of ~3.37%.",
          "Senkt die Sales Tax (faellt bei jedem Verkauf an, auch bei Instant-Sell) um 11% des jeweiligen Satzes pro Level, bis minimal ~3.37%.",
        ),
        nextLevelEffect: nextSalesTax !== null ? `Level ${accountingLevel + 1}: ${nextSalesTax.toFixed(2)}% ${pick(lang, "instead of", "statt")} ${currentSalesTax.toFixed(2)}%` : undefined,
      },
    ],
    recommendation,
  };
}

function remoteTradingCategory(map: Map<string, number>, lang: Lang): SkillCategory {
  const items: SkillLineInfo[] = [
    {
      skillName: "Marketing",
      currentLevel: level(map, "Marketing"),
      description: pick(lang, "Allows placing sell orders outside your current location.", "Erlaubt das Platzieren von Sell-Orders ausserhalb deines aktuellen Standorts."),
    },
    {
      skillName: "Procurement",
      currentLevel: level(map, "Procurement"),
      description: pick(lang, "Allows placing buy orders outside your current location.", "Erlaubt das Platzieren von Buy-Orders ausserhalb deines aktuellen Standorts."),
    },
    {
      skillName: "Visibility",
      currentLevel: level(map, "Visibility"),
      description: pick(lang, "Increases the maximum range of remote buy orders (up to the whole region at level 5).", "Erhoeht die maximale Reichweite von Remote-Buy-Orders (bis zur ganzen Region bei Level 5)."),
    },
    {
      skillName: "Daytrading",
      currentLevel: level(map, "Daytrading"),
      description: pick(lang, "Allows managing (modifying/cancelling) existing orders remotely.", "Erlaubt das Verwalten (Aendern/Loeschen) bestehender Orders aus der Ferne."),
    },
  ];
  const untrained = items.filter((i) => i.currentLevel === 0).length;
  return {
    key: "remote",
    title: pick(lang, "REMOTE TRADING", "REMOTE-HANDEL"),
    summary:
      untrained === items.length
        ? pick(lang, "No remote trading skills trained yet - orders currently need to be managed in person.", "Noch keine Remote-Handels-Skills trainiert - Orders muessen aktuell vor Ort verwaltet werden.")
        : pick(lang, "Only relevant if you want to run orders at multiple hubs at once.", "Nur relevant, wenn du Orders an mehreren Hubs gleichzeitig laufen lassen willst."),
    items,
    recommendation:
      untrained === items.length
        ? pick(
            lang,
            "If you want to trade at multiple hubs at once (as the Trade Analysis often suggests): Marketing + Procurement level 1 are the cheapest starting point (a few hundred thousand ISK, short training time).",
            "Wenn du (wie in der Trade-Analyse ueblich) an mehreren Hubs gleichzeitig traden willst: Marketing + Procurement Level 1 sind die guenstigste Grundlage (wenige hunderttausend ISK, kurze Trainingszeit).",
          )
        : undefined,
  };
}

const FREIGHTER_SKILLS = ["Amarr Freighter", "Caldari Freighter", "Gallente Freighter", "Minmatar Freighter"];

// EVE-Rassen-IDs sind seit jeher stabil (public /characters/{id}/ liefert race_id).
const RACE_FREIGHTER_SKILL: Record<number, string> = {
  1: "Caldari Freighter",
  2: "Minmatar Freighter",
  4: "Amarr Freighter",
  8: "Gallente Freighter",
};

function haulingCategory(map: Map<string, number>, lang: Lang, raceId?: number | null): SkillCategory {
  const industrialLevel = level(map, "Industrial");
  const transportShipsLevel = level(map, "Transport Ships");
  const homeFreighterSkill = raceId ? RACE_FREIGHTER_SKILL[raceId] : undefined;
  const freighterItems: SkillLineInfo[] = FREIGHTER_SKILLS.map((name) => ({
    skillName: name + (name === homeFreighterSkill ? pick(lang, " (your race)", " (dein Volk)") : ""),
    currentLevel: level(map, name),
    description: pick(
      lang,
      "+5% cargo hold and +5% speed for the matching freighter per level (identical across all racial freighters).",
      "+5% Frachtraum und +5% Geschwindigkeit des zugehoerigen Freighters pro Level (bei allen Volks-Freightern gleich).",
    ),
  }));

  const anyFreighterTrained = freighterItems.some((i) => i.currentLevel > 0);
  const items: SkillLineInfo[] = [
    {
      skillName: "Industrial",
      currentLevel: industrialLevel,
      description: pick(lang, "Base skill for industrial ships (haulers) - a prerequisite for larger cargo ships.", "Basis-Skill fuer Industrial-Schiffe (Hauler) - Voraussetzung fuer groessere Frachtschiffe."),
    },
    {
      skillName: "Transport Ships",
      currentLevel: transportShipsLevel,
      description: pick(lang, "Unlocks T2 haulers (Deep Space Transports) - better evasion/warp capability for riskier routes.", "Schaltet die T2-Hauler (Deep Space Transports) frei - bessere Ausweich-/Warpfaehigkeit fuer riskantere Routen."),
    },
    ...freighterItems,
  ];

  const freighterTargetLabel = homeFreighterSkill ?? pick(lang, "the freighter skill matching your race (Amarr/Caldari/Gallente/Minmatar)", "die zu deinem Volk passende Freighter-Skill (Amarr/Caldari/Gallente/Minmatar)");

  let recommendation: string;
  if (industrialLevel === 0) {
    recommendation = pick(
      lang,
      "For your own hauling (instead of just station trading): train Industrial first - the base requirement for all larger cargo ships.",
      "Fuer eigenes Hauling (statt nur Station-Trading): zuerst Industrial trainieren - Grundvoraussetzung fuer alle groesseren Frachtschiffe.",
    );
  } else if (!anyFreighterTrained) {
    recommendation = pick(
      lang,
      `Industrial is trained. Next step for bigger loads: ${freighterTargetLabel} - +5% cargo hold per level.`,
      `Industrial ist trainiert. Naechster Schritt fuer groessere Ladungen: ${freighterTargetLabel} - je +5% Frachtraum pro Level.`,
    );
  } else {
    recommendation = pick(
      lang,
      "Freighter skill(s) already trained - every further level gives +5% cargo hold and +5% speed for bigger, faster hauling runs.",
      "Freighter-Skill(s) bereits trainiert - jedes weitere Level bringt +5% Frachtraum und +5% Geschwindigkeit fuer groessere, schnellere Hauling-Runs.",
    );
  }

  return {
    key: "hauling",
    title: pick(lang, "HAULING / CARGO", "HAULING / FRACHTRAUM"),
    summary: pick(
      lang,
      "Does not affect fees, but how much cargo you can move per trip - more cargo per trip = more profit per time spent.",
      "Beeinflusst nicht die Gebuehren, sondern wie viel Ware du pro Trip transportieren kannst - mehr Fracht pro Trip = mehr Profit pro Zeitaufwand.",
    ),
    items,
    recommendation,
  };
}

const PRODUCTION_SKILLS = ["Industry", "Mass Production", "Advanced Mass Production", "Laboratory Operation", "Advanced Laboratory Operation"];

function productionCategory(map: Map<string, number>, lang: Lang): SkillCategory {
  const industryLevel = level(map, "Industry");
  const massProdLevel = level(map, "Mass Production");
  const advMassProdLevel = level(map, "Advanced Mass Production");
  const labOpsLevel = level(map, "Laboratory Operation");
  const advLabOpsLevel = level(map, "Advanced Laboratory Operation");

  const items: SkillLineInfo[] = [
    {
      skillName: "Industry",
      currentLevel: industryLevel,
      description: pick(
        lang,
        "Reduces manufacturing job time by 4% per level - felt on every single production job you run.",
        "Senkt die Fertigungsdauer um 4% pro Level - wirkt bei jedem einzelnen Produktionsjob, den du startest.",
      ),
    },
    {
      skillName: "Mass Production",
      currentLevel: massProdLevel,
      description: pick(
        lang,
        "+1 maximum active manufacturing job per level - lets you run more production lines in parallel.",
        "+1 maximal aktiver Fertigungsjob pro Level - mehr Produktionslinien gleichzeitig moeglich.",
      ),
    },
    {
      skillName: "Advanced Mass Production",
      currentLevel: advMassProdLevel,
      description: pick(
        lang,
        "+1 additional maximum active manufacturing job per level, on top of Mass Production.",
        "+1 zusaetzlicher maximal aktiver Fertigungsjob pro Level, zusaetzlich zu Mass Production.",
      ),
    },
    {
      skillName: "Laboratory Operation",
      currentLevel: labOpsLevel,
      description: pick(
        lang,
        "+1 maximum active research/copy/invention job per level - needed to prepare blueprints (ME/TE research, copying, invention).",
        "+1 maximal aktiver Forschungs-/Kopier-/Invention-Job pro Level - noetig, um Blueprints vorzubereiten (ME-/TE-Forschung, Kopieren, Invention).",
      ),
    },
    {
      skillName: "Advanced Laboratory Operation",
      currentLevel: advLabOpsLevel,
      description: pick(
        lang,
        "+1 additional maximum active research/copy/invention job per level, on top of Laboratory Operation.",
        "+1 zusaetzlicher maximal aktiver Forschungs-/Kopier-/Invention-Job pro Level, zusaetzlich zu Laboratory Operation.",
      ),
    },
  ];

  let recommendation: string;
  if (industryLevel < 5) {
    recommendation = pick(
      lang,
      `Next target: Industry level ${industryLevel + 1} - a flat time reduction on every job, the cheapest way to increase throughput before investing in more parallel job slots.`,
      `Naechstes Ziel: Industry Level ${industryLevel + 1} - senkt die Dauer jedes Jobs, der guenstigste Hebel fuer mehr Durchsatz, bevor du in weitere parallele Job-Slots investierst.`,
    );
  } else if (massProdLevel < 5 || advMassProdLevel < 5) {
    recommendation = pick(
      lang,
      "Industry is maxed. Next step: Mass Production / Advanced Mass Production - each level unlocks one more parallel manufacturing job, directly increasing how much you can build at once.",
      "Industry ist maximiert. Naechster Schritt: Mass Production / Advanced Mass Production - jedes Level schaltet einen weiteren parallelen Fertigungsjob frei und erhoeht direkt, wie viel du gleichzeitig bauen kannst.",
    );
  } else if (labOpsLevel < 5 || advLabOpsLevel < 5) {
    recommendation = pick(
      lang,
      "Manufacturing slots are maxed. Next step: Laboratory Operation / Advanced Laboratory Operation - more parallel research/copy jobs so blueprint prep no longer bottlenecks production.",
      "Fertigungs-Slots sind maximiert. Naechster Schritt: Laboratory Operation / Advanced Laboratory Operation - mehr parallele Forschungs-/Kopier-Jobs, damit die Blueprint-Vorbereitung die Produktion nicht mehr ausbremst.",
    );
  } else {
    recommendation = pick(lang, "All core production skills are already trained to maximum.", "Alle zentralen Produktions-Skills sind bereits auf Maximum trainiert.");
  }

  return {
    key: "production",
    title: pick(lang, "PRODUCTION", "PRODUKTION"),
    summary: pick(
      lang,
      "Determines how fast you can manufacture and how many jobs you can run in parallel - both feed directly into how much you can produce (and sell) per day.",
      "Bestimmt, wie schnell du fertigst und wie viele Jobs du parallel laufen lassen kannst - beides wirkt sich direkt darauf aus, wie viel du pro Tag produzieren (und verkaufen) kannst.",
    ),
    items,
    recommendation,
  };
}

export function buildTradingSkillProfile(skillLevelsByName: Map<string, number>, raceId?: number | null, lang: Lang = "en"): TradingSkillProfile {
  return {
    orderSlots: computeOrderSlotAnalysis(skillLevelsByName),
    categories: [
      feesCategory(skillLevelsByName, lang),
      remoteTradingCategory(skillLevelsByName, lang),
      haulingCategory(skillLevelsByName, lang, raceId),
      productionCategory(skillLevelsByName, lang),
    ],
  };
}

// ---------- Focus-based, profit-ordered skill plan ----------
//
// Die Kategorien oben sind rein informativ und ueberlassen die Priorisierung
// dem Spieler. Hier wird stattdessen - abhaengig vom gewaehlten Profit-Fokus
// (Hauling/Trading/Production) - eine feste, nach Profit-Wirkung sortierte
// Schrittliste ausgegeben: was als naechstes trainiert werden sollte, und
// warum, statt nur zu beschreiben was die Skills tun.

export type ProfitFocus = "trading" | "hauling" | "production";

export interface SkillPlanStep {
  order: number;
  skillName: string;
  currentLevel: number;
  targetLevel: number;
  reason: string;
}

export interface FocusedSkillPlan {
  focus: ProfitFocus;
  title: string;
  intro: string;
  steps: SkillPlanStep[];
  completedCount: number;
  totalCount: number;
}

interface PlanBlueprintItem {
  skillName: string;
  targetLevel: number;
  reason: string;
}

function tradingBlueprint(lang: Lang): PlanBlueprintItem[] {
  return [
    {
      skillName: "Broker Relations",
      targetLevel: 4,
      reason: pick(
        lang,
        "The broker fee applies on every single order you place - the single biggest lever for anyone trading frequently.",
        "Die Broker Fee faellt bei jeder platzierten Order an - der groesste einzelne Hebel fuer haeufiges Traden.",
      ),
    },
    {
      skillName: "Accounting",
      targetLevel: 4,
      reason: pick(
        lang,
        "Sales tax applies on every sale, including instant-sell - a steady, guaranteed saving on all turnover.",
        "Die Sales Tax faellt bei jedem Verkauf an, auch bei Instant-Sell - eine verlaessliche Ersparnis auf den gesamten Umsatz.",
      ),
    },
    {
      skillName: "Marketing",
      targetLevel: 1,
      reason: pick(
        lang,
        "Unlocks remote sell orders - lets you run orders at multiple hubs without traveling to each one.",
        "Schaltet Remote-Sell-Orders frei - Orders an mehreren Hubs, ohne dorthin reisen zu muessen.",
      ),
    },
    {
      skillName: "Procurement",
      targetLevel: 1,
      reason: pick(
        lang,
        "Unlocks remote buy orders - the buying-side counterpart to Marketing.",
        "Schaltet Remote-Buy-Orders frei - das Kauf-Pendant zu Marketing.",
      ),
    },
    {
      skillName: "Broker Relations",
      targetLevel: 5,
      reason: pick(lang, "Squeezes out the last bit of broker fee reduction.", "Holt den letzten Rest an Broker-Fee-Reduktion heraus."),
    },
    {
      skillName: "Accounting",
      targetLevel: 5,
      reason: pick(lang, "Squeezes out the last bit of sales tax reduction.", "Holt den letzten Rest an Sales-Tax-Reduktion heraus."),
    },
    {
      skillName: "Visibility",
      targetLevel: 4,
      reason: pick(
        lang,
        "Extends the range of remote buy orders toward the whole region - more candidate items reachable without traveling.",
        "Erweitert die Reichweite von Remote-Buy-Orders in Richtung der ganzen Region - mehr erreichbare Items ohne zu reisen.",
      ),
    },
    {
      skillName: "Daytrading",
      targetLevel: 3,
      reason: pick(
        lang,
        "Lets you modify/cancel existing orders remotely - reprice without traveling back and forth.",
        "Erlaubt das Aendern/Loeschen bestehender Orders aus der Ferne - Repricing ohne Hin- und Herreisen.",
      ),
    },
  ];
}

function haulingBlueprint(lang: Lang, raceId?: number | null): PlanBlueprintItem[] {
  const homeFreighterSkill = raceId ? RACE_FREIGHTER_SKILL[raceId] : undefined;
  const freighterLabel = homeFreighterSkill ?? pick(lang, "your race's Freighter skill (Amarr/Caldari/Gallente/Minmatar)", "die Freighter-Skill deines Volks (Amarr/Caldari/Gallente/Minmatar)");
  return [
    {
      skillName: "Industrial",
      targetLevel: 5,
      reason: pick(
        lang,
        "Base requirement for every larger cargo ship - has to come first.",
        "Grundvoraussetzung fuer alle groesseren Frachtschiffe - muss zuerst trainiert werden.",
      ),
    },
    {
      skillName: "Transport Ships",
      targetLevel: 4,
      reason: pick(
        lang,
        "Unlocks T2 haulers (Deep Space Transports) - better evasion/warp for getting valuable cargo through riskier routes.",
        "Schaltet T2-Hauler (Deep Space Transports) frei - bessere Ausweich-/Warpfaehigkeit, um wertvolle Fracht sicherer durch riskante Routen zu bringen.",
      ),
    },
    {
      skillName: freighterLabel,
      targetLevel: 4,
      reason: pick(
        lang,
        "+5% cargo hold and +5% speed per level - the biggest single lever for how much you move per trip, i.e. profit per time spent.",
        "+5% Frachtraum und +5% Geschwindigkeit pro Level - der groesste einzelne Hebel dafuer, wie viel du pro Trip bewegst, also Profit pro Zeitaufwand.",
      ),
    },
    {
      skillName: freighterLabel,
      targetLevel: 5,
      reason: pick(lang, "Squeezes out the last bit of cargo hold and speed.", "Holt den letzten Rest an Frachtraum und Geschwindigkeit heraus."),
    },
    {
      skillName: "Transport Ships",
      targetLevel: 5,
      reason: pick(lang, "Final polish on the T2 hauler for the riskiest routes.", "Letzter Feinschliff am T2-Hauler fuer die riskantesten Routen."),
    },
  ];
}

function productionBlueprint(lang: Lang): PlanBlueprintItem[] {
  return [
    {
      skillName: "Industry",
      targetLevel: 5,
      reason: pick(
        lang,
        "A flat 4%-per-level time reduction on every manufacturing job - the cheapest throughput gain before investing in more job slots.",
        "Eine feste Zeitreduktion von 4% pro Level auf jeden Fertigungsjob - der guenstigste Durchsatz-Gewinn, bevor in weitere Job-Slots investiert wird.",
      ),
    },
    {
      skillName: "Mass Production",
      targetLevel: 5,
      reason: pick(
        lang,
        "+1 parallel manufacturing job slot per level - directly more units built at the same time.",
        "+1 paralleler Fertigungs-Job-Slot pro Level - direkt mehr Einheiten gleichzeitig gebaut.",
      ),
    },
    {
      skillName: "Advanced Mass Production",
      targetLevel: 5,
      reason: pick(
        lang,
        "+1 additional parallel manufacturing job slot per level, on top of Mass Production.",
        "+1 zusaetzlicher paralleler Fertigungs-Job-Slot pro Level, zusaetzlich zu Mass Production.",
      ),
    },
    {
      skillName: "Laboratory Operation",
      targetLevel: 5,
      reason: pick(
        lang,
        "+1 parallel research/copy/invention job slot per level - keeps blueprint prep from bottlenecking your now-larger manufacturing capacity.",
        "+1 paralleler Forschungs-/Kopier-/Invention-Job-Slot pro Level - verhindert, dass die Blueprint-Vorbereitung die inzwischen groessere Fertigungskapazitaet ausbremst.",
      ),
    },
    {
      skillName: "Advanced Laboratory Operation",
      targetLevel: 5,
      reason: pick(
        lang,
        "+1 additional parallel research/copy/invention job slot per level, on top of Laboratory Operation.",
        "+1 zusaetzlicher paralleler Forschungs-/Kopier-/Invention-Job-Slot pro Level, zusaetzlich zu Laboratory Operation.",
      ),
    },
  ];
}

const FOCUS_TITLES: Record<ProfitFocus, [string, string]> = {
  trading: ["TRADING SKILL PLAN", "TRADING-SKILLPLAN"],
  hauling: ["HAULING SKILL PLAN", "HAULING-SKILLPLAN"],
  production: ["PRODUCTION SKILL PLAN", "PRODUKTIONS-SKILLPLAN"],
};

const FOCUS_INTROS: Record<ProfitFocus, [string, string]> = {
  trading: [
    "A fixed, profit-ordered training order for station/remote trading - lower fees first, then reach.",
    "Eine feste, nach Profit-Wirkung sortierte Trainingsreihenfolge fuer Station-/Remote-Trading - zuerst Gebuehren senken, dann Reichweite.",
  ],
  hauling: [
    "A fixed, profit-ordered training order for hauling - bigger, faster cargo runs come first.",
    "Eine feste, nach Profit-Wirkung sortierte Trainingsreihenfolge fuers Hauling - groessere, schnellere Frachtruns zuerst.",
  ],
  production: [
    "A fixed, profit-ordered training order for manufacturing - faster jobs first, then more of them in parallel.",
    "Eine feste, nach Profit-Wirkung sortierte Trainingsreihenfolge fuer die Fertigung - zuerst schnellere Jobs, dann mehr davon parallel.",
  ],
};

/**
 * Liefert - fuer den gewaehlten Profit-Fokus - eine feste, nach Profit-Wirkung
 * priorisierte Schrittliste (nur die noch offenen Schritte, in Trainings-
 * reihenfolge), statt wie die Kategorien oben nur zu beschreiben was Skills
 * tun und die Priorisierung dem Spieler zu ueberlassen.
 */
export function buildFocusedSkillPlan(skillLevelsByName: Map<string, number>, focus: ProfitFocus, lang: Lang = "en", raceId?: number | null): FocusedSkillPlan {
  const blueprint =
    focus === "trading" ? tradingBlueprint(lang) : focus === "hauling" ? haulingBlueprint(lang, raceId) : productionBlueprint(lang);

  const allSteps = blueprint.map((bp) => {
    const currentLevel = level(skillLevelsByName, bp.skillName);
    return { skillName: bp.skillName, currentLevel, targetLevel: bp.targetLevel, reason: bp.reason, done: currentLevel >= bp.targetLevel };
  });

  const steps: SkillPlanStep[] = allSteps
    .filter((s) => !s.done)
    .map((s, i) => ({ order: i + 1, skillName: s.skillName, currentLevel: s.currentLevel, targetLevel: s.targetLevel, reason: s.reason }));

  const [titleEn, titleDe] = FOCUS_TITLES[focus];
  const [introEn, introDe] = FOCUS_INTROS[focus];

  return {
    focus,
    title: pick(lang, titleEn, titleDe),
    intro: pick(lang, introEn, introDe),
    steps,
    completedCount: allSteps.length - steps.length,
    totalCount: allSteps.length,
  };
}
