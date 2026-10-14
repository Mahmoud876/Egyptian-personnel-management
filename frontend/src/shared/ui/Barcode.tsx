import Typography from '@mui/material/Typography';
import JsBarcode from 'jsbarcode';
import { useLayoutEffect, useRef, useState } from 'react';
import { ar } from '../i18n/ar';

type BarcodeProps = {
  value: string;
  /** Width of the narrowest bar. 0.25 mm = 2 dots on a 203 dpi label printer. */
  moduleMm?: number;
  barHeightMm?: number;
  /** Print the digits under the bars, for typing the value if the label is damaged. */
  showText?: boolean;
};

// SVG units per module. Bars are whole units, so every bar is a whole number of modules.
const UNITS_PER_MODULE = 2;
// Code 128 needs a blank zone of at least 10 modules on each side to scan reliably.
const QUIET_ZONE_MODULES = 10;

/**
 * Code 128 barcode as SVG, sized in millimetres so it prints at the intended bar width.
 * All-digit values of even length use subset C (two digits per symbol), the most compact form.
 */
export function Barcode({ value, moduleMm = 0.25, barHeightMm = 10, showText = true }: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [valid, setValid] = useState(true);

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const mmPerUnit = moduleMm / UNITS_PER_MODULE;
    let ok = false;
    JsBarcode(svg, value, {
      format: /^[0-9]+$/.test(value) && value.length % 2 === 0 ? 'CODE128C' : 'CODE128',
      width: UNITS_PER_MODULE,
      height: barHeightMm / mmPerUnit,
      margin: QUIET_ZONE_MODULES * UNITS_PER_MODULE,
      displayValue: showText,
      font: 'monospace',
      fontSize: 2.6 / mmPerUnit,
      textMargin: 0.6 / mmPerUnit,
      background: '#ffffff',
      lineColor: '#000000',
      valid: (result) => {
        ok = result;
      },
    });
    setValid(ok);
    if (!ok) return;
    // JsBarcode sizes the SVG in px; switch to mm (its viewBox stays, so the drawing scales exactly).
    const width = Number.parseFloat(svg.getAttribute('width') ?? '0');
    const height = Number.parseFloat(svg.getAttribute('height') ?? '0');
    svg.setAttribute('width', `${width * mmPerUnit}mm`);
    svg.setAttribute('height', `${height * mmPerUnit}mm`);
  }, [value, moduleMm, barHeightMm, showText]);

  if (!valid) {
    return <Typography color="error">{ar.barcode.invalid}</Typography>;
  }
  return <svg ref={ref} role="img" aria-label={`${ar.barcode.label} ${value}`} shapeRendering="crispEdges" />;
}
