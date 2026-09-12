# Roadmap — Bremen Inc. Market Tool

## Phase 0 — Project foundation

Status: current

- Keep the existing application working.
- Establish project documentation.
- Establish architectural rules.
- Establish deterministic economic calculation principles.
- Add tests around economic calculations.

## Phase 1 — Common Economic Engine

Priority: highest

Create a shared, deterministic calculation layer.

### Goals

- central fee model
- broker fee calculation
- sales tax calculation
- purchase cost
- sales revenue
- total costs
- net profit
- margin
- ROI
- duration
- ISK/hour
- explicit assumptions
- data freshness
- confidence

### Migration

Find existing calculations in: - `src/trading/fees.ts` -
`src/trading/analyzer.ts` - other trading/route modules

Move duplicated economic formulas into the shared engine.

Do not change behavior without documenting why.

### Tests

Test: - fee calculations - zero/negative edge cases - profit - margin -
ROI - duration/ISK-hour - missing/unknown inputs - rounding behavior

## Phase 2 — Trading Intelligence

Improve trading opportunities using: - actual executable prices -
available order volume - market history - capital constraints - order
slots - fees - liquidity - competition - confidence - data freshness

Distinguish: - station trading - inter-hub arbitrage - speculative
opportunities

Do not rank solely by spread percentage.

## Phase 3 — Hauling Engine

Add: - source purchase - destination sale - cargo volume - ship
capacity - route distance/time - transport constraints - risk - expected
duration - ISK/hour

Eventually compare multiple ships and characters.

## Phase 4 — Industry Engine

Expand existing blueprint/industry support: - materials - quantities -
ME/TE - runs - job costs - system cost index - input prices - output
prices - production time - opportunity cost - profit - ROI - ISK/hour

Industry calculations must use the same Economic Engine.

## Phase 5 — Unified Characters + Assets

Create a unified account-level economic model: - all characters -
skills - queues - wallets - orders - assets - locations - ships -
materials

The system should know which character can actually perform an
opportunity.

## Phase 6 — Skill Optimizer

Replace generic skill advice with marginal economic analysis.

Example question:

> If I train Skill X from IV to V, what additional profitable
> opportunities become possible and what economic value do they create?

Consider: - unlocked opportunities - reduced fees - increased order
capacity - increased production output/efficiency - hauling capacity -
time saved - training time

Do not simply recommend “train everything to V.”

## Phase 7 — Exploration Economics

Model exploration as an economic activity.

Possible inputs: - site type - expected loot - completion time - travel
time - ship - skills - risk - region - historical results

Output: - expected value - expected ISK/hour - risk-adjusted value -
opportunity comparison

## Phase 8 — Decision Engine

Combine everything:

``` text
characters
+ skills
+ assets
+ capital
+ market
+ industry
+ routes
+ exploration
+ time
+ risk
        |
        v
"What should I do now?"
```

The engine should filter impossible opportunities first, then rank
feasible ones.

## Phase 9 — AI assistant

Only after deterministic foundations are reliable.

AI should: - explain opportunities - answer natural-language questions -
summarize why something is recommended - discuss trade-offs - help
explore scenarios

AI should consume structured deterministic data.

## Phase 10 — Product polish

- better UI
- historical opportunity tracking
- alerts
- configurable preferences
- background refresh
- export
- richer charts
- packaging/releases
- Windows/macOS/Linux builds
- optional integrations

## Guiding rule

Do not rush to Phase 9.

A brilliant AI explanation built on incorrect economics is worse than a
simple deterministic calculator.
