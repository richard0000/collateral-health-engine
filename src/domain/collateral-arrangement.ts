import { HealthStatus } from './types.js';
import { Money, LTV } from './value-objects.js';
import { DomainEvent, RecomputeEvent } from './events.js';

export class CollateralArrangement {
  readonly id: string;
  readonly collateralAsset: string;
  
  private _collateralAmount: number;
  private _assetPrice: Money;
  private _debtRequirement: Money;
  
  private _initialLtvThreshold: LTV;
  private _maintenanceLtvThreshold: LTV;
  private _liquidationLtvThreshold: LTV;
  
  private _currentHealthStatus: HealthStatus;
  private _events: DomainEvent[] = [];

  constructor(params: {
    id: string;
    collateralAsset: string;
    collateralAmount: number;
    assetPrice: Money;
    debtRequirement: Money;
    initialLtvThreshold: LTV;
    maintenanceLtvThreshold: LTV;
    liquidationLtvThreshold: LTV;
  }) {
    // Assert non-empty ID
    if (!params.id || params.id.trim() === '') {
      throw new Error('CollateralArrangement ID must be a non-empty string.');
    }
    
    // Assert non-empty asset code
    if (!params.collateralAsset || params.collateralAsset.trim() === '') {
      throw new Error('Collateral asset code must be a non-empty string.');
    }

    // Assert collateral amount is non-negative
    if (params.collateralAmount < 0) {
      throw new Error(`Collateral amount cannot be negative: ${params.collateralAmount}`);
    }

    // Assert currencies match
    if (params.assetPrice.currency !== params.debtRequirement.currency) {
      throw new Error(
        `Currency mismatch: assetPrice currency (${params.assetPrice.currency}) must match debtRequirement currency (${params.debtRequirement.currency}).`
      );
    }

    // Assert thresholds ordering: Initial LTV <= Maintenance LTV <= Liquidation LTV
    if (params.initialLtvThreshold.percentage > params.maintenanceLtvThreshold.percentage) {
      throw new Error(
        `Threshold validation failed: initialLtvThreshold (${params.initialLtvThreshold.toString()}) must be <= maintenanceLtvThreshold (${params.maintenanceLtvThreshold.toString()}).`
      );
    }
    if (params.maintenanceLtvThreshold.percentage > params.liquidationLtvThreshold.percentage) {
      throw new Error(
        `Threshold validation failed: maintenanceLtvThreshold (${params.maintenanceLtvThreshold.toString()}) must be <= liquidationLtvThreshold (${params.liquidationLtvThreshold.toString()}).`
      );
    }

    this.id = params.id;
    this.collateralAsset = params.collateralAsset.trim().toUpperCase();
    this._collateralAmount = params.collateralAmount;
    this._assetPrice = params.assetPrice;
    this._debtRequirement = params.debtRequirement;
    this._initialLtvThreshold = params.initialLtvThreshold;
    this._maintenanceLtvThreshold = params.maintenanceLtvThreshold;
    this._liquidationLtvThreshold = params.liquidationLtvThreshold;
    
    // Initialize current health status
    this._currentHealthStatus = this.evaluateHealthStatus();
  }

  // Getters
  get collateralAmount(): number {
    return this._collateralAmount;
  }

  get assetPrice(): Money {
    return this._assetPrice;
  }

  get debtRequirement(): Money {
    return this._debtRequirement;
  }

  get initialLtvThreshold(): LTV {
    return this._initialLtvThreshold;
  }

  get maintenanceLtvThreshold(): LTV {
    return this._maintenanceLtvThreshold;
  }

  get liquidationLtvThreshold(): LTV {
    return this._liquidationLtvThreshold;
  }

  get currentHealthStatus(): HealthStatus {
    return this._currentHealthStatus;
  }

  /**
   * Retrieves and clears accumulated domain events.
   */
  pullEvents(): DomainEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  /**
   * Calculates the current Loan-to-Value (LTV) ratio.
   */
  calculateCurrentLtv(): LTV {
    const collateralValue = this._collateralAmount * this._assetPrice.value;
    if (collateralValue === 0) {
      return this._debtRequirement.value > 0 ? LTV.create(Infinity) : LTV.create(0);
    }
    return LTV.create(this._debtRequirement.value / collateralValue);
  }

  /**
   * Updates the collateral amount and recomputes health status.
   */
  updateCollateralAmount(newAmount: number): void {
    if (newAmount < 0) {
      throw new Error(`Collateral amount cannot be negative: ${newAmount}`);
    }
    const oldLtv = this.calculateCurrentLtv().percentage;
    const oldStatus = this._currentHealthStatus;

    this._collateralAmount = newAmount;
    this.recompute(oldLtv, oldStatus);
  }

  /**
   * Updates the asset price and recomputes health status.
   */
  updateAssetPrice(newPrice: Money): void {
    if (newPrice.currency !== this._debtRequirement.currency) {
      throw new Error(
        `Currency mismatch: new price currency (${newPrice.currency}) must match debt currency (${this._debtRequirement.currency}).`
      );
    }
    const oldLtv = this.calculateCurrentLtv().percentage;
    const oldStatus = this._currentHealthStatus;

    this._assetPrice = newPrice;
    this.recompute(oldLtv, oldStatus);
  }

  /**
   * Updates the debt requirement and recomputes health status.
   */
  updateDebtRequirement(newDebt: Money): void {
    if (newDebt.currency !== this._assetPrice.currency) {
      throw new Error(
        `Currency mismatch: new debt currency (${newDebt.currency}) must match price currency (${this._assetPrice.currency}).`
      );
    }
    const oldLtv = this.calculateCurrentLtv().percentage;
    const oldStatus = this._currentHealthStatus;

    this._debtRequirement = newDebt;
    this.recompute(oldLtv, oldStatus);
  }

  /**
   * Updates the LTV thresholds, asserting the order rule.
   */
  updateThresholds(initial: LTV, maintenance: LTV, liquidation: LTV): void {
    if (initial.percentage > maintenance.percentage) {
      throw new Error(
        `Threshold validation failed: initial LTV (${initial.toString()}) must be <= maintenance LTV (${maintenance.toString()}).`
      );
    }
    if (maintenance.percentage > liquidation.percentage) {
      throw new Error(
        `Threshold validation failed: maintenance LTV (${maintenance.toString()}) must be <= liquidation LTV (${liquidation.toString()}).`
      );
    }
    const oldLtv = this.calculateCurrentLtv().percentage;
    const oldStatus = this._currentHealthStatus;

    this._initialLtvThreshold = initial;
    this._maintenanceLtvThreshold = maintenance;
    this._liquidationLtvThreshold = liquidation;
    this.recompute(oldLtv, oldStatus);
  }

  private recompute(oldLtv: number, oldStatus: HealthStatus): void {
    const newStatus = this.evaluateHealthStatus();
    this._currentHealthStatus = newStatus;
    
    const newLtv = this.calculateCurrentLtv().percentage;

    // Trigger RecomputeEvent if status or LTV changes
    if (oldStatus !== newStatus || oldLtv !== newLtv) {
      this._events.push(new RecomputeEvent(this.id, oldLtv, newLtv, oldStatus, newStatus));
    }
  }

  private evaluateHealthStatus(): HealthStatus {
    const collateralValue = this._collateralAmount * this._assetPrice.value;
    if (collateralValue === 0) {
      return this._debtRequirement.value > 0 ? HealthStatus.LIQUIDATION : HealthStatus.GOOD_STANDING;
    }

    const currentLtv = this._debtRequirement.value / collateralValue;
    const initialLtv = this._initialLtvThreshold.percentage;
    const maintenanceLtv = this._maintenanceLtvThreshold.percentage;
    const liquidationLtv = this._liquidationLtvThreshold.percentage;

    if (currentLtv > liquidationLtv) {
      return HealthStatus.LIQUIDATION;
    }
    if (currentLtv > maintenanceLtv) {
      return HealthStatus.MAINTENANCE_MARGIN_CALL;
    }
    if (currentLtv > initialLtv) {
      return HealthStatus.INITIAL_MARGIN_CALL;
    }
    if (currentLtv > initialLtv * 0.90) {
      return HealthStatus.NEAR_MARGIN;
    }
    return HealthStatus.GOOD_STANDING;
  }
}
