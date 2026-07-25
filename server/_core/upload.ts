import type { Express, Request, Response } from "express";
import multer from "multer";
import { runPipeline } from "../pipeline";
import { createPipelineRun, updatePipelineRun } from "../db";
import type { PipelineResult } from "../pipeline";

const upload = multer({ storage: multer.memoryStorage() });

export function registerUploadRoutes(app: Express) {
  app.post(
    "/api/upload/run-pipeline",
    upload.fields([
      { name: "invoices", maxCount: 1 },
      { name: "contacts", maxCount: 1 },
    ]),
    async (req: Request & { files?: { [fieldname: string]: any[] } }, res: Response) => {
        console.log("[Upload] Received request");
      const files = req.files as { [fieldname: string]: any[] } | undefined;
      const invoiceFile = files?.["invoices"]?.[0];
      const contactsFile = files?.["contacts"]?.[0];

      if (!invoiceFile || !contactsFile) {
        return res.status(400).json({
          error: "Both invoices and contacts CSV files are required",
        });
      }

        let runId: number | undefined;
        try {
          // Create pipeline run record
          const run = await createPipelineRun("manual");
          runId = run?.id;

          console.log(`[Pipeline] Starting run #${runId}`);

          const result = await runPipeline(invoiceFile.buffer, contactsFile.buffer, (step, total, message) => {
            console.log(`[Pipeline] Step ${step}/${total}: ${message}`);
          });

          if (runId) {
            await updatePipelineRun(runId, {
              status: "completed",
              completedAt: new Date(),
              customersProcessed: result.validRows,
              logs: result.logs.join("\n"),
            });
          }

          res.json({
            success: true,
            totalRows: result.totalRows,
            validRows: result.validRows,
            segments: result.segments,
            message: `Pipeline complete. ${result.validRows} customers processed.`,
          });
        } catch (error: any) {
          console.error("[Pipeline] Error:", error);

          if (runId) {
            await updatePipelineRun(runId, {
              status: "failed",
              completedAt: new Date(),
              errorMessage: error.message,
              logs: `Error: ${error.message}\n`,
            });
          }

          res.status(500).json({
            error: error.message || "Pipeline processing failed",
          });
        }
    }
  );
}
