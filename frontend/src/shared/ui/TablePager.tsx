import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { formatNumber } from '../format';
import { ar } from '../i18n/ar';

type TablePagerProps = {
  /** Zero-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
};

/** Footer under a table: "عرض 1 إلى 20 من أصل 142", rows per page, numbered pages. */
export function TablePager({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions }: TablePagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1.5,
        px: 2,
        py: 1.25,
        bgcolor: 'surface.low',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {ar.pager.range(formatNumber(from), formatNumber(to), formatNumber(total))}
        </Typography>
        {onPageSizeChange && pageSizeOptions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }} id="pager-size-label">
              {ar.pager.perPage}
            </Typography>
            <Select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              inputProps={{ 'aria-labelledby': 'pager-size-label' }}
              sx={{ bgcolor: 'background.paper', '& .MuiSelect-select': { py: 0.5, fontSize: 13 } }}
            >
              {pageSizeOptions.map((size) => (
                <MenuItem key={size} value={size}>
                  {size}
                </MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </Box>
      {pages > 1 && (
        <Pagination
          count={pages}
          page={page + 1}
          onChange={(_, next) => onPageChange(next - 1)}
          shape="rounded"
          variant="outlined"
          size="small"
          siblingCount={1}
          boundaryCount={1}
        />
      )}
    </Box>
  );
}
