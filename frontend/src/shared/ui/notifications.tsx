import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type Severity = 'success' | 'error' | 'info';
type Notice = { id: number; message: string; severity: Severity };
type Notify = (message: string, severity?: Severity) => void;

const NotifyContext = createContext<Notify>(() => undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const notify = useCallback<Notify>((message, severity = 'success') => {
    setNotice({ id: Date.now(), message, severity });
  }, []);
  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Snackbar
        key={notice?.id}
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={notice?.severity ?? 'success'} variant="filled" onClose={() => setNotice(null)}>
          {notice?.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify(): Notify {
  return useContext(NotifyContext);
}
