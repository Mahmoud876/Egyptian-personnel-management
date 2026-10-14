import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { type ReactNode, useId } from 'react';
import { errorMessage } from '../api/client';
import { ar } from '../i18n/ar';
import { CloseIcon, TaskAltIcon, WarningIcon } from './icons';
import { tones } from './tokens';

type ConfirmDialogProps = {
  open: boolean;
  /** error: destructive action (red icon and button). primary: a weighty but normal action. */
  tone: 'error' | 'primary';
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** A highlighted warning under the body, e.g. "this cannot be undone". */
  note?: { title: string; body: string };
  confirmLabel: string;
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  tone,
  title,
  subtitle,
  children,
  note,
  confirmLabel,
  confirmIcon,
  cancelLabel = ar.common.cancel,
  pending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const palette = tone === 'error' ? tones.error : tones.primary;
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby={titleId}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, px: 3, pt: 3, pb: 1 }}>
        <Box
          aria-hidden
          sx={{
            width: 48,
            height: 48,
            borderRadius: 1,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            bgcolor: palette.bg,
            color: palette.fg,
            '& svg': { fontSize: 26 },
          }}
        >
          {tone === 'error' ? <WarningIcon /> : <TaskAltIcon />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} variant="h6" component="h2">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton aria-label={ar.common.close} onClick={onClose} disabled={pending} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ color: 'text.primary', '& p': { m: 0, mb: 1 } }}>{children}</Box>
        {note && (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'surface.low',
              display: 'flex',
              gap: 1.5,
              alignItems: 'flex-start',
            }}
          >
            <WarningIcon sx={{ fontSize: 20, color: tones.error.fg, mt: 0.25 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: tones.error.fg }}>
                {note.title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {note.body}
              </Typography>
            </Box>
          </Box>
        )}
        {error !== undefined && error !== null && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage(error)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={tone}
          onClick={onConfirm}
          disabled={pending}
          startIcon={confirmIcon}
        >
          {pending ? ar.common.processing : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
