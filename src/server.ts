import express from "express";
import path from "node:path";
import open from "open";
import { config } from "./config.js";
import { getAppDir } from "./appDir.js";
import { authRouter } from "./routes/auth.js";
import { charactersRouter } from "./routes/characters.js";
import { tradingRouter } from "./routes/trading.js";
import { settingsRouter } from "./routes/settings.js";
import "./db/index.js";

const app = express();
app.use(express.json());

app.use("/auth", authRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/trading", tradingRouter);
app.use("/api/settings", settingsRouter);

app.use(express.static(path.join(getAppDir(), "public")));

const url = `http://localhost:${config.port}`;
app.listen(config.port, () => {
  console.log(`Bremen Inc. Market-Tool laeuft auf ${url}`);
  open(url).catch(() => {
    console.log("Konnte Browser nicht automatisch oeffnen - bitte die URL manuell aufrufen.");
  });
});
