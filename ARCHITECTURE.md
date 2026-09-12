# Architecture — Bremen Inc. Market Tool

## Target architecture

``` text
                 EVE Online
                     |
              CCP ESI / SDE
                     |
             Data Access Layer
          (ESI clients, SDE data)
                     |
            Normalization / Cache
                     |
       +-------------+-------------+
       |             |             |
   Characters     Market        Industry
   Assets/Skills  Orders/History Blueprints
       |             |             |
       +-------------+-------------+
                     |
              Domain Services
                     |
              Economic Engine
                     |
             Opportunity Engine
                     |
          Decision / Optimization
                     |
              API / Application
                     |
                   UI
                     |
            Optional AI layer
          (explain/rank only)
```

## Layer responsibilities

### 1. Data access

Responsible for communicating with EVE services: - ESI - future
SDE/static data sources - authentication - API pagination -
rate/concurrency control - retries - caching where appropriate

This layer should not decide whether an activity is profitable.

### 2. Normalization/cache

Convert raw ESI/SDE responses into stable internal structures.

Important distinctions: - raw observed value - normalized value -
derived value - estimate - configured assumption - unknown

Market data should carry freshness information.

### 3. Domain services

Examples: - character service - asset service - market service -
industry service - hauling service - skill service

Domain services combine raw data into domain facts, but economic
formulas should be centralized when possible.

### 4. Economic Engine

The Economic Engine is the core financial calculation layer.

It should calculate deterministic values such as:

``` text
grossRevenue
purchaseCost
brokerFees
salesTax
jobCost
transportCost
otherCosts
totalCosts
netProfit
margin
ROI
duration
ISK/hour
```

It should receive explicit inputs and return explicit outputs.

The engine must not: - call an LLM - silently fetch random market
prices - assume missing fees - mix different fee models - hide unknown
assumptions

### 5. Opportunity Engine

Transforms domain facts + Economic Engine results into comparable
opportunities.

Examples: - station trade - inter-hub haul - manufacturing job - later
exploration run

A common opportunity model should make different activities comparable.

### 6. Decision/Optimization Engine

Future layer.

It should account for: - available capital - assets - skills -
characters - time available - risk tolerance - liquidity - opportunity
cost - current market state

It should rank feasible opportunities rather than simply ranking raw
spreads.

### 7. API/UI

The API exposes domain and opportunity results.

The UI should display values already calculated by the domain/economic
layers.

Avoid duplicating business logic in browser JavaScript.

### 8. AI

AI is optional.

It receives deterministic results and context and can: - explain -
summarize - rank - identify obvious concerns - answer natural-language
questions about the supplied results

It must not become the source of economic truth.

## Current repository mapping

``` text
src/auth/       EVE SSO / PKCE
src/db/         SQLite persistence
src/esi/        ESI data access
src/routes/     Express API
src/trading/    Current market/trading logic
src/ai/         AI advisors
public/         browser UI
scripts/        build tooling
```

## Existing architecture that should be preserved

Do not rewrite ESI/SSO or the UI merely to introduce the Economic
Engine.

The initial refactor should add a reusable economic layer and adapt
existing trading modules to it.

## Recommended future structure

A possible evolution is:

``` text
src/
  auth/
  db/
  esi/
  data/
  domain/
    characters/
    assets/
    market/
    industry/
    hauling/
    exploration/
  economics/
    fees.ts
    profit.ts
    roi.ts
    rate.ts
    liquidity.ts
    types.ts
  opportunities/
    types.ts
    trading.ts
    hauling.ts
    industry.ts
    exploration.ts
  decision/
    ranking.ts
    constraints.ts
    optimizer.ts
  ai/
  routes/
```

Do not create this exact folder structure blindly. Introduce
abstractions when the existing code and requirements justify them.

## Data flow example: trading

``` text
ESI market orders/history
        |
        v
normalized market data
        |
        v
trading opportunity builder
        |
        v
Economic Engine
  fees + costs + profit + ROI
        |
        v
Opportunity Engine
  liquidity + risk + freshness
        |
        v
ranking
        |
        +----> UI
        |
        +----> AI explanation
```

## Data flow example: industry

``` text
Blueprint + skills + ME/TE
            +
material market prices
            +
system cost index
            |
            v
      Industry calculator
            |
            v
      Economic Engine
            |
            v
       Opportunity
```

## Architectural invariant

There must be one authoritative implementation of each economic formula.

If two modules need the same calculation, the calculation belongs in the
shared economic/domain layer rather than being copied.
