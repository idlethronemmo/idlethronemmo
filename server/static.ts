import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const attachedAssetsPath = path.resolve(process.cwd(), "attached_assets");
  if (fs.existsSync(attachedAssetsPath)) {
    app.use('/attached_assets', express.static(attachedAssetsPath));
  }

  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/ws/")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
