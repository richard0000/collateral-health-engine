/**
 * Represents a monetary value in a specific currency.
 * Immutable Value Object in DDD terms.
 */
export class Money {
  readonly value: number;
  readonly currency: string;

  constructor(value: number, currency: string) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid money value: ${value}. Value must be a finite number.`);
    }
    if (value < 0) {
      throw new Error(`Invalid money value: ${value}. Value cannot be negative.`);
    }
    if (!currency || typeof currency !== 'string' || currency.trim() === '') {
      throw new Error('Currency must be a non-empty string.');
    }

    this.value = value;
    this.currency = currency.trim().toUpperCase();
  }

  /**
   * Factory method to create a Money instance.
   */
  static create(value: number, currency: string): Money {
    return new Money(value, currency);
  }

  /**
   * Factory method for zero money in a specific currency.
   */
  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  /**
   * Checks equality with another Money instance.
   */
  equals(other: Money): boolean {
    return this.value === other.value && this.currency === other.currency;
  }

  /**
   * Adds another Money instance of the same currency.
   */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value + other.value, this.currency);
  }

  /**
   * Subtracts another Money instance of the same currency.
   */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this.value - other.value;
    if (result < 0) {
      throw new Error(
        `Insufficient funds: subtracting ${other.toString()} from ${this.toString()} results in negative value.`
      );
    }
    return new Money(result, this.currency);
  }

  /**
   * Multiplies the money value by a scalar factor.
   */
  multiply(factor: number): Money {
    if (!Number.isFinite(factor) || factor < 0) {
      throw new Error(
        `Invalid multiplication factor: ${factor}. Factor must be a non-negative finite number.`
      );
    }
    return new Money(this.value * factor, this.currency);
  }

  /**
   * Divides the money value by a scalar divisor.
   */
  divide(divisor: number): Money {
    if (!Number.isFinite(divisor) || divisor <= 0) {
      throw new Error(`Invalid divisor: ${divisor}. Divisor must be a positive finite number.`);
    }
    return new Money(this.value / divisor, this.currency);
  }

  /**
   * Formats money as a readable string.
   */
  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this.currency} and ${other.currency}.`
      );
    }
  }
}

/**
 * Represents a Loan-to-Value (LTV) ratio expressed as a fractional percentage (e.g., 0.50 for 50%).
 * Immutable Value Object in DDD terms.
 */
export class LTV {
  readonly percentage: number;

  constructor(percentage: number) {
    if (Number.isNaN(percentage)) {
      throw new Error(`Invalid LTV percentage: ${percentage}. Percentage cannot be NaN.`);
    }
    if (percentage < 0) {
      throw new Error(`Invalid LTV percentage: ${percentage}. Percentage cannot be negative.`);
    }
    this.percentage = percentage;
  }

  /**
   * Factory method to create an LTV instance.
   */
  static create(percentage: number): LTV {
    return new LTV(percentage);
  }

  /**
   * Checks equality with another LTV instance.
   */
  equals(other: LTV): boolean {
    return this.percentage === other.percentage;
  }

  isLessThan(other: LTV): boolean {
    return this.percentage < other.percentage;
  }

  isLessThanOrEqual(other: LTV): boolean {
    return this.percentage <= other.percentage;
  }

  isGreaterThan(other: LTV): boolean {
    return this.percentage > other.percentage;
  }

  isGreaterThanOrEqual(other: LTV): boolean {
    return this.percentage >= other.percentage;
  }

  /**
   * Returns the percentage formatted as a string (e.g. "50.00%").
   */
  toString(): string {
    return `${(this.percentage * 100).toFixed(2)}%`;
  }
}
