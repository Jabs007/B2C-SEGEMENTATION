import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = { redirectOnUnauthenticated?: boolean };

function useAuth0Safe() {
  try {
    return useAuth0();
  } catch {
    return null;
  }
}

const DUMMY_AUTH = {
  user: undefined,
  isAuthenticated: false,
  isLoading: false,
  loginWithRedirect: async () => {},
  logout: async () => {},
  getAccessTokenSilently: async () => "",
} as ReturnType<typeof useAuth0>;

export function useAuth(options?: UseAuthOptions = {}) {
  const { redirectOnUnauthenticated = false } = options;
  const auth0 = useAuth0Safe() ?? DUMMY_AUTH;
  const { user, isAuthenticated, isLoading, loginWithRedirect, logout: auth0Logout, getAccessTokenSilently } = auth0;

  const [localLoading, setLocalLoading] = useState(true);
  const [localUser, setLocalUser] = useState<{ id: string; email: string | null; name: string | null; picture: string | null } | null>(null);
  const [localAuthenticated, setLocalAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLocalLoading(true);
      try {
        const res = await fetch("/dev-auth/session", { method: "GET", credentials: "include" });
        if (!res.ok) throw new Error("session not available");
        const data = await res.json();
        if (cancelled) return;
        setLocalAuthenticated(Boolean(data?.authenticated));
        setLocalUser(
          data?.user
            ? {
                id: data.user.openId ?? "unknown",
                email: data.user.email ?? null,
                name: data.user.name ?? null,
                picture: null,
              }
            : null,
        );
      } catch {
        if (cancelled) return;
        setLocalAuthenticated(false);
        setLocalUser(null);
      } finally {
        if (!cancelled) setLocalLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await auth0Logout({ logoutParams: { returnTo: window.location.origin } });
  }, [auth0Logout]);

  const login = useCallback(async () => {
    await loginWithRedirect();
  }, [loginWithRedirect]);

  const loading = localLoading;
  const state = useMemo(
    () => ({
      user: localUser,
      loading,
      error: null,
      isAuthenticated: localAuthenticated,
    }),
    [localUser, loading, localAuthenticated],
  );

  useEffect(() => {
    if (redirectOnUnauthenticated && !loading && !localAuthenticated) {
      login();
    }
  }, [redirectOnUnauthenticated, loading, localAuthenticated, login]);

  return { ...state, login, logout, getAccessTokenSilently };
}