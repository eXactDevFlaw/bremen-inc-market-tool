# Claude Development Guide — Bremen Inc. Market Tool

## 1. Role

You are the coding agent for the Bremen Inc. Market Tool. Work
conservatively, understand the existing code before changing it, and
keep the application working after every change.

This repository is an EVE Online economic-analysis application. The
long-term objective is a unified system that can compare trading,
hauling, industry, assets, skills and exploration economics and
eventually answer:

> What is the best economic action for this player/character/account
> right now?

## 2. Mandatory rules

1.  Read `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
    `DECISIONS.md` and `docs/economic-model.md` before making
    architectural changes.
2.  Inspect the existing implementation before creating a new
    abstraction.
3.  Do not duplicate economic calculations when an existing shared
    service can be extended.
4.  Deterministic calculations are the source of truth. AI must never
    invent prices, fees, EVE mechanics, production inputs, volumes or
    profits.
5.  Prefer official CCP/ESI/SDE data for EVE mechanics. If a mechanic
    cannot be verified, mark it as unknown/configurable rather than
    inventing it.
6.  Preserve working ESI, SSO, local database and UI functionality
    unless the change explicitly requires otherwise.
7.  Do not silently change economic assumptions. Document material
    changes in `DECISIONS.md`.
8.  Keep observed data separate from derived/estimated/configured
    values.
9.  Handle missing or stale data explicitly.
10. Never commit secrets, OAuth tokens, API keys, local databases or
    user-specific runtime data.
11. After changes, run at least `npm run typecheck`. Add/run tests for
    economic logic.
12. Make changes incrementally. Do not perform a large rewrite merely
    for style.

## 3. Preferred implementation order

When extending the project, favor this dependency order:

ESI/SDE data → normalization/cache → domain services → shared Economic
Engine → Opportunity Engine → Decision/Optimization Engine → API → UI →
optional AI explanation

The Economic Engine should be reusable by trading, hauling, industry and
later exploration.

## 4. Economic truth

Every opportunity should ultimately be representable with concepts such
as:

- action/domain
- item
- source/destination
- capital required
- gross revenue
- total costs
- net profit
- net margin
- ROI
- expected duration
- ISK/hour
- volume
- liquidity
- risk
- confidence
- data freshness
- required skills/assets
- assumptions

Do not calculate a displayed “profit” in the UI using a different
formula from the API/domain layer.

## 5. AI boundary

AI is an explanation/ranking layer, not the economic calculator.

Good: - explain why a deterministic opportunity is attractive - compare
already-calculated opportunities - describe risks - produce
human-readable summaries - rank opportunities when all relevant
deterministic inputs are supplied

Bad: - guessing current EVE prices - inventing transaction fees -
calculating production costs independently - assuming skills or assets
that were not supplied - replacing deterministic calculations with an
LLM

## 6. Working protocol

For a substantial task:

1.  Read the relevant documentation.
2.  Inspect affected existing modules.
3.  State the implementation plan.
4.  Identify files to change/create.
5.  Implement the smallest coherent increment.
6.  Typecheck.
7.  Test economic calculations.
8.  Review for duplicated formulas and stale assumptions.
9.  Summarize what changed and what remains.

Do not start coding from an ambiguous feature request if a short
architectural clarification is needed. Make reasonable assumptions only
when they are explicitly documented.

## 7. Current project reality

This is an existing v0.1 application, not a greenfield system. Existing
functionality includes EVE SSO/PKCE, character data, assets, wallet
data, market orders/history, hub analysis, hauling candidates, industry
cost indices/blueprints, local SQLite, a web UI and Claude/Groq
integrations.

The first major architectural improvement is therefore to consolidate
economic logic into a shared, testable Economic Engine without breaking
the current application.
