import postgres from "postgres";

declare global { var kamJeyDb: ReturnType<typeof postgres> | undefined; }

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!global.kamJeyDb) global.kamJeyDb = postgres(process.env.DATABASE_URL, { prepare: false, max: 5 });
  return global.kamJeyDb;
}
