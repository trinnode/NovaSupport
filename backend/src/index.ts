import "dotenv/config";

const REQUIRED_ENV_VARS = ["DATABASE_URL", "DIRECT_URL"];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    console.error("Check backend/.env.example for the full list of required variables.");
    process.exit(1);
  }
}

import { app } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`NovaSupport backend listening on http://localhost:${port}`);
});

