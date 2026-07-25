import type { Express } from "express";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

  // If storage backend not configured, attempt to serve from local public folder
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    try {
      const path = require("path");
      const fs = require("fs");
      const localPath = path.resolve(process.cwd(), "client", "public", "manus-storage", key);
      if (fs.existsSync(localPath)) {
        const fileContents = fs.readFileSync(localPath);
        res.setHeader("Content-Type", "application/octet-stream");
        return res.send(fileContents);
      }
    } catch (_) {}
    res.status(404).send("File not found");
    return;
  }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
