import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ar } from '../i18n/ar';
import { Barcode } from './Barcode';

beforeEach(() => {
  // jsdom has no canvas; JsBarcode only uses it to measure the digits under the bars.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('draws a 12-digit barcode in compact Code 128C at the requested bar width', () => {
  render(<Barcode value="202630001234" />);

  const svg = screen.getByRole('img', { name: `${ar.barcode.label} 202630001234` });
  // Code 128C: start + 6 symbols + check = 8 x 11 modules, + 13 for stop = 101 modules,
  // + 2 x 10 modules quiet zone = 121 modules x 0.25 mm.
  expect(svg.getAttribute('width')).toBe('30.25mm');
  expect(svg.querySelector('text')?.textContent).toBe('202630001234');
});

it('scales with the module width', () => {
  render(<Barcode value="202630001234" moduleMm={0.33} showText={false} />);

  const svg = screen.getByRole('img');
  expect(Number.parseFloat(svg.getAttribute('width') ?? '')).toBeCloseTo(121 * 0.33, 5);
  expect(svg.querySelector('text')).toBeNull();
});

it('shows an error instead of a broken barcode for invalid input', () => {
  // Code 128 encodes ASCII only.
  render(<Barcode value="باركود" />);

  expect(screen.getByText(ar.barcode.invalid)).toBeTruthy();
});
