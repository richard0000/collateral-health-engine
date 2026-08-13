import { HealthStatus, EventType } from './types.js';
import { CollateralArrangement } from './collateral-arrangement.js';

/**
 * Pure function to recompute the HealthStatus of a CollateralArrangement based on the event type and state transition rules.
 *
 * @param ca The CollateralArrangement entity.
 * @param event The type of event triggering the calculation.
 * @returns The new HealthStatus for the arrangement.
 */
export function recomputeHealth(ca: CollateralArrangement, event: EventType): HealthStatus {
  // Rule: If there is no debt requirement, the arrangement is always in GOOD_STANDING
  if (ca.debtRequirement.value === 0) {
    return HealthStatus.GOOD_STANDING;
  }

  const previousStatus = ca.currentHealthStatus;
  const collateralValue = ca.collateralAmount * ca.assetPrice.value;

  // Calculate monetary limits
  const initialLimit = collateralValue * ca.initialLtvThreshold.percentage;
  const maintenanceLimit = collateralValue * ca.maintenanceLtvThreshold.percentage;
  const liquidationLimit = collateralValue * ca.liquidationLtvThreshold.percentage;
  const debt = ca.debtRequirement.value;

  // --- LINK_EVENT Rule Engine ---
  if (event === EventType.LINK_EVENT) {
    // Exception: If previous status was MAINTENANCE_MARGIN_CALL or LIQUIDATION, leave status unchanged.
    if (
      previousStatus === HealthStatus.MAINTENANCE_MARGIN_CALL ||
      previousStatus === HealthStatus.LIQUIDATION
    ) {
      return previousStatus;
    }

    // Link events can only produce GOOD_STANDING or INITIAL_MARGIN_CALL.
    if (debt >= initialLimit) {
      return HealthStatus.INITIAL_MARGIN_CALL;
    }
    return HealthStatus.GOOD_STANDING;
  }

  // --- RECOMPUTE_EVENT Rule Engine ---

  // Rule 6: An account in INITIAL_MARGIN_CALL cannot be promoted to MAINTENANCE_MARGIN_CALL or LIQUIDATION.
  // It only returns to GOOD_STANDING if debt drops below the Initial Limit. Otherwise, it stays in INITIAL_MARGIN_CALL.
  if (previousStatus === HealthStatus.INITIAL_MARGIN_CALL) {
    if (debt < initialLimit) {
      return HealthStatus.GOOD_STANDING;
    }
    return HealthStatus.INITIAL_MARGIN_CALL;
  }

  // Rule 7 & 8 (Hysteresis): An account in MAINTENANCE_MARGIN_CALL or LIQUIDATION only returns to GOOD_STANDING
  // if debt drops below the Initial Limit.
  // Otherwise, it can escalate to LIQUIDATION or transition back to MAINTENANCE_MARGIN_CALL (within the critical zone).
  if (
    previousStatus === HealthStatus.MAINTENANCE_MARGIN_CALL ||
    previousStatus === HealthStatus.LIQUIDATION
  ) {
    if (debt < initialLimit) {
      return HealthStatus.GOOD_STANDING;
    }

    // Check if it is under liquidation range (Rule 8: MAINTENANCE can escalate to LIQUIDATION)
    // Precedence rule: most severe takes precedence if limits are equal.
    if (debt >= liquidationLimit) {
      return HealthStatus.LIQUIDATION;
    }
    return HealthStatus.MAINTENANCE_MARGIN_CALL;
  }

  // --- Base Range Rule Engine (for GOOD_STANDING and NEAR_MARGIN previous states) ---
  // Precedence rule: check from most severe (LIQUIDATION) down to least severe.
  if (debt >= liquidationLimit) {
    return HealthStatus.LIQUIDATION;
  }
  if (debt >= maintenanceLimit) {
    return HealthStatus.MAINTENANCE_MARGIN_CALL;
  }
  if (debt >= initialLimit) {
    return HealthStatus.NEAR_MARGIN;
  }
  return HealthStatus.GOOD_STANDING;
}
