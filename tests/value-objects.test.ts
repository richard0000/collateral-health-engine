import { describe, it, expect } from 'vitest';
import { Money, LTV } from '../src/domain/value-objects.js';

describe('Money Value Object', () => {
  it('should create valid Money instances', () => {
    const usd = new Money(100, 'USD');
    expect(usd.value).toBe(100);
    expect(usd.currency).toBe('USD');
  });

  it('should lowercase or untrimmed currencies to normalized uppercase', () => {
    const usd = new Money(100, ' usd ');
    expect(usd.currency).toBe('USD');
  });

  it('should throw error on negative value', () => {
    expect(() => new Money(-1, 'USD')).toThrow('Value cannot be negative');
  });

  it('should throw error on invalid/NaN values', () => {
    expect(() => new Money(NaN, 'USD')).toThrow('Value must be a finite number');
    expect(() => new Money(Infinity, 'USD')).toThrow('Value must be a finite number');
  });

  it('should throw error on empty currency', () => {
    expect(() => new Money(100, '')).toThrow('Currency must be a non-empty string');
    expect(() => new Money(100, '   ')).toThrow('Currency must be a non-empty string');
  });

  it('should check equality correctly', () => {
    const usd1 = Money.create(100, 'USD');
    const usd2 = Money.create(100, 'USD');
    const eur = Money.create(100, 'EUR');
    const usdDiff = Money.create(150, 'USD');

    expect(usd1.equals(usd2)).toBe(true);
    expect(usd1.equals(eur)).toBe(false);
    expect(usd1.equals(usdDiff)).toBe(false);
  });

  it('should perform addition correctly', () => {
    const m1 = Money.create(100, 'USD');
    const m2 = Money.create(50, 'USD');
    const result = m1.add(m2);

    expect(result.value).toBe(150);
    expect(result.currency).toBe('USD');
  });

  it('should throw on addition currency mismatch', () => {
    const m1 = Money.create(100, 'USD');
    const m2 = Money.create(50, 'EUR');

    expect(() => m1.add(m2)).toThrow('Currency mismatch');
  });

  it('should perform subtraction correctly', () => {
    const m1 = Money.create(100, 'USD');
    const m2 = Money.create(40, 'USD');
    const result = m1.subtract(m2);

    expect(result.value).toBe(60);
  });

  it('should throw on subtraction currency mismatch', () => {
    const m1 = Money.create(100, 'USD');
    const m2 = Money.create(40, 'EUR');

    expect(() => m1.subtract(m2)).toThrow('Currency mismatch');
  });

  it('should throw if subtraction results in negative value', () => {
    const m1 = Money.create(100, 'USD');
    const m2 = Money.create(150, 'USD');

    expect(() => m1.subtract(m2)).toThrow('Insufficient funds');
  });

  it('should perform multiplication correctly', () => {
    const usd = Money.create(100, 'USD');
    expect(usd.multiply(1.5).value).toBe(150);
    expect(usd.multiply(0).value).toBe(0);
  });

  it('should throw on invalid multiplication factors', () => {
    const usd = Money.create(100, 'USD');
    expect(() => usd.multiply(-1)).toThrow('Factor must be a non-negative finite number');
    expect(() => usd.multiply(Infinity)).toThrow('Factor must be a non-negative finite number');
    expect(() => usd.multiply(NaN)).toThrow('Factor must be a non-negative finite number');
  });

  it('should perform division correctly', () => {
    const usd = Money.create(100, 'USD');
    expect(usd.divide(4).value).toBe(25);
  });

  it('should throw on invalid division divisors', () => {
    const usd = Money.create(100, 'USD');
    expect(() => usd.divide(0)).toThrow('Divisor must be a positive finite number');
    expect(() => usd.divide(-2)).toThrow('Divisor must be a positive finite number');
    expect(() => usd.divide(Infinity)).toThrow('Divisor must be a positive finite number');
    expect(() => usd.divide(NaN)).toThrow('Divisor must be a positive finite number');
  });
});

describe('LTV Value Object', () => {
  it('should create valid LTV instances', () => {
    const ltv = new LTV(0.50);
    expect(ltv.percentage).toBe(0.50);
    expect(ltv.toString()).toBe('50.00%');
  });

  it('should allow Infinity as a valid percentage', () => {
    const ltv = LTV.create(Infinity);
    expect(ltv.percentage).toBe(Infinity);
    expect(ltv.toString()).toBe('Infinity%');
  });

  it('should throw on negative percentages', () => {
    expect(() => new LTV(-0.1)).toThrow('Percentage cannot be negative');
  });

  it('should throw on NaN', () => {
    expect(() => new LTV(NaN)).toThrow('Percentage cannot be NaN');
  });

  it('should compare LTV instances correctly', () => {
    const l1 = LTV.create(0.40);
    const l2 = LTV.create(0.50);
    const l3 = LTV.create(0.50);

    expect(l1.isLessThan(l2)).toBe(true);
    expect(l2.isLessThan(l1)).toBe(false);

    expect(l1.isLessThanOrEqual(l2)).toBe(true);
    expect(l2.isLessThanOrEqual(l3)).toBe(true);

    expect(l2.isGreaterThan(l1)).toBe(true);
    expect(l1.isGreaterThan(l2)).toBe(false);

    expect(l2.isGreaterThanOrEqual(l3)).toBe(true);
    expect(l2.isGreaterThanOrEqual(l1)).toBe(true);

    expect(l2.equals(l3)).toBe(true);
    expect(l2.equals(l1)).toBe(false);
  });
});
