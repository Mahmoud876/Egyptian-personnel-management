import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type FormEvent, useState } from 'react';
import { api, errorMessage, unwrap } from '../../../shared/api/client';
import { ar } from '../../../shared/i18n/ar';
import { BadgeIcon, SearchIcon } from '../../../shared/ui/icons';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { TablePager } from '../../../shared/ui/TablePager';
import type { Recruit, RecruitsQuery } from '../api';

type Props = {
  title: string;
  subtitle: string;
  onFound: (recruit: Recruit) => void;
  /** Labels also support barcode/police/name search; entry retains national-ID lookup. */
  allowIdentifiers?: boolean;
  compact?: boolean;
};
type Matches = { items: Recruit[]; total: number; page: number; page_size: number };

/** Partial identifiers show selectable matches; never choose the first of several. */
export function NationalIdLookup({ title, subtitle, onFound, allowIdentifiers = false, compact = false }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState('identity');
  const [year, setYear] = useState('');
  const [matches, setMatches] = useState<Matches | null>(null);
  const [criteria, setCriteria] = useState<RecruitsQuery | null>(null);
  const police = mode === 'police_number' && allowIdentifiers;
  const placeholder = police ? ar.conscripts.fields.policeNumber
    : allowIdentifiers ? ar.conscripts.lookup.placeholderEither : ar.conscripts.lookup.placeholder;
  const clearResults = () => { setError(null); setMatches(null); };

  const load = async (query: RecruitsQuery, exactValue?: string) => {
    setPending(true);
    setError(null);
    setMatches(null);
    setCriteria(query);
    try {
      const result = await unwrap(api.GET('/api/v1/recruits', { params: { query } }));
      const only = result.total === 1 ? result.items[0] : undefined;
      const exact = only && (query.police_number ? only.police_number === exactValue
        : query.national_id ? only.national_id === exactValue
          : [only.national_id, only.barcode, only.police_number].includes(exactValue ?? ''));
      if (exact) onFound(only);
      else if (!result.total) setError(police ? ar.conscripts.lookup.policeNotFound : ar.conscripts.lookup.notFound);
      else setMatches(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    clearResults();
    const term = value.trim();
    if (!term || (!allowIdentifiers && !/^[0-9]{1,14}$/.test(term))) {
      setError(allowIdentifiers ? ar.conscripts.lookup.searchRequired : ar.conscripts.lookup.invalid);
      return;
    }
    if (police && (!/^[0-9]{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2100)) {
      setError(ar.conscripts.lookup.policeYearRequired);
      return;
    }
    const query: RecruitsQuery = { page: 1, page_size: 10,
      ...(police ? { police_number: term, enlistment_year: Number(year) }
        : allowIdentifiers ? { search: term } : { national_id: term }),
    };
    void load(query, term);
  };

  return (
    <SectionCard icon={<BadgeIcon />} title={title} subtitle={subtitle}>
      {allowIdentifiers && (
        <TextField select label={ar.conscripts.search.searchBy} value={mode} disabled={pending}
          onChange={(event) => { setMode(event.target.value); clearResults(); }} sx={{ mb: 2, minWidth: 260 }}>
          <MenuItem value="identity">{ar.conscripts.lookup.placeholderEither}</MenuItem>
          <MenuItem value="police_number">{ar.conscripts.lookup.policeMode}</MenuItem>
        </TextField>
      )}
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start',
        flexDirection: compact ? 'column' : { xs: 'column', sm: 'row' }, '& > *': compact ? { width: '100%' } : {} }}>
        <TextField value={value} disabled={pending} fullWidth placeholder={placeholder}
          onChange={(event) => { setValue(event.target.value); clearResults(); }}
          error={error !== null} helperText={error ?? ar.conscripts.lookup.partialHint}
          slotProps={{ htmlInput: { dir: allowIdentifiers ? 'auto' : 'ltr', inputMode: allowIdentifiers ? 'text' : 'numeric',
            maxLength: police ? 20 : allowIdentifiers ? 200 : 14, 'aria-label': placeholder } }} />
        {police && (
          <TextField required value={year} disabled={pending} placeholder={ar.conscripts.enlistmentYear}
            onChange={(event) => { setYear(event.target.value.replace(/[^0-9]/g, '').slice(0, 4)); clearResults(); }}
            slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'numeric', 'aria-label': ar.conscripts.enlistmentYear } }}
            sx={{ width: { xs: '100%', sm: 180 }, flexShrink: 0 }} />
        )}
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} disabled={pending} sx={{ flexShrink: 0 }}>
          {pending ? ar.common.searching : ar.conscripts.lookup.submit}
        </Button>
      </Box>
      {matches && criteria && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info">{ar.conscripts.lookup.chooseMatch(matches.total)}</Alert>
          <Stack component="ul" spacing={1} sx={{ p: 0, listStyle: 'none' }}>
            {matches.items.map((recruit) => (
              <Box component="li" key={recruit.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{recruit.name}</Typography>
                <Typography variant="body2">{ar.conscripts.fields.nationalId}: <bdi>{recruit.national_id}</bdi></Typography>
                <Typography variant="body2">{ar.conscripts.fields.barcode}: <bdi>{recruit.barcode ?? '—'}</bdi></Typography>
                <Typography variant="body2">{ar.conscripts.fields.policeNumber}: <bdi>{recruit.police_number ?? '—'}</bdi>
                  {' / '}{ar.conscripts.enlistmentYear}: <bdi>{recruit.enlistment_year}</bdi></Typography>
                <Button onClick={() => onFound(recruit)} disabled={pending}
                  aria-label={ar.conscripts.lookup.selectMatch(recruit.name, recruit.national_id)}>{ar.conscripts.lookup.select}</Button>
              </Box>
            ))}
          </Stack>
          <TablePager page={matches.page - 1} pageSize={matches.page_size} total={matches.total}
            onPageChange={(page) => { if (!pending) void load({ ...criteria, page: page + 1 }); }} />
        </Box>
      )}
    </SectionCard>
  );
}
