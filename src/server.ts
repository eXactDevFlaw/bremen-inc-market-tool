import express from "express";
import path from "node:path";
import open from "open";
import { config } from "./config.js";
import { getAppDir } from "./appDir.js";
import { authRouter } from "./routes/auth.js";
import { charactersRouter } from "./routes/characters.js";
import { tradingRouter } from "./routes/trading.js";
import { settingsRouter } from "./routes/settings.js";
import { universeRouter } from "./routes/universe.js";
import { overviewRouter } from "./routes/overview.js";
import { industryRouter } from "./routes/industry.js";
import "./db/index.js";

const app = express();
app.use(express.json());

app.use("/auth", authRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/trading", tradingRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/universe", universeRouter);
app.use("/api/overview", overviewRouter);
app.use("/api/industry", industryRouter);

// no-cache statt eines Defaults ohne Cache-Control-Header: erzwingt, dass der
// Browser bei jedem Laden/Reload eine Revalidierung macht (ETag/If-None-Match)
// statt eine evtl. veraltete Kopie aus dem Disk-Cache zu zeigen. Wichtig,
// weil die Frontend-Module hier ohne Build-Schritt/Versionierung direkt
// ausgeliefert werden - ohne das kann ein Update erst nach hartem Reload
// (Strg/Cmd+Shift+R) sichtbar werden.
app.use(
  express.static(path.join(getAppDir(), "public"), {
    setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
  }),
);

const url = `http://localhost:${config.port}`;
app.listen(config.port, () => {
  console.log(`Bremen Inc. Market-Tool laeuft auf ${url}`);
  open(url).catch(() => {
    console.log("Konnte Browser nicht automatisch oeffnen - bitte die URL manuell aufrufen.");
  });
});
