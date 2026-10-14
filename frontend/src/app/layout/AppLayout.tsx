import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Fragment, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useMe } from '../../shared/auth/auth';
import { ar } from '../../shared/i18n/ar';
import { KeyIcon, LogoutIcon, MenuIcon, PersonIcon, ShieldIcon } from '../../shared/ui/icons';
import { activeMenuPath, visibleMenu } from '../menu';

const SIDEBAR_WIDTH = 264;

function SidebarContent() {
  const { data: me } = useMe();
  const { pathname } = useLocation();
  const groups = visibleMenu(me?.permissions ?? []);
  const active = activeMenuPath(pathname, groups);

  return (
    <Box component="nav" aria-label={ar.app.title}>
      <Box sx={{ px: 2.5, py: 2.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ShieldIcon color="primary" sx={{ fontSize: 36 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{ar.app.title}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ar.app.subtitle}
          </Typography>
        </Box>
      </Box>
      <Divider />
      <List dense sx={{ px: 1, py: 1 }}>
        {groups.map((group, index) => (
          <Fragment key={group.label ?? index}>
            {group.label && (
              <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: 2.5, mt: 1, fontWeight: 700 }}>
                {group.label}
              </ListSubheader>
            )}
            {group.items.map((item) => (
              <ListItemButton
                key={item.path}
                component={Link}
                to={item.path}
                selected={item.path === active}
                sx={{
                  borderRadius: 1.5,
                  mb: 0.25,
                  '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText' },
                  '&.Mui-selected:hover': { bgcolor: 'primary.dark' },
                  '&.Mui-selected .MuiListItemIcon-root': { color: 'inherit' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <item.icon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </Fragment>
        ))}
      </List>
    </Box>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const signOut = () => {
    setAnchor(null);
    logout.mutate(undefined, { onSettled: () => void navigate('/login', { replace: true }) });
  };

  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 1 }}>
        <IconButton
          edge="start"
          aria-label={ar.layout.openMenu}
          onClick={onOpenMenu}
          sx={{ display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <Button
          color="inherit"
          startIcon={<PersonIcon />}
          aria-label={ar.layout.userMenu}
          aria-haspopup="menu"
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          {me?.full_name}
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
      </Toolbar>
    </AppBar>
  );
}

/**
 * Signed-in shell: sidebar on the start (right, in RTL) side, top bar with the user menu.
 * Styles are written in LTR terms (borderRight etc.); the RTL stylis plugin flips them.
 */
export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto',
            bgcolor: 'background.paper',
            borderRight: 1,
            borderColor: 'divider',
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
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
