"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchAuthSession, type AuthMembership, type AuthUser } from "@/lib/auth";
import { clearCsrfToken } from "@/lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  memberships: AuthMembership[];
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<AuthMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clear = useCallback(() => {
    clearCsrfToken();
    setUser(null);
    setMemberships([]);
    setError(null);
    setIsLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await fetchAuthSession();
      setUser(session?.user ?? null);
      setMemberships(session?.memberships ?? []);
    } catch (caught) {
      setUser(null);
      setMemberships([]);
      setError(
        caught instanceof Error ? caught.message : "Die Sitzung konnte nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const value = useMemo(
    () => ({ user, memberships, isLoading, isAuthenticated: user !== null, error, refresh, clear }),
    [user, memberships, isLoading, error, refresh, clear],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
