import { CollateralArrangement } from './domain/collateral-arrangement.js';
import { Money, LTV } from './domain/value-objects.js';
import { HealthStatus } from './domain/types.js';

function printHeader(title: string): void {
  console.log(`\n==================================================`);
  console.log(`>>> ${title}`);
  console.log(`==================================================`);
}

function printState(ca: CollateralArrangement): void {
  const collateralValue = ca.collateralAmount * ca.assetPrice.value;
  console.log(`Collateral:      ${ca.collateralAmount.toFixed(4)} ${ca.collateralAsset}`);
  console.log(`Asset Price:     ${ca.assetPrice.toString()}`);
  console.log(`Position Value:  ${collateralValue.toFixed(2)} ${ca.assetPrice.currency}`);
  console.log(`Debt Req:        ${ca.debtRequirement.toString()}`);
  console.log(
    `LTV Thresholds:  Initial: ${ca.initialLtvThreshold.toString()} | Maint: ${ca.maintenanceLtvThreshold.toString()} | Liq: ${ca.liquidationLtvThreshold.toString()}`
  );
  console.log(`Current LTV:     ${ca.calculateCurrentLtv().toString()}`);
  console.log(`Health Status:   \x1b[36m${ca.currentHealthStatus}\x1b[0m`);
}

function printEvents(ca: CollateralArrangement): void {
  const events = ca.pullEvents();
  if (events.length === 0) {
    console.log('Domain Events:   (none)');
    return;
  }
  console.log(`Domain Events Produced (${events.length}):`);
  for (const e of events) {
    console.log(`  - [${e.type}] occurred at ${e.occurredAt.toISOString()} (ID: ${e.eventId})`);
    if ('oldStatus' in e) {
      const re = e as any;
      console.log(
        `    Delta: LTV ${(re.oldLtv * 100).toFixed(2)}% -> ${(re.newLtv * 100).toFixed(2)}% | Status ${re.oldStatus} -> ${re.newStatus}`
      );
    }
    if ('collateralAsset' in e) {
      const le = e as any;
      console.log(`    Linked asset: ${le.collateralAsset} in currency ${le.priceCurrency}`);
    }
  }
}

// RUN SMOKE TEST
console.log('\x1b[1m\x1b[32m=== Collateral Health Engine - Smoke Test ===\x1b[0m');

// 1. Worked Example Initial State
printHeader('1. Setup Worked Example (Ordinary Recompute)');
const ca = new CollateralArrangement({
  id: 'ca-smoke-1',
  collateralAsset: 'BTC',
  collateralAmount: 2, // 2 BTC
  assetPrice: Money.create(30000, 'USDC'), // $30,000 USDC/BTC
  debtRequirement: Money.create(42000, 'USDC'), // $42,000 USDC
  initialLtvThreshold: LTV.create(0.5), // 50%
  maintenanceLtvThreshold: LTV.create(0.65), // 65%
  liquidationLtvThreshold: LTV.create(0.8), // 80%
});
printState(ca);
printEvents(ca);

// 2. Hysteresis Test (Debt drops below Maintenance Limit but remains above Initial Limit)
printHeader('2. Hysteresis Test (Debt falls from $42k to $35k)');
console.log(
  'Action: Updating debt requirement to $35k USDC (LTV = 58.33% - between Initial 50% and Maint 65%)...'
);
console.log(
  'Result Expected: Should remain in MAINTENANCE_MARGIN_CALL due to Rule 7 (Hysteresis).'
);
ca.updateDebtRequirement(Money.create(35000, 'USDC'));
printState(ca);
printEvents(ca);

// 3. Clear Hysteresis (Debt drops below Initial Limit)
printHeader('3. Curing Hysteresis (Debt drops below Initial Limit to $25k)');
console.log(
  'Action: Updating debt requirement to $25k USDC (LTV = 41.67% - below Initial 50% limit)...'
);
console.log('Result Expected: Should transition back to GOOD_STANDING.');
ca.updateDebtRequirement(Money.create(25000, 'USDC'));
printState(ca);
printEvents(ca);

// 4. Initial Margin Call protection (Rule 6)
printHeader('4. Rule 6 Protection (Link Event -> Initial Margin Call)');
console.log('Action: Linking new collateral asset WBTC at price $600 USDC per unit...');
console.log(
  'Action details: LTV will become $25k debt / (2 WBTC * $600) = 208.33% LTV (above all thresholds).'
);
console.log('Result Expected: Status becomes INITIAL_MARGIN_CALL because it is a Link event.');
ca.applyLink('WBTC', Money.create(600, 'USDC'));
printState(ca);
printEvents(ca);

console.log('\nAction: Draw more debt to $30k USDC (LTV = 250%)...');
console.log(
  'Result Expected: Status remains locked in INITIAL_MARGIN_CALL (Rule 6 - promotion blocked).'
);
ca.updateDebtRequirement(Money.create(30000, 'USDC'));
printState(ca);
printEvents(ca);

console.log(
  '\nAction: Cure the Initial Margin Call by repaying debt to $500 USDC (LTV = 41.67% - below Initial 50%)...'
);
console.log('Result Expected: Status returns to GOOD_STANDING.');
ca.updateDebtRequirement(Money.create(500, 'USDC'));
printState(ca);
printEvents(ca);

console.log('\n\x1b[1m\x1b[32m=== Smoke Test Completed Successfully! ===\x1b[0m\n');
