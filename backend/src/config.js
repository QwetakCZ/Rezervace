import dotenv from "dotenv";

dotenv.config();

const corsOrigins = String(
  process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigins,
  adminAuthSecret: String(process.env.ADMIN_AUTH_SECRET || "change-me-admin-secret"),
  adminTokenTtlSeconds: Math.max(Number(process.env.ADMIN_TOKEN_TTL_SECONDS || 43200), 300),
  defaultMinAdvanceMinutes: Math.max(Number(process.env.DEFAULT_MIN_ADVANCE_MINUTES || 120), 0),
  databaseUrl:
    process.env.DATABASE_URL ||
    "mysql://root@localhost:3306/stolni_tenis_rezervace",
};

