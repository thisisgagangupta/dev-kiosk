import express from "express";
import cors from "cors";
import { kioskIdentifyRouter } from "./routes/kioskIdentify.js";

const app = express();

const defaultAllowed = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

const allowed = (process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(",").map(s => s.trim()).filter(Boolean)
  : defaultAllowed);

app.use(cors({ origin: allowed, credentials: true }));
app.use(express.json());

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/api/kiosk/identify", kioskIdentifyRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Clinic OS API on :${port} (CORS allowed: ${allowed.join(", ")})`));




// // node-backend/server.js
// import express from "express";
// import cors from "cors";
// import { kioskIdentifyRouter } from "./routes/kioskIdentify.js";

// const app = express();

// // if you’ll ever set secure cookies behind a proxy (Render/Heroku), keep this:
// app.set("trust proxy", 1);

// const defaultAllowed = [
//   "http://localhost:5173",
//   "http://127.0.0.1:5173",
//   "http://localhost:8080",
//   "http://127.0.0.1:8080",
// ];

// const allowed = (process.env.ALLOWED_ORIGIN
//   ? process.env.ALLOWED_ORIGIN.split(",").map(s => s.trim()).filter(Boolean)
//   : defaultAllowed);

// // Global CORS + JSON body
// app.use(cors({ origin: allowed, credentials: true }));
// app.options("*", cors()); // optional: explicit preflight support
// app.use(express.json());

// // Health
// app.get("/healthz", (_req, res) => res.json({ ok: true }));

// // Routes
// app.use("/api/kiosk/identify", kioskIdentifyRouter);

// // Simple not-found + error handlers (optional but helpful)
// app.use((req, res) => res.status(404).json({ error: "Not found" }));
// app.use((err, _req, res, _next) => {
//   console.error(err);
//   res.status(500).json({ error: "Internal Server Error" });
// });

// const port = process.env.PORT || 3000;
// app.listen(port, () =>
//   console.log(`Clinic OS API on :${port} (CORS allowed: ${allowed.join(", ")})`)
// );
