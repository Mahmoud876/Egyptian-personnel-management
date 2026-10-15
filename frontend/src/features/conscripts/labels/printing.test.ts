import { afterEach, expect, it, vi } from 'vitest';
import { ar } from '../../../shared/i18n/ar';
import { fitLabelDocument, printLabel } from './printing';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function labelDocument(alwaysTooLong = false) {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = '<div class="name">الاسم الكامل دون حذف</div><div class="ids">12345 / 2026</div><svg width="30.25mm"></svg>';
  const name = doc.querySelector<HTMLElement>('.name')!;
  const ids = doc.querySelector<HTMLElement>('.ids')!;
  for (const element of [name, ids]) {
    Object.defineProperties(element, { clientWidth: { value: 180 }, scrollWidth: { value: 180 }, clientHeight: { value: 26 } });
  }
  Object.defineProperty(ids, 'scrollHeight', { value: 12 });
  Object.defineProperty(name, 'scrollHeight', { get: () => alwaysTooLong || Number.parseFloat(name.style.fontSize || '9') > 7 ? 40 : 24 });
  return doc;
}

it('fits the complete name without rescaling the barcode', () => {
  const doc = labelDocument();
  fitLabelDocument(doc);
  expect(doc.querySelector<HTMLElement>('.name')!.style.fontSize).toBe('7pt');
  expect(doc.querySelector('.name')!.textContent).toBe('الاسم الكامل دون حذف');
  expect(doc.querySelector('svg')!.getAttribute('width')).toBe('30.25mm');
});

it('rejects a name that cannot fit instead of silently clipping it', () => {
  expect(() => fitLabelDocument(labelDocument(true))).toThrow(ar.conscripts.labels.fitError);
});

it.each([false, true])('waits for fonts and only opens print for a fitting label (overflow=%s)', async (overflow) => {
  vi.useFakeTimers();
  const doc = labelDocument(overflow);
  let fontsReady!: () => void;
  Object.defineProperty(doc, 'fonts', { value: { ready: new Promise<void>((resolve) => { fontsReady = resolve; }) } });
  const frame = document.createElement('iframe');
  const target = { focus: vi.fn(), print: vi.fn(), addEventListener: vi.fn() };
  Object.defineProperty(frame, 'contentDocument', { value: doc });
  Object.defineProperty(frame, 'contentWindow', { value: target });
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => tag === 'iframe' ? frame : create(tag, options));
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', { status: 200 })));
  const result = printLabel('synthetic-id');
  // Attach a rejection handler before resolving fonts to avoid unhandled rejection races.
  const outcome = result.then(() => null, (error: Error) => error);
  await vi.waitFor(() => expect(frame.isConnected).toBe(true));
  frame.dispatchEvent(new Event('load'));
  await Promise.resolve();
  expect(target.print).not.toHaveBeenCalled();
  fontsReady();
  const error = await outcome;
  if (overflow) {
    expect(error?.message).toBe(ar.conscripts.labels.fitError);
    expect(target.print).not.toHaveBeenCalled();
    expect(frame.isConnected).toBe(false);
  } else {
    expect(error).toBeNull();
    expect(target.print).toHaveBeenCalledOnce();
    expect(target.addEventListener).toHaveBeenCalledWith('afterprint', expect.any(Function), { once: true });
  }
  vi.clearAllTimers();
});
