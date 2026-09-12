# Project Context — Bremen Inc. Market Tool

## Purpose

Bremen Inc. Market Tool is a local-first EVE Online economic analysis
application.

It connects EVE characters through EVE SSO, retrieves relevant data
through ESI, stores local application state in SQLite, analyzes market
opportunities and presents them through a local web UI.

The product should grow from a market/trading helper into a broader
economic decision system.

## Long-term product vision

The system should eventually understand the player’s economic situation
and compare possible activities:

### Market

- current market prices
- order books
- market history
- liquidity
- regional and hub comparisons
- spreads
- arbitrage

### Trading

- station trading
- inter-hub trading
- capital requirements
- fees and taxes
- order slots
- competition
- expected turnover
- ROI and ISK/hour

### Hauling

- profitable cargo opportunities
- source/destination
- purchase/sale prices
- cargo volume
- ship capacity
- route/time
- risk
- ISK/hour

### Industry

- blueprint requirements
- material costs
- ME/TE
- production runs
- job costs
- system cost indices
- input/output prices
- opportunity cost
- production profit and ISK/hour

### Characters and skills

- all relevant characters
- skills
- skill levels
- skill queues
- market/trading skills
- industry skills
- hauling skills
- exploration skills
- required skills for opportunities
- economic value of training the next skill

### Assets

- character assets
- locations
- ships
- materials
- inventory
- market value
- liquidity/usefulness of assets

### Exploration economics

Exploration should eventually be treated as another economic activity,
not as a separate game mechanic: - expected loot value - site type -
average completion/loot time - travel time - risk - ship requirements -
skill requirements - expected ISK/hour - comparison against
trading/hauling/industry

### Decision engine

The final system should be able to answer questions such as:

- What should I trade right now?
- What should I haul right now?
- What should I manufacture?
- Which character should do it?
- Which asset should I use?
- Is it worth training a skill first?
- What gives the best expected ISK/hour for my available time and risk
  tolerance?
- What should I do with my current capital?

## Product philosophy

The tool should optimize for useful decisions, not for producing the
largest possible list of market anomalies.

A 50% spread with almost no volume may be worse than a 4% spread with
reliable daily turnover.

Economic opportunities therefore need more than price spread: -
liquidity - capital - volume - fees - duration - competition - risk -
confidence - data freshness - character/asset constraints

## User/account model

The application is local-first: - no central user account - no shared
player data - character authentication is local - tokens and settings
live in the local database - market data is retrieved from ESI - AI
requests leave the local machine only when the user invokes a configured
AI provider

The system should support multiple relevant EVE characters and
eventually reason over them together.

## Current implementation

Existing code already contains: - EVE SSO/PKCE - ESI client - character
skills/queue - assets - wallet - character/corporation information -
blueprint retrieval - industry system cost indices - market
orders/history - full-market orderbook scanning - trade hubs and
watchlist - station trading candidates - inter-hub hauling candidates -
order-slot calculations - fee calculations - basic skill advisor -
Claude trade advisor - optional Groq advisor - local SQLite - Express
API - browser UI

## Immediate objective

The immediate objective is NOT to add every planned feature.

First create a trustworthy common Economic Engine that becomes the
single source of truth for: - fees - gross revenue - total costs - net
profit - margin - ROI - duration/ISK per hour - liquidity/volume
handling - assumptions - data freshness - confidence

Then migrate existing trading/hauling calculations onto it.

This foundation should make later industry, skill optimization,
exploration and decision-engine work much easier and safer.
