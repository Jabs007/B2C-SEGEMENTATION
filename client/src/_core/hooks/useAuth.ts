import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
};

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

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false } = options ?? {};
  
  const auth0 = useAuth0Safe() ?? DUMMY_AUTH;

  const {
    user,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout: auth0Logout,
    getAccessTokenSilently,
  } = auth0;

  const logout = useCallback(async () => {
    await auth0Logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  }, [auth0Logout]);

  const login = useCallback(async () => {
    await loginWithRedirect();
  }, [loginWithRedirect]);

  const state = useMemo(() => ({
    user: user ? {
      id: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
    } : null,
    loading: isLoading,
    error: null,
    isAuthenticated: isAuthenticated ?? false,
  }), [user, isAuthenticated, isLoading]);

  if (redirectOnUnauthenticated && !isLoading && !isAuthenticated) {
    login();
  }

  return {
    ...state,
    login,
    logout,
    getAccessTokenSilently,
  };
}