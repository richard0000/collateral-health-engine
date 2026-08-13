import { describe, it, expect } from 'vitest';
import { recomputeHealth } from '../src/domain/health-engine.js';
import { CollateralArrangement } from '../src/domain/collateral-arrangement.js';
import { HealthStatus, EventType } from '../src/domain/types.js';
import { Money, LTV } from '../src/domain/value-objects.js';

describe('recomputeHealth comprehensive test suite', () => {
  // Helper to construct a CollateralArrangement and mock the previous status.
  const createArrangement = (params: {
    previousStatus: HealthStatus;
    collateralAmount: number;
    debt: number;
    price?: number;
    initialLtv?: number;
    maintenanceLtv?: number;
    liquidationLtv?: number;
  }) => {
    const ca = new CollateralArrangement({
      id: 'ca-qa-test',
      collateralAsset: 'BTC',
      collateralAmount: params.collateralAmount,
      assetPrice: Money.create(params.price ?? 1000, 'USD'),
      debtRequirement: Money.create(params.debt, 'USD'),
      initialLtvThreshold: LTV.create(params.initialLtv ?? 0.5),
      maintenanceLtvThreshold: LTV.create(params.maintenanceLtv ?? 0.7),
      liquidationLtvThreshold: LTV.create(params.liquidationLtv ?? 0.8),
    });

    // Override the private status to simulate the target state before transition
    (ca as any)._currentHealthStatus = params.previousStatus;
    return ca;
  };

  describe('1. Worked Example Verification', () => {
    it('should evaluate to MAINTENANCE_MARGIN_CALL for the prompt example', () => {
      // Scenario: 2 BTC, $30k price, debt $42k, LTVs 50% / 65% / 80%
      // Collateral value = 2 * 30,000 = $60,000
      // Initial Limit = 60,000 * 0.50 = $30,000
      // Maintenance Limit = 60,000 * 0.65 = $39,000
      // Liquidation Limit = 60,000 * 0.80 = $48,000
      // Debt = $42,000
      // Since Maintenance Limit ($39k) <= Debt ($42k) < Liquidation Limit ($48k), expected: MAINTENANCE_MARGIN_CALL.
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 2,
        price: 30000,
        debt: 42000,
        initialLtv: 0.5,
        maintenanceLtv: 0.65,
        liquidationLtv: 0.8,
      });

      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });
  });

  describe('2. Base Threshold Boundary Checks (RECOMPUTE_EVENT)', () => {
    // Collateral value = 10 * 1000 = $10,000
    // Limits: Initial Limit = $5,000, Maintenance Limit = $7,000, Liquidation Limit = $8,000
    const baseParams = {
      previousStatus: HealthStatus.GOOD_STANDING,
      collateralAmount: 10,
      price: 1000,
      initialLtv: 0.5,
      maintenanceLtv: 0.7,
      liquidationLtv: 0.8,
    };

    it('should be GOOD_STANDING when debt is strictly below Initial Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 4999 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.GOOD_STANDING);
    });

    it('should be NEAR_MARGIN when debt is exactly equal to Initial Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 5000 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.NEAR_MARGIN);
    });

    it('should be NEAR_MARGIN when debt is slightly above Initial Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 5001 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.NEAR_MARGIN);
    });

    it('should be NEAR_MARGIN when debt is slightly below Maintenance Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 6999 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.NEAR_MARGIN);
    });

    it('should be MAINTENANCE_MARGIN_CALL when debt is exactly equal to Maintenance Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 7000 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should be MAINTENANCE_MARGIN_CALL when debt is slightly above Maintenance Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 7001 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should be MAINTENANCE_MARGIN_CALL when debt is slightly below Liquidation Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 7999 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should be LIQUIDATION when debt is exactly equal to Liquidation Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 8000 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });

    it('should be LIQUIDATION when debt is slightly above Liquidation Limit', () => {
      const ca = createArrangement({ ...baseParams, debt: 8001 });
      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });
  });

  describe('3. Precedence Rules (Equal Thresholds)', () => {
    // Collateral value = 10 * 1000 = $10,000

    it('should prioritize MAINTENANCE_MARGIN_CALL when Initial LTV == Maintenance LTV and debt lands on threshold', () => {
      // Thresholds: Initial 50% ($5000), Maintenance 50% ($5000), Liquidation 80% ($8000)
      // Debt = $5000 (shared Initial/Maintenance limit)
      // Expect MAINTENANCE_MARGIN_CALL over NEAR_MARGIN/GOOD_STANDING
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        price: 1000,
        debt: 5000,
        initialLtv: 0.5,
        maintenanceLtv: 0.5,
        liquidationLtv: 0.8,
      });

      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should prioritize LIQUIDATION when Maintenance LTV == Liquidation LTV and debt lands on threshold', () => {
      // Thresholds: Initial 50% ($5000), Maintenance 80% ($8000), Liquidation 80% ($8000)
      // Debt = $8000 (shared Maintenance/Liquidation limit)
      // Expect LIQUIDATION over MAINTENANCE_MARGIN_CALL
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        price: 1000,
        debt: 8000,
        initialLtv: 0.5,
        maintenanceLtv: 0.8,
        liquidationLtv: 0.8,
      });

      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });

    it('should prioritize LIQUIDATION when all three LTV thresholds are equal and debt lands on threshold', () => {
      // Thresholds: Initial = Maintenance = Liquidation = 50% ($5000)
      // Debt = $5000
      // Expect LIQUIDATION
      const ca = createArrangement({
        previousStatus: HealthStatus.GOOD_STANDING,
        collateralAmount: 10,
        price: 1000,
        debt: 5000,
        initialLtv: 0.5,
        maintenanceLtv: 0.5,
        liquidationLtv: 0.5,
      });

      const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });
  });

  describe('4. Link Event Behavior (LINK_EVENT)', () => {
    // Collateral value = 10 * 1000 = $10,000
    // Limits: Initial Limit = $5,000, Maintenance Limit = $7,000, Liquidation Limit = $8,000
    const linkParams = {
      collateralAmount: 10,
      price: 1000,
      initialLtv: 0.5,
      maintenanceLtv: 0.7,
      liquidationLtv: 0.8,
    };

    it('should evaluate to GOOD_STANDING when linking with debt strictly below Initial Limit', () => {
      const ca = createArrangement({
        ...linkParams,
        previousStatus: HealthStatus.GOOD_STANDING,
        debt: 4500, // < $5000
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.GOOD_STANDING);
    });

    it('should evaluate to INITIAL_MARGIN_CALL when linking with debt equal to Initial Limit', () => {
      const ca = createArrangement({
        ...linkParams,
        previousStatus: HealthStatus.GOOD_STANDING,
        debt: 5000, // = $5000
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
    });

    it('should evaluate to INITIAL_MARGIN_CALL when linking with debt above Initial Limit', () => {
      const ca = createArrangement({
        ...linkParams,
        previousStatus: HealthStatus.GOOD_STANDING,
        debt: 6000, // > $5000
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
    });

    it('should evaluate to INITIAL_MARGIN_CALL when linking with debt crossing Maintenance/Liquidation limits', () => {
      const ca = createArrangement({
        ...linkParams,
        previousStatus: HealthStatus.GOOD_STANDING,
        debt: 9000, // > $8000
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
    });

    it('should remain in MAINTENANCE_MARGIN_CALL under LINK_EVENT if previously in MAINTENANCE_MARGIN_CALL', () => {
      const ca = createArrangement({
        ...linkParams,
        previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
        debt: 4000, // even if debt is below initial limit
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
    });

    it('should remain in LIQUIDATION under LINK_EVENT if previously in LIQUIDATION', () => {
      const ca = createArrangement({
        ...linkParams,
        previousStatus: HealthStatus.LIQUIDATION,
        debt: 4000, // even if debt is below initial limit
      });
      const result = recomputeHealth(ca, EventType.LINK_EVENT);
      expect(result).toBe(HealthStatus.LIQUIDATION);
    });
  });

  describe('5. State Machine Edge Cases (RECOMPUTE_EVENT)', () => {
    // Collateral value = 10 * 1000 = $10,000
    // Limits: Initial Limit = $5,000, Maintenance Limit = $7,000, Liquidation Limit = $8,000
    const edgeParams = {
      collateralAmount: 10,
      price: 1000,
      initialLtv: 0.5,
      maintenanceLtv: 0.7,
      liquidationLtv: 0.8,
    };

    describe('Rule 6: INITIAL_MARGIN_CALL Protection', () => {
      it('should block promotion to MAINTENANCE_MARGIN_CALL when debt is equal/above Maintenance Limit', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.INITIAL_MARGIN_CALL,
          debt: 7500, // $7000 <= debt < $8000 (would be MAINTENANCE)
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
      });

      it('should block promotion to LIQUIDATION when debt is equal/above Liquidation Limit', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.INITIAL_MARGIN_CALL,
          debt: 9000, // >= $8000 (would be LIQUIDATION)
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.INITIAL_MARGIN_CALL);
      });

      it('should demote to GOOD_STANDING when debt drops below Initial Limit', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.INITIAL_MARGIN_CALL,
          debt: 4500, // < $5000
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.GOOD_STANDING);
      });
    });

    describe('Rule 7 & 8: Hysteresis & Escalation', () => {
      it('should retain MAINTENANCE_MARGIN_CALL status even if debt falls to NEAR_MARGIN range', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
          debt: 6000, // $5000 <= debt < $7000 (would normally be NEAR_MARGIN)
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
      });

      it('should demote to GOOD_STANDING from MAINTENANCE_MARGIN_CALL if debt falls strictly below Initial Limit', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
          debt: 4999, // < $5000
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.GOOD_STANDING);
      });

      it('should escalate to LIQUIDATION from MAINTENANCE_MARGIN_CALL if debt is equal/above Liquidation Limit (Rule 8)', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.MAINTENANCE_MARGIN_CALL,
          debt: 8500, // >= $8000
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.LIQUIDATION);
      });

      it('should retain LIQUIDATION status if debt drops but remains equal/above Liquidation Limit', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.LIQUIDATION,
          debt: 8100, // >= $8000
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.LIQUIDATION);
      });

      it('should demote to MAINTENANCE_MARGIN_CALL from LIQUIDATION if debt drops below Liquidation Limit but is >= Initial Limit', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.LIQUIDATION,
          debt: 7500, // $5000 <= debt < $8000 (drops from LIQUIDATION to MAINTENANCE)
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.MAINTENANCE_MARGIN_CALL);
      });

      it('should demote to GOOD_STANDING from LIQUIDATION if debt drops strictly below Initial Limit', () => {
        const ca = createArrangement({
          ...edgeParams,
          previousStatus: HealthStatus.LIQUIDATION,
          debt: 4500, // < $5000
        });
        const result = recomputeHealth(ca, EventType.RECOMPUTE_EVENT);
        expect(result).toBe(HealthStatus.GOOD_STANDING);
      });
    });
  });
});
