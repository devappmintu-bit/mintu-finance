/**
 * Round 52e — utils/format unit tests.
 */
import { fmtINR, fmtINRDecimal, fmtCount } from '../utils/format';

describe('fmtINR', () => {
  it('formats positive integers with the rupee glyph', () => {
    expect(fmtINR(450)).toBe('₹450');
    expect(fmtINR(1500)).toBe('₹1,500');
  });

  it('formats Indian-style lakhs / crores grouping', () => {
    // Indian numbering: 1,00,000  /  1,00,00,000
    expect(fmtINR(100000)).toBe('₹1,00,000');
    expect(fmtINR(10000000)).toBe('₹1,00,00,000');
  });

  it('rounds floats to nearest integer (no decimals shown)', () => {
    expect(fmtINR(99.4)).toBe('₹99');
    expect(fmtINR(99.6)).toBe('₹100');
  });

  it('treats null / undefined as zero', () => {
    expect(fmtINR(null)).toBe('₹0');
    expect(fmtINR(undefined)).toBe('₹0');
  });

  it('handles non-finite inputs gracefully', () => {
    expect(fmtINR(NaN)).toBe('₹0');
    expect(fmtINR(Infinity)).toBe('₹0');
  });

  it('handles negative amounts', () => {
    expect(fmtINR(-450)).toBe('₹-450');
  });
});

describe('fmtINRDecimal', () => {
  it('respects digit count parameter', () => {
    expect(fmtINRDecimal(1234.5, 2)).toBe('₹1,234.50');
    expect(fmtINRDecimal(1234.5, 0)).toBe('₹1,235');
  });

  it('defaults to two digits', () => {
    expect(fmtINRDecimal(10)).toBe('₹10.00');
  });

  it('falls back to ₹0 for non-finite input', () => {
    expect(fmtINRDecimal(NaN)).toBe('₹0');
  });
});

describe('fmtCount', () => {
  it('uses singular for n=1', () => {
    expect(fmtCount(1, 'draft')).toBe('1 draft');
  });

  it('uses plural for n!=1', () => {
    expect(fmtCount(0, 'draft')).toBe('0 drafts');
    expect(fmtCount(2, 'draft')).toBe('2 drafts');
  });

  it('honours custom plural override', () => {
    expect(fmtCount(2, 'person', 'people')).toBe('2 people');
  });
});
