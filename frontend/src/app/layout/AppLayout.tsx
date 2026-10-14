import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { conscriptsPaths } from '../../features/conscripts/paths';
import { useLogout, useMe } from '../../shared/auth/auth';
import { ar } from '../../shared/i18n/ar';
import { usePermission } from '../../shared/permissions/permissions';
import { Emblem } from '../../shared/ui/Emblem';
import { ExpandMoreIcon, KeyIcon, LogoutIcon, MenuIcon, SearchIcon } from '../../shared/ui/icons';
import { InitialsAvatar } from '../../shared/ui/InitialsAvatar';
import { BreadcrumbProvider } from '../../shared/ui/PageHeader';
import { tokens, tones } from '../../shared/ui/tokens';
import { activeMenuPath, activeTrail, visibleMenu } from '../menu';
import { useHealthQuery } from '../useHealthQuery';

const SIDEBAR_WIDTH = 240;
const BAR_HEIGHT = 64;

function Brand() {
  return (
    <Box
      sx={{
        height: BAR_HEIGHT,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Emblem size={34} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" noWrap sx={{ color: 'primary.main', lineHeight: '22px' }}>
          {ar.app.title}
        </Typography>
        <Typography variant="caption" component="div" noWrap sx={{ color: 'text.secondary', fontSize: 11 }}>
          {ar.app.subtitle}
        </Typography>
      </Box>
    </Box>
  );
}

/** Server and database reachability, from the public health check. */
function ConnectionStatus() {
  const health = useHealthQuery();
  const online = health.data?.status === 'ok';
  const known = health.data !== undefined || health.isError;
  const tone = !known ? null : online ? tones.success : tones.error;
  return (
    <Box sx={{ m: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'surface.low' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {ar.layout.connection}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            component="span"
            aria-hidden
            sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tone?.fg ?? tokens.outline }}
          />
          <Typography variant="caption" sx={{ fontWeight: 600, color: tone?.fg ?? 'text.secondary' }}>
            {!known ? ar.health.checking : online ? ar.health.operational : ar.health.degraded}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function SidebarContent() {
  const { data: me } = useMe();
  const { pathname } = useLocation();
  const groups = visibleMenu(me?.permissions ?? []);
  const active = activeMenuPath(pathname, groups);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Brand />
      <Box component="nav" aria-label={ar.app.title} sx={{ flex: 1, overflowY: 'auto', px: 1, py: 1.5 }}>
        {groups.map((group) => (
          <Box key={group.label} sx={{ mb: 1.5 }}>
            <Typography variant="caption" component="div" sx={{ px: 1, py: 0.5, color: 'text.secondary' }}>
              {group.label}
            </Typography>
            <List disablePadding>
              {group.items.map((item) => (
                <ListItemButton
                  key={item.path}
                  component={Link}
                  to={item.path}
                  selected={item.path === active}
                  aria-current={item.path === active ? 'page' : undefined}
                  sx={{
                    borderRadius: 1,
                    px: 1,
                    py: 0.875,
                    mb: 0.25,
                    color: tokens.onSurfaceVariant,
                    '&:hover': { bgcolor: tokens.surfaceHigh, color: tokens.onSurface },
                    '&.Mui-selected': { bgcolor: tokens.surfaceLow, color: tokens.primary, fontWeight: 600 },
                    '&.Mui-selected:hover': { bgcolor: tokens.surfaceContainer },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 30, color: 'inherit' }}>
                    <item.icon sx={{ fontSize: 19 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, fontWeight: 'inherit' } } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
      </Box>
      <ConnectionStatus />
    </Box>
  );
}

/** Jumps to the conscripts search with the typed national ID, barcode or name. */
function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    void navigate(`${conscriptsPaths.search}?q=${encodeURIComponent(q)}`);
    setValue('');
  };

  return (
    <Box
      component="form"
      role="search"
      onSubmit={submit}
      sx={{
        display: { xs: 'none', sm: 'flex' },
        alignItems: 'center',
        gap: 1,
        width: { sm: 260, md: 340 },
        height: 36,
        px: 1.25,
        borderRadius: 1,
        bgcolor: 'surface.main',
        border: 1,
        borderColor: 'outline.variant',
        '&:focus-within': { borderColor: 'primary.main', bgcolor: 'background.paper' },
      }}
    >
      <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
      <InputBase
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={ar.layout.searchPlaceholder}
        inputProps={{ 'aria-label': ar.layout.searchPlaceholder }}
        sx={{ flex: 1, fontSize: 14 }}
      />
    </Box>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { data: me } = useMe();
  const canSearch = usePermission('conscripts.view');
  const logout = useLogout();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const signOut = () => {
    setAnchor(null);
    logout.mutate(undefined, { onSettled: () => void navigate('/login', { replace: true }) });
  };

  const roleLabel = me?.role === 'system_administrator' ? ar.users.adminRole : ar.users.operatorRole;

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', zIndex: (t) => t.zIndex.appBar }}
    >
      <Toolbar disableGutters sx={{ minHeight: `${BAR_HEIGHT}px !important`, gap: 1.5, px: { xs: 1.5, md: 3 } }}>
        <IconButton aria-label={ar.layout.openMenu} onClick={onOpenMenu} sx={{ display: { md: 'none' } }}>
          <MenuIcon />
        </IconButton>
        {canSearch && <GlobalSearch />}
        <Box sx={{ flex: 1 }} />
        <Button
          color="inherit"
          aria-label={ar.layout.userMenu}
          aria-haspopup="menu"
          onClick={(event) => setAnchor(event.currentTarget)}
          endIcon={<ExpandMoreIcon sx={{ color: 'text.secondary' }} />}
          sx={{ px: 1, '&:hover': { bgcolor: 'surface.high' } }}
        >
          <Box sx={{ textAlign: 'start', lineHeight: 1 }}>
            <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600 }}>
              {me?.full_name}
            </Typography>
            <Typography variant="caption" component="div" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {roleLabel}
            </Typography>
          </Box>
        </Button>
        <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
          <MenuItem component={Link} to="/change-password" onClick={() => setAnchor(null)}>
            <ListItemIcon>
              <KeyIcon fontSize="small" />
            </ListItemIcon>
            {ar.auth.changePassword}
          </MenuItem>
          <MenuItem onClick={signOut}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            {ar.auth.logout}
          </MenuItem>
        </Menu>
        <Divider orientation="vertical" flexItem sx={{ my: 2, display: { xs: 'none', sm: 'block' } }} />
        <Button
          color="inherit"
          startIcon={<LogoutIcon />}
          onClick={signOut}
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            color: 'text.secondary',
            fontWeight: 500,
            fontSize: 13,
            '&:hover': { color: 'error.main', bgcolor: 'surface.high' },
          }}
        >
          {ar.auth.logout}
        </Button>
        {me && <InitialsAvatar name={me.full_name} size={34} />}
      </Toolbar>
    </AppBar>
  );
}

/**
 * Signed-in shell: fixed sidebar on the start (right, in RTL) side, 64px top bar with search and the user.
 * Styles are written in LTR terms (borderRight etc.); the RTL stylis plugin flips them.
 */
export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const permissions = me?.permissions;
  const trail = useMemo(() => activeTrail(pathname, visibleMenu(permissions ?? [])), [pathname, permissions]);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            bgcolor: 'background.paper',
            borderRight: 1,
            borderColor: 'outline.variant',
          }}
        >
          <SidebarContent />
        </Box>
      </Box>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH } }}
      >
        <SidebarContent />
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, flex: 1 }}>
          <BreadcrumbProvider value={trail}>
            <Outlet />
          </BreadcrumbProvider>
        </Box>
      </Box>
    </Box>
  );
}
