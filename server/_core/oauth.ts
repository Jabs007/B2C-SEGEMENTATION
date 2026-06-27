import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      // Get user info from Auth0 using the token
      const userInfoResponse = await fetch(`${ENV.oAuthServerUrl}/userinfo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!userInfoResponse.ok) {
        console.error("[OAuth] User info fetch failed");
        return res.status(400).json({ error: "Failed to get user info" });
      }

      const userInfo = await userInfoResponse.json();

      // Upsert user in database
      await db.upsertUser({
        openId: userInfo.sub,
        name: userInfo.name || null,
        email: userInfo.email || null,
        lastSignedIn: new Date(),
      });

  const sessionToken = await sdk.createSessionToken(userInfo.sub, {
    expiresInMs: ONE_YEAR_MS,
    name: userInfo.name || undefined,
  });

  res.cookie(COOKIE_NAME, sessionToken, {
    ...getSessionCookieOptions(req),
    maxAge: ONE_YEAR_MS,
  });

      res.json({ success: true });
    } catch (error) {
      console.error("[OAuth] Session creation failed", error);
      res.status(500).json({ error: "Internal server error during session creation" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    // This is now only a fallback/redirector for the SDK
    res.redirect(302, "/");
  });
}