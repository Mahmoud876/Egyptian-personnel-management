import Box from '@mui/material/Box';
import { tokens } from './tokens';

/** The institutional shield from the Stitch design, drawn inline so it works offline. Decorative. */
export function Emblem({ size = 32 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      sx={{ width: size, height: size, flexShrink: 0, color: tokens.primary }}
    >
      <path d="M32 4L14 11V28.5C14 42.2 21.7 54.8 32 60C42.3 54.8 50 42.2 50 28.5V11L32 4Z" fill="currentColor" fillOpacity="0.08" />
      <path
        d="M32 6.5L16 12.8V28.5C16 41 22.8 52.4 32 57.2C41.2 52.4 48 41 48 28.5V12.8L32 6.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M32 16L27 22H37L32 16Z" fill={tokens.tertiaryContainer} />
      <path
        d="M22 25C24 24 28 23.5 32 23.5C36 23.5 40 24 42 25L44 32C41 31 37 30.5 32 30.5C27 30.5 23 31 20 32L22 25Z"
        fill="currentColor"
      />
      <path d="M28 32H36V44H28V32Z" fill="currentColor" />
      <path d="M22 27L18 36L26 35L24 42L28 38" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M42 27L46 36L38 35L40 42L36 38" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
      <rect x="29" y="34" width="6" height="8" rx="1" fill={tokens.tertiaryFixedDim} />
      <path d="M22 47C26 49 38 49 42 47" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </Box>
  );
}
