import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ar } from '../../shared/i18n/ar';
import { Mono } from '../../shared/ui/DataText';

/** Table cell content: "الدفعة الأولى" over "يناير 2026", so narrow columns don't wrap mid-label. */
export function BatchYear({ batch, year }: { batch: number; year: number }) {
  return (
    <Box sx={{ whiteSpace: 'nowrap' }}>
      {ar.conscripts.batchOrdinals[batch - 1] ?? batch}
      <Typography variant="caption" component="div" sx={{ color: 'text.secondary', fontWeight: 400 }}>
        {ar.conscripts.batchMonths[batch - 1]} <Mono>{year}</Mono>
      </Typography>
    </Box>
  );
}
