import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

const loadEnvFile = (fileName: string) => {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    const hashIndex = value.indexOf("#");
    if (!value.startsWith('"') && !value.startsWith("'") && hashIndex !== -1) {
      value = value.slice(0, hashIndex).trim();
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
};

const preferredEnv =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env.local";
loadEnvFile(preferredEnv);
// loadEnvFile(".env");

const runningPrismaCLI =
  process.argv.some((arg) => arg.includes("prisma")) ||
  Object.keys(process.env).some((key) => key.startsWith("PRISMA_MIGRATION"));

if (runningPrismaCLI && process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
