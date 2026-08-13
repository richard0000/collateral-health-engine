# Smoke Test Guide & Output Documentation

This document explains the purpose, workflow, and expected output of the visual state transition smoke test script located at [smoke.ts](file:///Users/ricardogamarra/Code/collateral-health-engine/src/smoke.ts).

---

## Running the Smoke Test

The smoke test compiles the TypeScript files and runs the resulting JavaScript code under Node.js:

```bash
npm run smoke
```

---

## Interactive Workflow Verification

The smoke test simulates a chronological lifecycle of a collateral arrangement position, demonstrating LTV limits, hysteresis cures, link events, and state locks.

### Step 1: Setup Worked Example (Ordinary Recompute)

The script initializes a position using the exact parameters from the prompt's worked example:

- **Collateral**: 2 BTC
- **Price**: $30,000 USDC/BTC
- **Outstanding Debt**: $42,000 USDC
- **LTV Thresholds**: Initial 50% ($30k Limit) | Maintenance 65% ($39k Limit) | Liquidation 80% ($48k Limit)

Since the debt ($42k) is between the Maintenance and Liquidation limits, the status correctly evaluates to `MAINTENANCE_MARGIN_CALL` under an ordinary `RECOMPUTE_EVENT`.

### Step 2: Hysteresis Enforcement

The debt requirement is decreased to $35k USDC.

- **LTV**: 58.33% (which normally sits in the `NEAR_MARGIN` range of 50%–65%).
- **Rule 7 Hysteresis**: Because the previous status was `MAINTENANCE_MARGIN_CALL`, the account is not permitted to recover to `NEAR_MARGIN` or `GOOD_STANDING` until the debt falls below the Initial Limit ($30k).
- **Output**: The health status remains `MAINTENANCE_MARGIN_CALL`.

### Step 3: Curing the Hysteresis

The debt is decreased to $25k USDC.

- **LTV**: 41.67% (below the Initial Limit of 50% / $30k).
- **Output**: The hysteresis is cured, and the status transitions back to `GOOD_STANDING`.

### Step 4: Initial Margin Call Protection (Rule 6)

We simulate a `LINK_EVENT` by linking a new asset (WBTC) priced at $600 USDC.

- **LTV**: Pushes to 2083.33% (well above all limits).
- **Rule 5 Link Event**: Link events can only produce `GOOD_STANDING` or `INITIAL_MARGIN_CALL`.
- **Rule 6 Protection Lock**: The status becomes `INITIAL_MARGIN_CALL`. Any subsequent debt draw (e.g. up to $30k debt) keeps the status locked in `INITIAL_MARGIN_CALL` (preventing promotion to maintenance or liquidation).
- **Recovery**: Reducing debt below the Initial Limit ($600 USDC) cures the lock and returns the position to `GOOD_STANDING`.

---

## Example Returned Console Data

Running `npm run smoke` produces the following console output:

```text
=== Collateral Health Engine - Smoke Test ===

==================================================
>>> 1. Setup Worked Example (Ordinary Recompute)
==================================================
Collateral:      2.0000 BTC
Asset Price:     30000.00 USDC
Position Value:  60000.00 USDC
Debt Req:        42000.00 USDC
LTV Thresholds:  Initial: 50.00% | Maint: 65.00% | Liq: 80.00%
Current LTV:     70.00%
Health Status:   MAINTENANCE_MARGIN_CALL
Domain Events:   (none)

==================================================
>>> 2. Hysteresis Test (Debt falls from $42k to $35k)
==================================================
Action: Updating debt requirement to $35k USDC (LTV = 58.33% - between Initial 50% and Maint 65%)...
Result Expected: Should remain in MAINTENANCE_MARGIN_CALL due to Rule 7 (Hysteresis).
Collateral:      2.0000 BTC
Asset Price:     30000.00 USDC
Position Value:  60000.00 USDC
Debt Req:        35000.00 USDC
LTV Thresholds:  Initial: 50.00% | Maint: 65.00% | Liq: 80.00%
Current LTV:     58.33%
Health Status:   MAINTENANCE_MARGIN_CALL
Domain Events Produced (1):
  - [RECOMPUTE_EVENT] occurred at 2026-08-13T01:30:37.436Z (ID: aed8b0cc-58ca-4064-a194-287dcc0b79de)
    Delta: LTV 70.00% -> 58.33% | Status MAINTENANCE_MARGIN_CALL -> MAINTENANCE_MARGIN_CALL

==================================================
>>> 3. Curing Hysteresis (Debt drops below Initial Limit to $25k)
==================================================
Action: Updating debt requirement to $25k USDC (LTV = 41.67% - below Initial 50% limit)...
Result Expected: Should transition back to GOOD_STANDING.
Collateral:      2.0000 BTC
Asset Price:     30000.00 USDC
Position Value:  60000.00 USDC
Debt Req:        25000.00 USDC
LTV Thresholds:  Initial: 50.00% | Maint: 65.00% | Liq: 80.00%
Current LTV:     41.67%
Health Status:   GOOD_STANDING
Domain Events Produced (1):
  - [RECOMPUTE_EVENT] occurred at 2026-08-13T01:30:37.437Z (ID: bb58d0df-1c2b-4160-a908-4fd0bb86357b)
    Delta: LTV 58.33% -> 41.67% | Status MAINTENANCE_MARGIN_CALL -> GOOD_STANDING

==================================================
>>> 4. Rule 6 Protection (Link Event -> Initial Margin Call)
==================================================
Action: Linking new collateral asset WBTC at price $600 USDC per unit...
Action details: LTV will become $25k debt / (2 WBTC * $600) = 208.33% LTV (above all thresholds).
Result Expected: Status becomes INITIAL_MARGIN_CALL because it is a Link event.
Collateral:      2.0000 WBTC
Asset Price:     600.00 USDC
Position Value:  1200.00 USDC
Debt Req:        25000.00 USDC
LTV Thresholds:  Initial: 50.00% | Maint: 65.00% | Liq: 80.00%
Current LTV:     2083.33%
Health Status:   INITIAL_MARGIN_CALL
Domain Events Produced (2):
  - [RECOMPUTE_EVENT] occurred at 2026-08-13T01:30:37.438Z (ID: 3cabff79-15a1-477a-b8ae-865e14e6a5b3)
    Delta: LTV 41.67% -> 2083.33% | Status GOOD_STANDING -> INITIAL_MARGIN_CALL
  - [LINK_EVENT] occurred at 2026-08-13T01:30:37.438Z (ID: 006c590b-e74a-48a1-a051-5a0d62aebe8b)
    Linked asset: WBTC in currency USDC

Action: Draw more debt to $30k USDC (LTV = 250%)...
Result Expected: Status remains locked in INITIAL_MARGIN_CALL (Rule 6 - promotion blocked).
Collateral:      2.0000 WBTC
Asset Price:     600.00 USDC
Position Value:  1200.00 USDC
Debt Req:        30000.00 USDC
LTV Thresholds:  Initial: 50.00% | Maint: 65.00% | Liq: 80.00%
Current LTV:     2500.00%
Health Status:   INITIAL_MARGIN_CALL
Domain Events Produced (1):
  - [RECOMPUTE_EVENT] occurred at 2026-08-13T01:30:37.438Z (ID: 3b99ba43-2027-4496-b814-c205cc1db075)
    Delta: LTV 2083.33% -> 2500.00% | Status INITIAL_MARGIN_CALL -> INITIAL_MARGIN_CALL

Action: Cure the Initial Margin Call by repaying debt to $500 USDC (LTV = 41.67% - below Initial 50%)...
Result Expected: Status returns to GOOD_STANDING.
Collateral:      2.0000 WBTC
Asset Price:     600.00 USDC
Position Value:  1200.00 USDC
Debt Req:        500.00 USDC
LTV Thresholds:  Initial: 50.00% | Maint: 65.00% | Liq: 80.00%
Current LTV:     41.67%
Health Status:   GOOD_STANDING
Domain Events Produced (1):
  - [RECOMPUTE_EVENT] occurred at 2026-08-13T01:30:37.438Z (ID: e65d4b8f-2fac-482c-8121-6b5351e83648)
    Delta: LTV 2500.00% -> 41.67% | Status INITIAL_MARGIN_CALL -> GOOD_STANDING

=== Smoke Test Completed Successfully! ===
```
