import { randomUUID } from 'node:crypto';
import { EventType, HealthStatus } from './types.js';

export interface DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly type: EventType;
  readonly collateralArrangementId: string;
}

/**
 * Event triggered when an asset price feed or dependency is linked.
 */
export class LinkEvent implements DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly type = EventType.LINK_EVENT;
  readonly collateralArrangementId: string;
  readonly collateralAsset: string;
  readonly priceCurrency: string;

  constructor(collateralArrangementId: string, collateralAsset: string, priceCurrency: string) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.collateralArrangementId = collateralArrangementId;
    this.collateralAsset = collateralAsset;
    this.priceCurrency = priceCurrency;
  }
}

/**
 * Event triggered when the health status of a Collateral Arrangement is recomputed.
 */
export class RecomputeEvent implements DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly type = EventType.RECOMPUTE_EVENT;
  readonly collateralArrangementId: string;
  readonly oldLtv: number;
  readonly newLtv: number;
  readonly oldStatus: HealthStatus;
  readonly newStatus: HealthStatus;

  constructor(
    collateralArrangementId: string,
    oldLtv: number,
    newLtv: number,
    oldStatus: HealthStatus,
    newStatus: HealthStatus
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.collateralArrangementId = collateralArrangementId;
    this.oldLtv = oldLtv;
    this.newLtv = newLtv;
    this.oldStatus = oldStatus;
    this.newStatus = newStatus;
  }
}
