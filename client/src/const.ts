export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Auth0 configuration
export const getAuth0Config = () => ({
  domain: import.meta.env.VITE_AUTH0_DOMAIN ?? "",
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID ?? "",
  redirectUri: `${window.location.origin}/api/oauth/callback`,
});