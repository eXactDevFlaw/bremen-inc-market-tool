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
