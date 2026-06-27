import * as React from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";
import type { ReactNode } from "react";

interface Auth0ProviderWrapperProps {
  children: ReactNode;
}

function SessionHandler({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    async function syncSession() {
      if (isLoading) return;
      
      if (isAuthenticated) {
        try {
          console.log("[Auth0] User is authenticated, syncing session...");
          const token = await getAccessTokenSilently();
          console.log("[Auth0] Token acquired, sending to backend...");
          const response = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) {
            const errData = await response.text();
            console.error("[Auth0] Session sync failed:", response.status, errData);
            throw new Error("Session sync failed");
          }
console.log("[Auth0] Session synced successfully");
        // Auth state update will trigger re-render automatically
        } catch (e) {
          console.error("[Auth0] Session sync error:", e);
        }
      }
    }
    syncSession();
  }, [isAuthenticated, isLoading, getAccessTokenSilently]);

  return <>{children}</>;
}

export function Auth0ProviderWrapper({ children }: Auth0ProviderWrapperProps) {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const redirectUri = `${window.location.origin}/`;

  if (!domain || !clientId) {
    console.error("[Auth0] Missing domain or clientId in environment variables");
    return <>{children}</>;
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
      }}
  onRedirectCallback={() => {
    // Auth0 handles the redirect; SessionHandler syncs the session after authentication
  }}
    >
      <SessionHandler>
        {children}
      </SessionHandler>
    </Auth0Provider>
  );
}