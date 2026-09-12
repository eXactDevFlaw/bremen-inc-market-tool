# Economic Model

## Purpose

This document defines the economic rules that should be shared across
trading, hauling, industry and future economic activities.

The goal is to make calculations deterministic, inspectable and
comparable.

## Value provenance

Every important economic input should conceptually have one of these
states:

### Observed

Directly obtained from ESI/SDE or another trusted source.

Example: - current best sell order - current best buy order - market
history volume

### Derived

Calculated directly from observed data.

Example: - spread - average daily volume - total order volume

### Estimated

An approximation where the exact value is unavailable.

Example: - expected sell-through time - travel duration when only rough
route information is available

### Configured

A user/application assumption.

Example: - preferred minimum margin - assumed structure fee if not
available from data

### Unknown

The system cannot establish the value reliably.

Unknown values must not silently become zero.

## Core accounting identity

For a simple opportunity:

``` text
netProfit = grossRevenue - totalCosts
```

Where:

``` text
totalCosts =
  purchaseCosts
  + brokerFees
  + salesTaxes
  + production/jobCosts
  + transportCosts
  + otherExplicitCosts
```

Only costs that actually apply to the activity should be included.

## Margin

Use a clearly defined denominator.

For a simple resale:

``` text
netMarginPct = netProfit / grossRevenue * 100
```

Do not mix this with ROI.

## ROI

ROI should describe return relative to capital committed:

``` text
ROI = netProfit / capitalRequired * 100
```

The exact capital definition must be explicit for the opportunity.

## ISK/hour

When duration is known:

``` text
iskPerHour = netProfit / durationHours
```

If duration is unknown, ISK/hour is unknown.

Never fabricate duration just to produce a ranking number.

## Trading

A basic station-trading calculation can be represented as:

``` text
revenue = sellExecutionPrice * quantity

cost =
  buyExecutionPrice * quantity
  + buyBrokerFee
  + sellBrokerFee
  + salesTax
  + otherApplicableCosts

profit = revenue - cost
```

The exact fee base and rate must come from the configured/verified EVE
fee model.

## Hauling

A basic inter-hub opportunity:

``` text
purchaseCost = sourcePrice * quantity
revenue = destinationPrice * quantity

totalCosts =
  purchaseCost
  + applicableSourceFees
  + applicableDestinationFees
  + applicableSalesTax
  + transportCost

profit = revenue - totalCosts
```

The model must also account for: - cargo volume - ship capacity -
route/time - risk

A price difference alone is not sufficient to call something profitable.

## Industry

A production opportunity should eventually calculate:

``` text
outputRevenue
- materialCosts
- jobCosts
- otherApplicableCosts
= netProfit
```

The model must explicitly handle: - blueprint runs - material
efficiency - time efficiency - production time - system cost index -
input price source - output price source - fees/taxes where applicable

Do not subtract the value of owned materials unless the model explicitly
chooses to account for opportunity cost. If it does, label that as a
separate economic concept.

## Liquidity

Liquidity is not the same as order count.

Useful signals may include: - active order volume - historical daily
volume - spread - number of competing orders - estimated executable
quantity

The system should eventually distinguish: - theoretical profit -
executable profit - likely realized profit

## Data freshness

Market opportunities should carry a freshness indicator.

For example:

``` text
dataFetchedAt
priceAge
historyAge
```

Stale data should reduce confidence or cause the opportunity to be
excluded when freshness requirements are strict.

## Confidence

Confidence is not profit.

It should represent how trustworthy the opportunity estimate is.

Factors can include: - freshness - executable order volume - historical
volume - completeness of fee information - uncertainty in duration -
uncertainty in price realization

## Risk

Risk should be modeled separately from profit.

Possible factors: - route risk - PvP exposure - market volatility - low
liquidity - price manipulation - asset loss - execution uncertainty

A risk score should not be disguised as a monetary cost unless an
explicit expected-loss model is being used.

## Common opportunity shape

A future shared TypeScript representation should resemble:

``` text
Opportunity
  domain
  action
  item
  source
  destination
  capitalRequired
  grossRevenue
  totalCosts
  netProfit
  netMarginPct
  roiPct
  expectedDurationHours
  iskPerHour
  volume
  liquidity
  risk
  confidence
  dataFreshness
  requiredSkills
  requiredAssets
  assumptions
```

This is a conceptual contract, not a requirement to create the exact
type immediately.

## Rounding

Keep calculations at sufficient precision internally.

Round only for presentation unless EVE’s actual mechanic explicitly
requires a rounding step.

UI formatting must not alter the underlying calculation.

## Missing values

Never silently interpret: - missing price as zero - missing fee as
zero - missing volume as infinite - missing duration as zero - missing
skill as available

Use explicit nullable/unknown representations.

## Current implementation caveat

The current project contains fee and candidate calculations in
`src/trading/fees.ts` and `src/trading/analyzer.ts`.

These are the starting point for the Economic Engine refactor. Existing
formulas must be audited against current verified EVE mechanics before
being declared authoritative.

The existing implementation also contains conservative/approximate
handling for some Upwell-structure scenarios. That behavior must remain
explicitly documented until a correct generalized fee model is
implemented.

## AI boundary

AI receives economic outputs such as:

``` text
profit
margin
ROI
ISK/hour
liquidity
risk
confidence
freshness
requirements
assumptions
```

AI may explain them.

AI must not recalculate them from prose or substitute its own guessed
EVE mechanics.
