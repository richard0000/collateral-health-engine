/**
 * Represents the health status of a Collateral Arrangement.
 */
export enum HealthStatus {
  /** The arrangement is in good standing with low risk. */
  GOOD_STANDING = 'GOOD_STANDING',
  /** The LTV is approaching the margin call threshold. */
  NEAR_MARGIN = 'NEAR_MARGIN',
  /** The initial LTV threshold has been breached. */
  INITIAL_MARGIN_CALL = 'INITIAL_MARGIN_CALL',
  /** The maintenance LTV threshold has been breached. */
  MAINTENANCE_MARGIN_CALL = 'MAINTENANCE_MARGIN_CALL',
  /** The liquidation LTV threshold has been breached. The arrangement can be liquidated. */
  LIQUIDATION = 'LIQUIDATION',
}

/**
 * Represents the types of events that can occur in the Collateral Health system.
 */
export enum EventType {
  /** Triggered when assets or prices are linked. */
  LINK_EVENT = 'LINK_EVENT',
  /** Triggered when a recomputation of health status occurs. */
  RECOMPUTE_EVENT = 'RECOMPUTE_EVENT',
}
