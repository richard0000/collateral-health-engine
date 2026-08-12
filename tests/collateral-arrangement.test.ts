import { describe, it, expect } from 'vitest';
import { CollateralArrangement } from '../src/domain/collateral-arrangement.js';
import { HealthStatus } from '../src/domain/types.js';
import { Money, LTV } from '../src/domain/value-objects.js';
import { RecomputeEvent } from '../src/domain/events.js';

describe('CollateralArrangement Aggregate', () => {
  const defaultParams = {
    id: 'ca-123',
    collateralAsset: 'ETH',
    collateralAmount: 10, // 10 ETH
    assetPrice: Money.create(2000, 'USD'), // $2000/ETH -> Collateral value = $20000
    debtRequirement: Money.create(8000, 'USD'), // $8000 debt -> LTV = 8000 / 20000 = 40%
    initialLtvThreshold: LTV.create(0.50), // 50%
    maintenanceLtvThreshold: LTV.create(0.70), // 70%
    liquidationLtvThreshold: LTV.create(0.85), // 85%
  };

  it('should create a valid CollateralArrangement instance in GOOD_STANDING', () => {
    const ca = new CollateralArrangement(defaultParams);
    expect(ca.id).toBe('ca-123');
    expect(ca.collateralAsset).toBe('ETH');
    expect(ca.collateralAmount).toBe(10);
    expect(ca.calculateCurrentLtv().percentage).toBe(0.40);
    // 40% LTV is <= 90% of 50% threshold (45%), so it should be GOOD_STANDING
    expect(ca.currentHealthStatus).toBe(HealthStatus.GOOD_STANDING);
  });

  describe('Constructor Assertions', () => {
    it('should throw if id is empty', () => {
      expect(() => new CollateralArrangement({ ...defaultParams, id: '' })).toThrow(
        'CollateralArrangement ID must be a non-empty string.'
      );
    });

    it('should throw if collateralAsset is empty', () => {
      expect(() => new CollateralArrangement({ ...defaultParams, collateralAsset: '   ' })).toThrow(
        'Collateral asset code must be a non-empty string.'
      );
    });

    it('should throw if collateralAmount is negative', () => {
      expect(() => new CollateralArrangement({ ...defaultParams, collateralAmount: -5 })).toThrow(
        'Collateral amount cannot be negative'
      );
    });

    it('should throw if asset price currency does not match debt currency', () => {
      expect(
        () =>
          new CollateralArrangement({
            ...defaultParams,
            assetPrice: Money.create(2000, 'EUR'),
          })
      ).toThrow('Currency mismatch');
    });

    it('should throw if initialLtv > maintenanceLtv', () => {
      expect(
        () =>
          new CollateralArrangement({
            ...defaultParams,
            initialLtvThreshold: LTV.create(0.75),
            maintenanceLtvThreshold: LTV.create(0.70),
          })
      ).toThrow('Threshold validation failed');
    });

    it('should throw if maintenanceLtv > liquidationLtv', () => {
      expect(
        () =>
          new CollateralArrangement({
            ...defaultParams,
            maintenanceLtvThreshold: LTV.create(0.90),
            liquidationLtvThreshold: LTV.create(0.85),
          })
      ).toThrow('Threshold validation failed');
    });
  });

  describe('Health Status Transitions and LTV Calculations', () => {
    // Thresholds: Initial 50% (buffer 45%), Maintenance 70%, Liquidation 85%
    // Total collateral value = 10 * 2000 = $20000

    it('should evaluate to GOOD_STANDING when LTV <= 90% of Initial Threshold (LTV <= 45%)', () => {
      const ca = new CollateralArrangement({
        ...defaultParams,
        debtRequirement: Money.create(9000, 'USD'), // 45% LTV
      });
      expect(ca.currentHealthStatus).toBe(HealthStatus.GOOD_STANDING);
    });

    it('should evaluate to NEAR_MARGIN when 90% of Initial Threshold < LTV <= Initial Threshold (45% < LTV <= 50%)', () => {
      const ca = new CollateralArrangement({
        ...defaultParams,
        debtRequirement: Money.create(9600, 'USD'), // 48% LTV
      });
      expect(ca.currentHealthStatus).toBe(HealthStatus.NEAR_MARGIN);
    });

    it('should evaluate to INITIAL_MARGIN_CALL when Initial Threshold < LTV <= Maintenance Threshold (50% < LTV <= 70%)', () => {
      const ca = new CollateralArrangement({
        ...defaultParams,
        debtRequirement: Money.create(12000, 'USD'), // 60% LTV
      });
      expect(ca.currentHealthStatus).toBe(HealthStatus.INITIAL_MARGIN_CALL);
    });

    it('should evaluate to MAINTENANCE_MARGIN_CALL when Maintenance Threshold < LTV <= Liquidation Threshold (70% < LTV <= 85%)', () => {
      const ca = new CollateralArrangement({
        ...defaultParams,
        debtRequirement: Money.create(16000, 'USD'), // 80% LTV
      });
      expect(ca.currentHealthStatus).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should evaluate to LIQUIDATION when LTV > Liquidation Threshold (LTV > 85%)', () => {
      const ca = new CollateralArrangement({
        ...defaultParams,
        debtRequirement: Money.create(18000, 'USD'), // 90% LTV
      });
      expect(ca.currentHealthStatus).toBe(HealthStatus.LIQUIDATION);
    });

    it('should handle zero collateral amount and non-zero debt requirement correctly', () => {
      const ca = new CollateralArrangement({
        ...defaultParams,
        collateralAmount: 0,
        debtRequirement: Money.create(100, 'USD'),
      });
      expect(ca.calculateCurrentLtv().percentage).toBe(Infinity);
      expect(ca.currentHealthStatus).toBe(HealthStatus.LIQUIDATION);
    });

    it('should handle zero collateral amount and zero debt requirement correctly', () => {
      const ca = new CollateralArrangement({
        ...defaultParams,
        collateralAmount: 0,
        debtRequirement: Money.create(0, 'USD'),
      });
      expect(ca.calculateCurrentLtv().percentage).toBe(0);
      expect(ca.currentHealthStatus).toBe(HealthStatus.GOOD_STANDING);
    });
  });

  describe('Aggregate Mutations and Domain Events', () => {
    it('should trigger events when updates change the status or LTV', () => {
      const ca = new CollateralArrangement(defaultParams); // LTV = 40%, GOOD_STANDING
      expect(ca.pullEvents().length).toBe(0); // constructor does not buffer events to pull (since it is initialization)

      // Update collateral down, pushing LTV to 80% (MAINTENANCE_MARGIN_CALL)
      ca.updateCollateralAmount(5); // 5 * 2000 = 10000. 8000 / 10000 = 80%
      expect(ca.collateralAmount).toBe(5);
      expect(ca.calculateCurrentLtv().percentage).toBe(0.80);
      expect(ca.currentHealthStatus).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);

      const events = ca.pullEvents();
      expect(events.length).toBe(1);
      
      const event = events[0] as RecomputeEvent;
      expect(event).toBeInstanceOf(RecomputeEvent);
      expect(event.collateralArrangementId).toBe(ca.id);
      expect(event.oldLtv).toBe(0.40);
      expect(event.newLtv).toBe(0.80);
      expect(event.oldStatus).toBe(HealthStatus.GOOD_STANDING);
      expect(event.newStatus).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);

      // Event queue should be cleared now
      expect(ca.pullEvents().length).toBe(0);
    });

    it('should trigger events when asset price decreases', () => {
      const ca = new CollateralArrangement(defaultParams); // LTV = 40%
      
      // Asset price falls to $1000/ETH -> Collateral value = $10000 -> LTV = 80%
      ca.updateAssetPrice(Money.create(1000, 'USD'));
      expect(ca.assetPrice.value).toBe(1000);
      expect(ca.currentHealthStatus).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);

      const events = ca.pullEvents();
      expect(events.length).toBe(1);
    });

    it('should trigger events when debt requirement increases', () => {
      const ca = new CollateralArrangement(defaultParams); // LTV = 40%

      // Debt increases to $16000 -> LTV = 80%
      ca.updateDebtRequirement(Money.create(16000, 'USD'));
      expect(ca.debtRequirement.value).toBe(16000);
      expect(ca.currentHealthStatus).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);

      const events = ca.pullEvents();
      expect(events.length).toBe(1);
    });

    it('should trigger events when thresholds are modified', () => {
      const ca = new CollateralArrangement(defaultParams); // LTV = 40%, GOOD_STANDING (initial threshold 50%, buffer 45%)

      // If initial threshold is lowered to 35% (buffer 31.5%), then 40% LTV becomes INITIAL_MARGIN_CALL
      ca.updateThresholds(
        LTV.create(0.35),
        LTV.create(0.60),
        LTV.create(0.80)
      );

      expect(ca.initialLtvThreshold.percentage).toBe(0.35);
      expect(ca.currentHealthStatus).toBe(HealthStatus.INITIAL_MARGIN_CALL);

      const events = ca.pullEvents();
      expect(events.length).toBe(1);
    });

    it('should throw error when updating price with mismatched currency', () => {
      const ca = new CollateralArrangement(defaultParams);
      expect(() => ca.updateAssetPrice(Money.create(2000, 'EUR'))).toThrow('Currency mismatch');
    });

    it('should throw error when updating debt with mismatched currency', () => {
      const ca = new CollateralArrangement(defaultParams);
      expect(() => ca.updateDebtRequirement(Money.create(8000, 'EUR'))).toThrow('Currency mismatch');
    });
  });
});
