import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ar } from '../../../shared/i18n/ar';
import { ErrorAlert, LoadingState } from '../../../shared/ui/states';
import type { Recruit } from '../api';
import { fetchLabelHtml, prepareLabelFrame } from './printing';

export function LabelPreview({ recruit }: { recruit: Recruit }) {
  const [layoutError, setLayoutError] = useState<unknown>(null);
  const label = useQuery({ queryKey: ['label-preview', recruit.id, recruit.revision],
    queryFn: () => fetchLabelHtml(recruit.id, true) });
  if (label.isPending) return <LoadingState />;
  if (label.isError) return <ErrorAlert error={label.error} onRetry={() => void label.refetch()} />;
  return <Box sx={{ bgcolor: 'surface.container', p: 3, overflowX: 'auto' }}>
    {layoutError !== null && <ErrorAlert error={layoutError} />}
    <Box sx={{ width: '120mm', height: '60mm', position: 'relative', mx: 'auto', bgcolor: '#fff' }}>
      <iframe title={ar.conscripts.labels.previewLabel(recruit.name)} srcDoc={label.data}
        style={{ position: 'absolute', top: 0, left: 0, width: '50mm', height: '25mm', border: 0,
          transform: 'scale(2.4)', transformOrigin: 'top left', pointerEvents: 'none' }}
        onLoad={(event) => { setLayoutError(null); void prepareLabelFrame(event.currentTarget).catch(setLayoutError); }} />
    </Box>
    <Typography variant="caption" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
      {ar.conscripts.labels.subtitle}
    </Typography>
  </Box>;
}
