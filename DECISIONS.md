# Architecture & Product Decisions

## D001 — Deterministic economics are authoritative

Economic facts must be calculated by code from supplied market/game
data.

AI is never authoritative for: - prices - fees - taxes - production
inputs - profits - ROI - ISK/hour - EVE mechanics

Reason: reproducibility, auditability and trust.

## D002 — One Economic Engine

Trading, hauling, industry and later exploration should share the same
economic primitives.

Reason: prevents inconsistent profit calculations.

## D003 — Explicit assumptions

When a value is estimated or configured, the system should say so.

Examples: - estimated daily volume - assumed sell-through - estimated
travel duration - configured structure fee

Reason: users need to understand why an opportunity looks profitable.

## D004 — Data freshness matters

Current market prices and historical values must not be treated as
equally fresh.

Opportunity results should expose freshness where relevant.

## D005 — Liquidity matters

A high percentage spread is not automatically a good trade.

Ranking should account for: - order volume - daily market volume -
capital - competition - execution probability

## D006 — Preserve local-first design

The application remains local-first.

User-specific data should remain local except for deliberate external
requests such as ESI or AI API calls.

## D007 — Multiple characters are first-class

The final economic model should reason across all relevant characters,
not only the currently selected character.

## D008 — Skills are economic constraints

Skills are not just a display feature. They determine which
opportunities are feasible and how profitable/efficient they are.

## D009 — Assets are economic constraints and resources

Assets affect: - available capital - available ships - production
inputs - inventory opportunities - hauling capacity

## D010 — Avoid premature rewrites

The current project already has working functionality.

Refactor incrementally and preserve working behavior unless there is a
documented reason to change it.

## D011 — Official sources for game mechanics

When implementing EVE mechanics, prefer official CCP/ESI/SDE
information. If verification is unavailable, use an explicit
configurable/unknown value instead of inventing a rule.

## D012 — Common opportunity model

Different activities should eventually be comparable through a shared
opportunity representation.

Core fields include: - domain - action - item - source/destination -
capital - revenue - costs - profit - margin - ROI - duration -
ISK/hour - volume/liquidity - risk - confidence - freshness -
requirements - assumptions

## D013 — Fix margin/ROI conflation between station trading and hauling

Before Phase 1, `trading/fees.ts` defined `netMarginPct` two different
ways: `netStationTradeProfit()` divided by `bestSell` (= revenue,
correct per D012/the margin definition), but `netHaulProfit()` divided
by `buyPrice` (= capital invested — which is the definition of ROI,
not margin). This made station-trading and hauling opportunities not
honestly comparable, and silently mislabeled a real ROI figure as a
margin.

Decision: `netMarginPct = netProfit / grossRevenue * 100` for BOTH
strategies, unified in `economics/profit.ts`
(`computeStationTradeProfit`/`computeHaulProfit`). A new, separate
`roiPct = netProfit / capitalRequired * 100` is introduced in
`economics/roi.ts`. The previous hauling "netMarginPct" number is not
lost — it is numerically identical to the new `roiPct` and is exposed
under that name in `ScoredCandidate` (`trading/scoring.ts`) and in the
`/api/trading/route` single-item response.

User-visible effect: displayed `netMarginPct` for hauling candidates
is now smaller than before the fix (it was previously the ROI number).
The old number is still available, now correctly labeled as `roiPct`.

Also fixed in the same pass: `trading/marketData.ts`'s
`recentAverageVolume()` previously returned `0` when no ESI trade
history was available, which was indistinguishable from a genuinely
observed volume of zero. It now returns `null` for "unknown", and
callers (`trading/analyzer.ts`) carry an explicit `avgDailyVolumeKnown`
flag through to `ScoredCandidate` so risk assessment and the AI
advisor treat "unknown liquidity" differently from "confirmed very low
liquidity" (see D003/D011, "never silently interpret missing data as
zero").

## D014 — Provisional capitalRequired; duration/ISK-per-hour left unknown in Phase 1

`capitalRequired` in `ScoredCandidate`/the `/route` single-item
response is, for now, the purchase price PER UNIT (station: `bestBuy`;
hauling: `buyPrice`) — not a real order-size/position-size capital
figure. This is an explicit, provisional simplification: a quantity
and order-sizing model does not exist yet. It is documented as such in
`ScoredCandidate.assumptions` on every result. When real order-size
modeling is added, `capitalRequired` and `roiPct` (D013) will be
recomputed against actual committed capital instead of a per-unit
price.

`expectedDurationHours` and `iskPerHour` are always `null` in Phase 1.
No reliable timing data (travel time, order fill time) is available
yet, and per D003/D011 the system must not invent an estimated
duration just to produce a ranking number. These fields exist in
`ScoredCandidate` now (as `null`) so the shape is ready for real values
once duration modeling exists, without another breaking change later.

## D015 — Remove the unused Anthropic trade advisor

`src/ai/tradeAdvisor.ts` (an Anthropic/Claude-based advisor with its
own `rankByOpportunity()` scoring heuristic) was confirmed, via a
repo-wide search, to have no importers anywhere in `src/` or
`public/js/` — it was fully dead code, superseded by the active Groq
advisor (`src/ai/groqAdvisor.ts`). Removed as legacy code rather than
reactivated, per D010 (avoid carrying unused/duplicate logic forward).

The Anthropic API key settings plumbing (`getAnthropicApiKey`/
`setAnthropicApiKey` in `settings.ts`, the `anthropicApiKey`/
`anthropicKeyConfigured` fields in `routes/settings.ts`) was
deliberately KEPT — it is harmless, out of scope for Phase 1, and may
be reused if a future Anthropic-based AI explanation layer is built on
top of the new Economic Engine (see CLAUDE.md's AI boundary: AI may
explain/rank already-computed deterministic data, never calculate it
itself).

## D016 — Score/Risk/Liquidity assumptions made explicit (Phase 2 Step 4, no behavior change)

Phase 2 Step 4 is a documentation-only audit of assumptions already
present in `src/trading/scoring.ts` (and, for one adjacent
disambiguation, `src/trading/analyzer.ts`). Nothing in this entry
changes any formula, threshold, or output — it records the exact
current behavior, verified against the code as of Phase 2 Step 3, so
it stays traceable going forward (per D003/D011). Short pointers to
this entry were added at the corresponding lines in `scoring.ts`/
`analyzer.ts`; the full explanation lives here only, to avoid the same
material being written three times.

### Score formula (verified against code, unchanged)

```text
score = netMarginPct * log10(avgDailyVolume + 2) / riskPenalty(riskLevel)
```

(`rankCandidatesLocally` → `scoreStation`/`scoreHaul` in
`trading/scoring.ts`.)

- `netMarginPct` — `netProfit / grossRevenue * 100`, taken unchanged
  from the authoritative `economics/profit.ts` (`ProfitBreakdown.netMarginPct`,
  see D013). Fee- and tax-aware, computed per candidate.
- `avgDailyVolume` — a liquidity **proxy** (see "Liquidity" below), not
  a verified execution capacity: recent average daily traded volume
  from ESI history, or a `0` placeholder when unknown (see "Unknown ≠
  zero" below — the placeholder is never mistaken for an observed zero
  by the risk logic, see next section).
- `log10(avgDailyVolume + 2)` — dampens the influence of volume so
  very high-volume items don't dominate the ranking purely linearly;
  `+2` keeps the term positive and non-collapsing even at
  `avgDailyVolume = 0` (`log10(2) ≈ 0.30`) instead of `-Infinity`/`0`
  at the low end. A **configured** scaling choice, not derived from any
  EVE mechanic or statistical model.
- `riskPenalty(riskLevel)` — a configured divisor: `low → 1`,
  `medium → 1.35`, `high → 2.2` (`riskPenalty()` in `scoring.ts`). Not
  derived from measured loss probabilities; a heuristic weighting.
- The resulting `score` is a **dimensionless ranking heuristic**, not
  an economic quantity — it cannot be compared to ISK, cannot be
  summed across candidates, and is intentionally allowed to change
  (weights, shape) in a later phase **without** implying any change to
  `src/economics/*` (D002 continues to hold: the Economic Engine stays
  the sole source of economic truth; the score is downstream of it,
  not part of it).

There is a second, unrelated `rawScore`/`liquidityProxy` heuristic in
`trading/analyzer.ts` (`findTradeCandidatesFullMarket`), used only to
shortlist raw candidates — by `spreadPct`/`profitPct` and order count,
**before** fees and **before** real trade volume are known — down to
`FULL_MARKET_CANDIDATE_CAP` before the (expensive) history fetch. It
shares the `log10(x + 2)` shape and similar naming by coincidence, not
by design. It is **not** the ranking score documented above and does
not feed into it. Flagged here only to prevent confusion between the
two; not in scope to change.

### Risk levels & thresholds (verified against `assessRisk()`, unchanged)

`assessRisk()` evaluates conditions **in order, first match wins** —
the order itself is load-bearing and must be preserved if this
function is ever touched:

1. `competingOrders < 2` → **high** ("very few competing orders")
2. `!avgDailyVolumeKnown` → **medium** ("liquidity unknown, not
   confirmed low") — this check runs **before** the volume-value check
   below specifically so an unknown volume (placeholder `0`) is never
   read as a confirmed low volume.
3. `avgDailyVolume < 1` → **high** ("very low liquidity")
4. `netMarginPct < 3` → **high** ("very thin net margin")
5. `avgDailyVolume < 15 || competingOrders < 5` → **medium**
   ("moderate liquidity")
6. otherwise → **low**

All five threshold values (`2`, `1`, `3`, `15`, `5`) and the three
`riskPenalty` divisors are **configured heuristics** — chosen, not
measured or sourced from CCP/ESI mechanics (per D011, this is made
explicit rather than presented as verified game data).

**Inputs, and which are real market data vs. derived heuristics:**

- `avgDailyVolume`/`avgDailyVolumeKnown` — derived from observed ESI
  trade history (`recentAverageVolume`, see D013); genuinely observed
  when known.
- `competingOrders` for **station trading** —
  `Math.min(sellOrderCount, buyOrderCount)`, a real, observed count of
  resting orders at the hub.
- `competingOrders` for **hauling** — **not** a real order count. It
  is a synthetic placeholder: `avgDailyVolumeKnown && avgDailyVolume >= 1
  ? 5 : 0` (`scoreHaul()`). This is the exact placeholder the Phase 2
  plan flags for replacement in Step 6 ("real `competingOrders` for
  hauling") — Step 4 documents it as-is and does not change it.
- `netMarginPct` — real, fee-aware, from the Economic Engine.
- `executableQuantity` (added in Step 2) is **not** read anywhere in
  `assessRisk()`/`scoring.ts` today — it exists on the candidate types
  but does not yet influence risk, confidence, or score. Noted as an
  open gap, not fixed here (see "Liquidity" below).

### Liquidity — current state vs. target separation

`docs/economic-model.md` ("Liquidity"/"Confidence"/"Risk" sections)
already states the target: Liquidity, Confidence and Risk are three
separate questions. As implemented today (Phase 2, pre-Opportunity-
layer):

- There is **no dedicated `liquidity` field** on `ScoredCandidate` or
  `TradeCandidate`. The `Opportunity.liquidity: Provenanced<number>`
  field in `economics/types.ts` is an aspirational target shape (see
  its own comment) — unused anywhere in the current code.
- What stands in for liquidity today is `avgDailyVolume`/
  `avgDailyVolumeKnown` and `competingOrders` — and both are fed
  **directly into both** `riskLevel` (via `assessRisk`) **and**
  `confidence` (via `economics/liquidity.ts#computeConfidence`). The
  same two raw signals answer two conceptually different questions
  ("how risky is this" vs. "how much do I trust the data") without
  first being separated into a distinct liquidity signal. This is
  exactly the kind of blurring the target model wants to avoid —
  recorded here as an **open gap**, intentionally not fixed in this
  step (the Phase 2 plan schedules the actual separation for the
  Opportunity layer, Step 5+).
- `executableQuantity` (Step 2) is the most concrete, least-heuristic
  executability signal available today (a real summed `volume_remain`
  at the best price, not an estimate) — and is currently **not
  consumed** by risk/confidence/score at all. It is the natural
  candidate to eventually become (or feed) the real `liquidity` signal
  once the Opportunity layer exists.
- `volume` (as a term) is ambiguous across the codebase today and
  should not be treated as one concept: `avgDailyVolume` (historical,
  ESI-history-derived), `executableQuantity` (instant, order-book-
  derived), order counts (`competingOrders`/`sellOrderCount`/
  `buyOrderCount`), and data age (`dataAgeSeconds`) are four
  **different** signals with different provenance and different
  meaning, currently combined ad hoc rather than through one
  documented model.

### Unknown ≠ zero (reaffirmed, cataloged)

The rule from `docs/economic-model.md` ("Missing values") already
applies and is unchanged by this step. Current representations,
catalogued for clarity — two different type-level patterns coexist:

- **Paired boolean-twin pattern** (a Phase 1 API-compatibility choice):
  `avgDailyVolume: number` stays `0` as a documented placeholder when
  unknown, with `avgDailyVolumeKnown: boolean` as the actual source of
  truth; every consumer (`assessRisk`, `computeConfidence` via
  `deriveVolumeSignal`, `buildAssumptions`) is required to check the
  flag, never the raw number, when deciding "known vs. unknown."
- **True-nullable pattern** (used for values added after Phase 1):
  `executableQuantity: number | null` (Step 2), `roiPct: number | null`
  (`null` when `capitalRequired <= 0`), `expectedDurationHours`/
  `iskPerHour: number | null` (always `null` in Phase 2 — no reliable
  timing data exists yet, per D014; deliberately not estimated just to
  produce a number).
- `dataAgeSeconds` is `undefined` specifically when data was just
  fetched live with no cache involved (documented in `analyzer.ts` as
  "practically fresh, treat as 0s") — `ageSeconds = c.dataAgeSeconds ?? 0`
  in `scoring.ts` is therefore an intentional, documented modeling
  choice ("no cache in play ⇒ definitionally fresh"), not a silent
  unknown→zero coercion of missing information.

### Provenance (`Provenanced<T>`, `economics/types.ts`)

`Provenanced<T>` exists and does real work in exactly one place today:
`economics/liquidity.ts#deriveVolumeSignal` wraps the raw
`avgDailyVolume`/`avgDailyVolumeKnown` pair into a `Provenanced<number>`
immediately before `computeConfidence` consumes it (an `"unknown"`
provenance yields the fixed `CONFIDENCE_UNKNOWN_VOLUME_SCORE` baseline
instead of a computed score). Outside of that one internal call site,
`Provenanced<T>` is **not** used — `ScoredCandidate` and every API
response stay flat (paired-boolean or nullable fields, see above), by
explicit Phase 1 design (`economics/types.ts`'s own comment: kept flat
"for compatibility reasons," to avoid breaking existing UI/AI
consumers). No provenance refactor is done or proposed here (out of
scope for this step).

### Configured heuristic vs. economic truth (architectural principle, reaffirmed)

Net Profit, grossRevenue, totalCosts, netMarginPct, ROI are the
Economic Engine's authoritative output (`src/economics/*`, D001/D002)
— audited, tested, unchanged by ranking concerns. `score`,
`riskPenalty`, the `assessRisk` thresholds, and the `computeConfidence`
weights/ceilings are, by contrast, **configured heuristics** layered on
top for ranking/UX purposes — they may be tuned, replaced, or
reweighted in a later phase without implying any change to what is
economically true about a candidate. This mirrors D002's existing rule
and is restated here explicitly because Step 4 exists precisely to
make that boundary visible in the places (`scoring.ts`,
`economics/liquidity.ts`) where both kinds of values sit side by side.
