import { createContext, useContext } from 'react';

export type Role = 'admin' | 'member';

export interface Me {
  authenticated: boolean;
  authDisabled: boolean;
  setupRequired: boolean;
  user: { id: number; username: string; role: Role } | null;
  /** Passkeys for the address being browsed: this account's, or anyone's while signed out. */
  passkeys: number;
  language: string | null;
}

export const MeContext = createContext<Me | null>(null);

export const useMe = () => useContext(MeContext);
/** Hub settings, frame setup and accounts. The server enforces it; the UI only hides what would fail. */
export const useIsAdmin = () => useMe()?.user?.role === 'admin';
