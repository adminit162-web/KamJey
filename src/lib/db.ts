import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

declare global { var kamJeyDb: ReturnType<typeof postgres> | undefined; }

function localDatabaseUrl() {
  if (process.env.NODE_ENV !== "development") return undefined;

  const envFile = join(process.cwd(), ".env.local");
  if (!existsSync(envFile)) return undefined;

  const entry = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("DATABASE_URL="));
  if (!entry) return undefined;

  const value = entry.slice("DATABASE_URL=".length).trim();
  return value.replace(/^(?:"|')|(?:"|')$/g, "");
}

export function db() {
  const databaseUrl = localDatabaseUrl() ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  if (!global.kamJeyDb) global.kamJeyDb = postgres(databaseUrl, { prepare: false, max: 5 });
  return global.kamJeyDb;
}
