import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { SessionUser } from "./types";

interface JwtPayload extends SessionUser {
  exp: number;
}

function decode(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(part)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const payload = JSON.parse(json) as JwtPayload;
    return payload.exp * 1000 > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { firstName: string; lastName: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => api.tokenStore.get());
  const payload = useMemo(() => decode(token), [token]);

  const clear = useCallback(() => {
    api.tokenStore.clear();
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  // a 401 from any request ends the session
  useEffect(() => api.onUnauthorized(clear), [clear]);

  // drop an expired token that was left in storage
  useEffect(() => {
    if (token && !payload) clear();
  }, [token, payload, clear]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token } = await api.login(email, password);
    api.tokenStore.set(token);
    setToken(token);
  }, []);

  const signUp = useCallback(
    async (input: { firstName: string; lastName: string; email: string; password: string }) => {
      await api.register(input);
      await signIn(input.email, input.password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the token is removed locally either way */
    }
    clear();
  }, [clear]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: payload ? { id: payload.id, email: payload.email, firstName: payload.firstName, lastName: payload.lastName } : null,
      signIn,
      signUp,
      signOut,
    }),
    [payload, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
