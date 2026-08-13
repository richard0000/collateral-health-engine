import { describe, it, expect } from 'vitest';
import { recomputeHealth } from '../src/domain/health-engine.js';
import { CollateralArrangement } from '../src/domain/collateral-arrangement.js';
import { HealthStatus, EventType } from '../src/domain/types.js';
import { Money, LTV } from '../src/domain/value-objects.js';

describe('recomputeHealth pure engine', () => {
  const createArrangement = (params: {
    previousStatus: HealthStatus;
    collateralAmount: number;
    debt: number;
    initialLtv?: number;
    maintenanceLtv?: number;
    liquidationLtv?: number;
  }) => {
    // We create a mock arrangement and then override the private status field for testing transitions.
    const ca = new CollateralArrangement({
      id: 'ca-test',
      collateralAsset: 'ETH',
      collateralAmount: params.collateralAmount,
      assetPrice: Money.create(1000, 'USD'), // Price = $1000
      debtRequirement: Money.create(params.debt, 'USD'),
      initialLtvThreshold: LTV.create(params.initialLtv ?? 0.5),
      maintenanceLtvThreshold: LTV.create(params.maintenanceLtv ?? 0.7),
      liquidationLtvThreshold: LTV.create(params.liquidationLtv ?? 0.8),
    });

    // Override the private status to simulate any previous status
    (ca as any)._currentHealthStatus = params.previousStatus;
    return ca;
  };

  describe('Zero Debt Handling', () => {
    it('should always return GOOD_STANDING when debt is zero', () => {
      const statuses = [
        HealthStatus.GOOD_STANDING,
        HealthStatus.NEAR_MARGIN,
        HealthStatus.INITIAL_MARGIN_CALL,
        HealthStatus.MAINTENANCE_MARGIN_CALL,
        HealthStatus.LIQUIDATION,
      ];

      for (const prevStatus of statuses) {
        const ca = createArrangement({
          previousStatus: prevStatus,
          collateralAmount: 10,
          debt: 0,
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.GOOD_STANDING);
      }
    });
  });

  describe('Base Range Rule Engine (starts from GOOD_STANDING or NEAR_MARGIN)', () => {
    // Collateral value = 10 * 1000 = 10000 USD
    // Thresholds: Initial 50% ($5000), Maintenance 70% ($7000), Liquidation 80% ($8000)
    // Limits: Initial Limit = $5000, Maintenance Limit = $7000, Liquidation Limit = $8000

    it('should return GOOD_STANDING when debt is below Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 4000, // < $5000
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.GOOD_STANDING);
    });

    it('should return NEAR_MARGIN when Initial Limit <= debt < Maintenance Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 6000, // $5000 <= debt < $7000
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.NEAR_MARGIN);
    });

    it('should return MAINTENANCE_MARGIN_CALL when Maintenance Limit <= debt < Liquidation Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 7500, // $7000 <= debt < $8000
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should return LIQUIDATION when debt >= Liquidation Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 8500, // >= $8000
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });
  });

  describe('Precedence Rule on Shared Thresholds', () => {
    it('should prioritize LIQUIDATION when all thresholds are equal and debt hits the shared threshold', () => {
      // Thresholds: Initial = Maintenance = Liquidation = 50% ($5000)
      // Debt = $5000
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 5000,
        initialLtv: 0.5,
        maintenanceLtv: 0.5,
        liquidationLtv: 0.5,
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });

    it('should prioritize MAINTENANCE_MARGIN_CALL when Initial = Maintenance and debt hits the shared threshold', () => {
      // Thresholds: Initial = Maintenance = 50% ($5000), Liquidation = 80% ($8000)
      // Debt = $5000
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 5000,
        initialLtv: 0.5,
        maintenanceLtv: 0.5,
        liquidationLtv: 0.8,
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should evaluate to NEAR_MARGIN when only Initial threshold is hit', () => {
      // Thresholds: Initial = 50% ($5000), Maintenance = 70% ($7000), Liquidation = 80% ($8000)
      // Debt = $5000
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 5000,
        initialLtv: 0.5,
        maintenanceLtv: 0.7,
        liquidationLtv: 0.8,
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.NEAR_MARGIN);
    });
  });

  describe('Event Rules (LINK_EVENT)', () => {
    // Collateral value = $10000. Initial Limit = $5000.

    it('should produce GOOD_STANDING under LINK_EVENT if debt is below Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 4000,
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.GOOD_STANDING);
    });

    it('should produce INITIAL_MARGIN_CALL under LINK_EVENT if debt is >= Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 6000, // above Initial Limit, normally NEAR_MARGIN
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
    });

    it('should produce INITIAL_MARGIN_CALL under LINK_EVENT even if debt is above Maintenance/Liquidation limits', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        debt: 9000, // above all limits
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
    });

    it('should leave status unchanged under LINK_EVENT if previous status was MAINTENANCE_MARGIN_CALL', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
        collateralAmount: 10,
        debt: 9000,
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should leave status unchanged under LINK_EVENT if previous status was LIQUIDATION', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.LIQUIDATION,
        collateralAmount: 10,
        debt: 4000, // even if debt is fully cleared
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });
  });

  describe('State Transition Constraints (Rule 6 - INITIAL_MARGIN_CALL Protection)', () => {
    // Collateral value = $10000. Initial Limit = $5000, Maintenance Limit = $7000, Liquidation Limit = $8000.

    it('should remain in INITIAL_MARGIN_CALL if debt is above Initial Limit, even if it crosses Maintenance/Liquidation limits', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.INITIAL_MARGIN_CALL,
        collateralAmount: 10,
        debt: 9500, // crosses Liquidation Limit ($8000)
      });

      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
    });

    it('should transition to GOOD_STANDING if debt drops below Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.INITIAL_MARGIN_CALL,
        collateralAmount: 10,
        debt: 3500, // drops below Initial Limit ($5000)
      });

      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.GOOD_STANDING);
    });
  });

  describe('Rule 7 & 8 (Hysteresis and Escalation)', () => {
    // Collateral value = $10000. Initial Limit = $5000, Maintenance Limit = $7000, Liquidation Limit = $8000.

    it('should return to GOOD_STANDING from MAINTENANCE_MARGIN_CALL if debt drops below Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
        collateralAmount: 10,
        debt: 4500, // below Initial Limit ($5000)
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.GOOD_STANDING);
    });

    it('should stay in MAINTENANCE_MARGIN_CALL if debt drops below Maintenance Limit but remains >= Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
        collateralAmount: 10,
        debt: 6000, // between Initial ($5000) and Maintenance ($7000)
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should escalate to LIQUIDATION from MAINTENANCE_MARGIN_CALL if debt crosses Liquidation Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
        collateralAmount: 10,
        debt: 8500, // >= Liquidation Limit ($8000)
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });

    it('should return to GOOD_STANDING from LIQUIDATION if debt drops below Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.LIQUIDATION,
        collateralAmount: 10,
        debt: 4500, // below Initial Limit ($5000)
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.GOOD_STANDING);
    });

    it('should drop down to MAINTENANCE_MARGIN_CALL from LIQUIDATION if debt drops below Liquidation Limit but is >= Initial Limit', () => {
      const ca = createArrangement({
        previousStatus: HealthStatus.LIQUIDATION,
        collateralAmount: 10,
        debt: 7500, // between Initial ($5000) and Liquidation ($8000)
      });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });
  });
});
