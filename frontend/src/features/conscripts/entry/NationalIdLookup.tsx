import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { BadgeIcon, SearchIcon } from '../../../shared/ui/icons';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { type Recruit, useFindByNationalId } from '../api';
import { NATIONAL_ID_PATTERN } from '../rules';

type Props = {
  title: string;
  subtitle: string;
  onFound: (recruit: Recruit) => void;
  /** Also accept a 12-digit barcode (label printing looks recruits up either way). */
  findByBarcode?: (barcode: string) => Promise<Recruit | null>;
  /** Stack the field over a full-width button, for narrow side columns. */
  compact?: boolean;
};

/** "Look up by national ID" card at the top of the entry and label screens. */
export function NationalIdLookup({ title, subtitle, onFound, findByBarcode, compact = false }: Props) {
  const find = useFindByNationalId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const id = value.trim();
    setError(null);
    find.reset();
    if (findByBarcode && /^[0-9]{12}$/.test(id)) {
      setSearching(true);
      try {
        const recruit = await findByBarcode(id);
        if (recruit) onFound(recruit);
        else setError(ar.conscripts.lookup.notFound);
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setSearching(false);
      }
      return;
    }
    if (!NATIONAL_ID_PATTERN.test(id)) {
      setError(findByBarcode ? ar.conscripts.lookup.invalidEither : ar.conscripts.lookup.invalid);
      return;
    }
    find.mutate(id, { onSuccess: onFound });
  };

  const pending = find.isPending || searching;
  return (
    <SectionCard icon={<BadgeIcon />} title={title} subtitle={subtitle}>
      <Box
        component="form"
        onSubmit={(event) => void submit(event)}
        noValidate
        sx={{
          display: 'flex',
          gap: 1.5,
          alignItems: 'flex-start',
          flexDirection: compact ? 'column' : { xs: 'column', sm: 'row' },
          '& > *': compact ? { width: '100%' } : {},
        }}
      >
        <TextField
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, '').slice(0, 14))}
          placeholder={findByBarcode ? ar.conscripts.lookup.placeholderEither : ar.conscripts.lookup.placeholder}
          fullWidth
          error={error !== null}
          helperText={error ?? undefined}
          slotProps={{
            htmlInput: {
              dir: 'ltr',
              inputMode: 'numeric',
              'aria-label': findByBarcode ? ar.conscripts.lookup.placeholderEither : ar.conscripts.lookup.placeholder,
            },
          }}
        />
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} disabled={pending} sx={{ flexShrink: 0 }}>
          {pending ? ar.common.searching : ar.conscripts.lookup.submit}
        </Button>
      </Box>
      {find.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {errorMessage(find.error)}
        </Alert>
      )}
    </SectionCard>
  );
}
