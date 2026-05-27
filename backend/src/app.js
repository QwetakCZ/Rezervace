import cors from "cors";
import crypto from "crypto";
import express from "express";
import { config } from "./config.js";
import { query, txQuery, withTransaction } from "./db.js";
import {
  buildSlotsForWindow,
  dayOfWeekForPricing,
  filterSlotsByLeadTime,
  groupSlotsByResource,
  isSlotBookableWithLeadTime,
} from "./slots.js";

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function signAdminToken(payload) {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = crypto
    .createHmac("sha256", config.adminAuthSecret)
    .update(unsigned)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${unsigned}.${signature}`;
}

function verifyAdminToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const unsigned = `${header}.${body}`;
  const expected = crypto
    .createHmac("sha256", config.adminAuthSecret)
    .update(unsigned)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body));
    if (!payload?.sub || !payload?.role || !payload?.exp) {
      return null;
    }

    const role = String(payload.role || "").trim().toLowerCase();
    if (role !== "superadmin" && !payload?.companyId) {
      return null;
    }

    if (Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function extractBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

function isSuperAdmin(user) {
  return String(user?.role || "").trim().toLowerCase() === "superadmin";
}

function hasCompanyAccess(admin, companyId) {
  return isSuperAdmin(admin) || Number(admin?.companyId) === Number(companyId);
}

const DEFAULT_COMPANY_THEME = Object.freeze({
  brandColor: "#10d2a2",
  backgroundColor: "#06070c",
  textColor: "#f4f5f7",
});

function normalizeHexColor(value, fallback = null) {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  const shortMatch = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`.toLowerCase();
  }

  const longMatch = raw.match(/^#([0-9a-f]{6})$/i);
  if (longMatch) {
    return `#${longMatch[1]}`.toLowerCase();
  }

  return fallback;
}

function serializeCompany(company) {
  return {
    id: Number(company.id),
    name: company.name,
    timezone: company.timezone,
    createdAt: company.created_at,
    brandColor: normalizeHexColor(company.brand_color, DEFAULT_COMPANY_THEME.brandColor),
    backgroundColor: normalizeHexColor(
      company.background_color,
      DEFAULT_COMPANY_THEME.backgroundColor
    ),
    textColor: normalizeHexColor(company.text_color, DEFAULT_COMPANY_THEME.textColor),
  };
}

function normalizeTimeValue(value) {
  const raw = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00`;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }
  return "";
}

async function findCompanyById(companyId) {
  await ensureCompanyThemeSchema();
  const [company] = await query(
    `SELECT id, name, timezone, created_at, brand_color, background_color, text_color
     FROM companies
     WHERE id = ?
     LIMIT 1`,
    [companyId]
  );
  return company || null;
}

async function findCategoryById(categoryId) {
  await ensureCategorySchema();
  const [category] = await query(
    `SELECT id, company_id, name, description, default_slot_duration, icon
     FROM categories
     WHERE id = ?
     LIMIT 1`,
    [categoryId]
  );
  return category || null;
}

async function findResourceById(resourceId) {
  const [resource] = await query(
    `SELECT r.id, r.category_id, r.name, r.is_active, c.company_id
     FROM resources r
     JOIN categories c ON c.id = r.category_id
     WHERE r.id = ?
     LIMIT 1`,
    [resourceId]
  );
  return resource || null;
}

async function findPricingWindowById(windowId) {
  const [pricingWindow] = await query(
    `SELECT pw.id, pw.category_id, pw.resource_id, pw.day_of_week, pw.time_from, pw.time_to, pw.price_per_slot, c.company_id, r.name AS resource_name
     FROM pricing_windows pw
     JOIN categories c ON c.id = pw.category_id
     LEFT JOIN resources r ON r.id = pw.resource_id
     WHERE pw.id = ?
     LIMIT 1`,
    [windowId]
  );
  return pricingWindow || null;
}

let bookingSettingsSchemaPromise = null;
let categorySchemaPromise = null;
let companyThemeSchemaPromise = null;

async function ensureCategorySchema() {
  if (!categorySchemaPromise) {
    categorySchemaPromise = query(
      "ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(50) NULL AFTER description"
    ).catch((error) => {
      categorySchemaPromise = null;
      throw error;
    });
  }

  await categorySchemaPromise;
}

async function ensureCompanyThemeSchema() {
  if (!companyThemeSchemaPromise) {
    companyThemeSchemaPromise = (async () => {
      await query(
        `ALTER TABLE companies
         ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7) NOT NULL DEFAULT '${DEFAULT_COMPANY_THEME.brandColor}' AFTER timezone`
      );
      await query(
        `ALTER TABLE companies
         ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) NOT NULL DEFAULT '${DEFAULT_COMPANY_THEME.backgroundColor}' AFTER brand_color`
      );
      await query(
        `ALTER TABLE companies
         ADD COLUMN IF NOT EXISTS text_color VARCHAR(7) NOT NULL DEFAULT '${DEFAULT_COMPANY_THEME.textColor}' AFTER background_color`
      );
    })().catch((error) => {
      companyThemeSchemaPromise = null;
      throw error;
    });
  }

  await companyThemeSchemaPromise;
}

function normalizeCategoryIcon(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return ["trophy", "cpu", "dumbbell", "calendar", "users", "star"].includes(normalized)
    ? normalized
    : null;
}

async function ensureBookingSettingsSchema() {
  if (!bookingSettingsSchemaPromise) {
    bookingSettingsSchemaPromise = query(
      `CREATE TABLE IF NOT EXISTS company_booking_settings (
         company_id INT NOT NULL,
         min_advance_minutes INT NOT NULL DEFAULT 120,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (company_id),
         CONSTRAINT fk_booking_settings_company
           FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ).catch((error) => {
      bookingSettingsSchemaPromise = null;
      throw error;
    });
  }

  await bookingSettingsSchemaPromise;
}

function normalizeMinAdvanceMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 7 * 24 * 60) {
    return null;
  }

  return rounded;
}

async function getCompanyBookingSettings(companyId) {
  await ensureBookingSettingsSchema();

  const [row] = await query(
    `SELECT company_id, min_advance_minutes
     FROM company_booking_settings
     WHERE company_id = ?
     LIMIT 1`,
    [companyId]
  );

  if (!row) {
    const defaultMinutes = config.defaultMinAdvanceMinutes;
    await query(
      `INSERT INTO company_booking_settings (company_id, min_advance_minutes)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE company_id = company_id`,
      [companyId, defaultMinutes]
    );
    return {
      companyId: Number(companyId),
      minAdvanceMinutes: defaultMinutes,
    };
  }

  return {
    companyId: Number(row.company_id),
    minAdvanceMinutes: Math.max(Number(row.min_advance_minutes) || 0, 0),
  };
}

function serializePricingWindow(pricingWindow) {
  return {
    id: Number(pricingWindow.id),
    categoryId: Number(pricingWindow.category_id),
    resourceId:
      pricingWindow.resource_id == null ? null : Number(pricingWindow.resource_id),
    resourceName: pricingWindow.resource_name || null,
    dayOfWeek: Number(pricingWindow.day_of_week),
    timeFrom: String(pricingWindow.time_from),
    timeTo: String(pricingWindow.time_to),
    pricePerSlot: Number(pricingWindow.price_per_slot),
  };
}

async function hashPassword(password) {
  const { default: bcrypt } = await import("bcryptjs");
  return bcrypt.hash(password, 10);
}

async function findAdminById(userId) {
  const [user] = await query(
    "SELECT id, company_id, role, email, first_name, last_name FROM users WHERE id = ? LIMIT 1",
    [userId]
  );

  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return null;
  }

  return user;
}

async function findPlayerById(userId) {
  const [user] = await query(
    `SELECT id, company_id, role, email, password_hash, first_name, last_name, phone, current_credit, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!user || user.role !== "player") {
    return null;
  }

  return user;
}

function serializePlayerUser(user) {
  return {
    id: Number(user.id),
    companyId: Number(user.company_id),
    role: user.role,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    currentCredit: Number(user.current_credit || 0),
    createdAt: user.created_at,
  };
}

export function createApp() {
  const app = express();

  async function requireAdmin(req, res, next) {
    const token = extractBearerToken(req);
    const payload = verifyAdminToken(token);

    if (!payload) {
      return res.status(401).json({ error: "Neplatne nebo expirovane prihlaseni." });
    }

    try {
      const admin = await findAdminById(Number(payload.sub));
      if (
        !admin ||
        (admin.role !== "superadmin" && Number(admin.company_id) !== Number(payload.companyId))
      ) {
        return res.status(401).json({ error: "Prihlaseni uz neni platne." });
      }

      req.admin = {
        id: Number(admin.id),
        companyId: admin.company_id == null ? null : Number(admin.company_id),
        role: admin.role,
        email: admin.email,
        firstName: admin.first_name,
        lastName: admin.last_name,
      };
      return next();
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se overit prihlaseni." });
    }
  }

  async function requirePlayer(req, res, next) {
    const token = extractBearerToken(req);
    const payload = verifyAdminToken(token);

    if (!payload || String(payload.role || "") !== "player") {
      return res.status(401).json({ error: "Neplatné nebo expirované přihlášení hráče." });
    }

    try {
      const player = await findPlayerById(Number(payload.sub));
      if (!player || Number(player.company_id) !== Number(payload.companyId)) {
        return res.status(401).json({ error: "Přihlášení hráče už není platné." });
      }

      req.player = serializePlayerUser(player);
      return next();
    } catch (error) {
      return res.status(500).json({ error: "Nepodařilo se ověřit přihlášení hráče." });
    }
  }

  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser requests and configured dev origins.
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("CORS origin not allowed"));
      },
    })
  );
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "rezervace-backend" });
  });

  app.get("/api/health/db", async (req, res) => {
    try {
      await query("SELECT 1 AS ok");
      const [{ count }] = await query("SELECT COUNT(*) AS count FROM categories");

      res.json({ ok: true, database: "connected", categoriesCount: Number(count) || 0 });
    } catch (error) {
      res.status(500).json({
        ok: false,
        database: "disconnected",
        error: error?.message || "DB connection failed",
      });
    }
  });

  app.get("/api/company", async (req, res) => {
    const companyId = Number(req.query.companyId || 0) || 1;

    try {
      const company = await findCompanyById(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company neexistuje." });
      }

      return res.json(serializeCompany(company));
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist nastaveni klubu." });
    }
  });

  app.post("/api/admin/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Vyplnte e-mail a heslo." });
    }

    try {
      const [user] = await query(
        "SELECT id, company_id, role, email, password_hash, first_name, last_name FROM users WHERE email = ? LIMIT 1",
        [email]
      );

      if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
        return res.status(401).json({ error: "Neplatne prihlasovaci udaje." });
      }

      const hash = String(user.password_hash || "");
      let passwordValid = false;

      // Supports bcrypt hashes and plain text fallback for legacy/dev data.
      if (hash.startsWith("$2y$") || hash.startsWith("$2b$") || hash.startsWith("$2a$")) {
        const { default: bcrypt } = await import("bcryptjs");
        try {
          passwordValid = await bcrypt.compare(password, hash.replace("$2y$", "$2b$"));
        } catch {
          passwordValid = false;
        }
      } else {
        passwordValid = hash.length > 0 && hash === password;
      }

      if (!passwordValid) {
        return res.status(401).json({ error: "Neplatne prihlasovaci udaje." });
      }

      const exp = Math.floor(Date.now() / 1000) + config.adminTokenTtlSeconds;
      const role = String(user.role || "").trim().toLowerCase();
      const token = signAdminToken({
        sub: Number(user.id),
        companyId: role === "superadmin" && user.company_id == null ? null : Number(user.company_id),
        role,
        exp,
      });

      return res.json({
        token,
        user: {
          id: Number(user.id),
          companyId: user.company_id == null ? null : Number(user.company_id),
          role,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        },
      });
    } catch (error) {
      return res.status(500).json({ error: "Prihlaseni se nezdarilo." });
    }
  });

  app.post("/api/player/register", async (req, res) => {
    const companyId = Number(req.body?.companyId || req.query.companyId || 0) || 1;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const phone = String(req.body?.phone || "").trim();

    if (!companyId || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Vyplňte e-mail, heslo, jméno a příjmení." });
    }

    try {
      const company = await findCompanyById(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company neexistuje." });
      }

      const [existing] = await query(
        `SELECT id, role, password_hash
         FROM users
         WHERE company_id = ? AND email = ?
         LIMIT 1`,
        [companyId, email]
      );

      const passwordHash = await hashPassword(password);
      let userId = null;

      if (existing) {
        if (existing.role !== "player") {
          return res.status(409).json({ error: "Tento e-mail už v klubu používá jiný typ účtu." });
        }
        if (String(existing.password_hash || "").trim()) {
          return res.status(409).json({ error: "Hráčský účet s tímto e-mailem už existuje." });
        }

        await query(
          `UPDATE users
           SET first_name = ?, last_name = ?, phone = ?, password_hash = ?
           WHERE id = ?`,
          [firstName, lastName, phone || null, passwordHash, existing.id]
        );
        userId = Number(existing.id);
      } else {
        const result = await query(
          `INSERT INTO users (company_id, role, email, password_hash, first_name, last_name, phone, current_credit)
           VALUES (?, 'player', ?, ?, ?, ?, ?, 0.00)`,
          [companyId, email, passwordHash, firstName, lastName, phone || null]
        );
        userId = Number(result.insertId);
      }

      const player = await findPlayerById(userId);
      const exp = Math.floor(Date.now() / 1000) + config.adminTokenTtlSeconds;
      const token = signAdminToken({
        sub: Number(player.id),
        companyId: Number(player.company_id),
        role: "player",
        exp,
      });

      return res.status(201).json({
        token,
        user: serializePlayerUser(player),
      });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Hráčský účet s tímto e-mailem už existuje." });
      }

      return res.status(500).json({ error: "Nepodařilo se vytvořit hráčský účet." });
    }
  });

  app.post("/api/player/login", async (req, res) => {
    const companyId = Number(req.body?.companyId || req.query.companyId || 0) || 1;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!companyId || !email || !password) {
      return res.status(400).json({ error: "Vyplňte e-mail a heslo." });
    }

    try {
      const [user] = await query(
        `SELECT id, company_id, role, email, password_hash, first_name, last_name, phone, current_credit, created_at
         FROM users
         WHERE company_id = ? AND email = ?
         LIMIT 1`,
        [companyId, email]
      );

      if (!user || user.role !== "player") {
        return res.status(401).json({ error: "Neplatné přihlašovací údaje." });
      }

      const hash = String(user.password_hash || "");
      let passwordValid = false;
      if (hash.startsWith("$2y$") || hash.startsWith("$2b$") || hash.startsWith("$2a$")) {
        const { default: bcrypt } = await import("bcryptjs");
        try {
          passwordValid = await bcrypt.compare(password, hash.replace("$2y$", "$2b$"));
        } catch {
          passwordValid = false;
        }
      } else {
        passwordValid = hash.length > 0 && hash === password;
      }

      if (!passwordValid) {
        return res.status(401).json({ error: "Neplatné přihlašovací údaje." });
      }

      const exp = Math.floor(Date.now() / 1000) + config.adminTokenTtlSeconds;
      const token = signAdminToken({
        sub: Number(user.id),
        companyId: Number(user.company_id),
        role: "player",
        exp,
      });

      return res.json({
        token,
        user: serializePlayerUser(user),
      });
    } catch (error) {
      return res.status(500).json({ error: "Přihlášení hráče se nezdařilo." });
    }
  });

  app.get("/api/player/me", requirePlayer, async (req, res) => {
    return res.json({ user: req.player });
  });

  app.get("/api/admin/me", requireAdmin, async (req, res) => {
    return res.json({ user: req.admin });
  });

  app.get("/api/admin/companies", requireAdmin, async (req, res) => {
    try {
      await ensureCompanyThemeSchema();
      const companyRows = await query(
        `SELECT id, name, timezone, created_at, brand_color, background_color, text_color
         FROM companies
         ${isSuperAdmin(req.admin) ? "" : "WHERE id = ?"}
         ORDER BY id`,
        isSuperAdmin(req.admin) ? [] : [req.admin.companyId]
      );

      if (companyRows.length === 0) {
        return res.json([]);
      }

      const companyIds = companyRows.map((company) => company.id);
      const userRows = await query(
        `SELECT id, company_id, role, email, first_name, last_name, phone, current_credit, created_at
         FROM users
         WHERE company_id IN (?)
         ORDER BY company_id, id`,
        [companyIds]
      );

      const usersByCompany = new Map();
      for (const user of userRows) {
        const list = usersByCompany.get(user.company_id) || [];
        list.push({
          id: Number(user.id),
          companyId: Number(user.company_id),
          role: user.role,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          currentCredit: Number(user.current_credit),
          createdAt: user.created_at,
        });
        usersByCompany.set(user.company_id, list);
      }

      return res.json(
        companyRows.map((company) => ({
          ...serializeCompany(company),
          userCount: usersByCompany.get(company.id)?.length || 0,
          users: usersByCompany.get(company.id) || [],
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist company." });
    }
  });

  app.post("/api/admin/companies", requireAdmin, async (req, res) => {
    if (!isSuperAdmin(req.admin)) {
      return res.status(403).json({ error: "Pouze superadmin muze spravovat company." });
    }

    const name = String(req.body?.name || "").trim();
    const timezone = String(req.body?.timezone || "Europe/Prague").trim() || "Europe/Prague";

    if (!name) {
      return res.status(400).json({ error: "Vyplnte nazev company." });
    }

    try {
      await ensureCompanyThemeSchema();
      const result = await query(
        "INSERT INTO companies (name, timezone) VALUES (?, ?)",
        [name, timezone]
      );

      const [company] = await query(
        `SELECT id, name, timezone, created_at, brand_color, background_color, text_color
         FROM companies
         WHERE id = ?
         LIMIT 1`,
        [result.insertId]
      );

      return res.status(201).json(serializeCompany(company));
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se vytvorit company." });
    }
  });

  app.patch("/api/admin/companies/:id", requireAdmin, async (req, res) => {
    const companyId = Number(req.params.id || 0);
    const name = String(req.body?.name || "").trim();
    const timezone = String(req.body?.timezone || "").trim();
    const brandColorProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "brandColor");
    const backgroundColorProvided = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "backgroundColor"
    );
    const textColorProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "textColor");
    const brandColor = normalizeHexColor(req.body?.brandColor);
    const backgroundColor = normalizeHexColor(req.body?.backgroundColor);
    const textColor = normalizeHexColor(req.body?.textColor);

    if (!companyId) {
      return res.status(400).json({ error: "Neplatne ID company." });
    }

    if (!name && !timezone && !brandColorProvided && !backgroundColorProvided && !textColorProvided) {
      return res.status(400).json({ error: "Neni co upravit." });
    }

    if (brandColorProvided && !brandColor) {
      return res.status(400).json({ error: "Primarni barva musi byt ve formatu #RRGGBB." });
    }
    if (backgroundColorProvided && !backgroundColor) {
      return res.status(400).json({ error: "Barva pozadi musi byt ve formatu #RRGGBB." });
    }
    if (textColorProvided && !textColor) {
      return res.status(400).json({ error: "Barva textu musi byt ve formatu #RRGGBB." });
    }

    if (!hasCompanyAccess(req.admin, companyId)) {
      return res.status(403).json({ error: "K teto company nemate pristup." });
    }

    try {
      await ensureCompanyThemeSchema();
      const [existing] = await query(
        "SELECT id FROM companies WHERE id = ? LIMIT 1",
        [companyId]
      );

      if (!existing) {
        return res.status(404).json({ error: "Company neexistuje." });
      }

      const fields = [];
      const values = [];
      if (name) {
        fields.push("name = ?");
        values.push(name);
      }
      if (timezone) {
        fields.push("timezone = ?");
        values.push(timezone);
      }
      if (brandColorProvided) {
        fields.push("brand_color = ?");
        values.push(brandColor);
      }
      if (backgroundColorProvided) {
        fields.push("background_color = ?");
        values.push(backgroundColor);
      }
      if (textColorProvided) {
        fields.push("text_color = ?");
        values.push(textColor);
      }
      values.push(companyId);

      await query(`UPDATE companies SET ${fields.join(", ")} WHERE id = ?`, values);

      const [updated] = await query(
        `SELECT id, name, timezone, created_at, brand_color, background_color, text_color
         FROM companies
         WHERE id = ?
         LIMIT 1`,
        [companyId]
      );

      return res.json(serializeCompany(updated));
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se upravit company." });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const requestedCompanyId = Number(req.query.companyId || 0);
    const companyId = isSuperAdmin(req.admin)
      ? requestedCompanyId || null
      : Number(req.admin.companyId);

    try {
      const rows = await query(
        `SELECT id, company_id, role, email, first_name, last_name, phone, current_credit, created_at
         FROM users
         ${companyId ? "WHERE company_id = ?" : ""}
         ORDER BY company_id, id`,
        companyId ? [companyId] : []
      );

      return res.json(
        rows.map((user) => ({
          id: Number(user.id),
          companyId: Number(user.company_id),
          role: user.role,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          currentCredit: Number(user.current_credit),
          createdAt: user.created_at,
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist uzivatele." });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    const superAdmin = isSuperAdmin(req.admin);
    const companyId = superAdmin
      ? Number(req.body?.companyId || 0)
      : Number(req.admin.companyId);
    const role = String(req.body?.role || "admin").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const phone = String(req.body?.phone || "").trim();

    if (!companyId || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Vyplnte company, e-mail, heslo a jmeno." });
    }

    if (!superAdmin && role !== "admin") {
      return res.status(403).json({ error: "Muzete vytvaret pouze admin ucty ve sve company." });
    }

    if (superAdmin && !["admin", "coach", "player"].includes(role)) {
      return res.status(400).json({ error: "Neplatna role uzivatele." });
    }

    try {
      const [company] = await query(
        "SELECT id FROM companies WHERE id = ? LIMIT 1",
        [companyId]
      );

      if (!company) {
        return res.status(404).json({ error: "Company neexistuje." });
      }

      const passwordHash = await hashPassword(password);
      const result = await query(
        `INSERT INTO users (company_id, role, email, password_hash, first_name, last_name, phone, current_credit)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0.00)`,
        [companyId, role, email, passwordHash, firstName, lastName, phone || null]
      );

      const [created] = await query(
        "SELECT id, company_id, role, email, first_name, last_name, phone, current_credit, created_at FROM users WHERE id = ? LIMIT 1",
        [result.insertId]
      );

      return res.status(201).json({
        id: Number(created.id),
        companyId: Number(created.company_id),
        role: created.role,
        email: created.email,
        firstName: created.first_name,
        lastName: created.last_name,
        phone: created.phone,
        currentCredit: Number(created.current_credit),
        createdAt: created.created_at,
      });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Uzivatel s timto e-mailem jiz v company existuje." });
      }

      return res.status(500).json({ error: "Nepodarilo se vytvorit uzivatele." });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const superAdmin = isSuperAdmin(req.admin);

    const userId = Number(req.params.id || 0);
    const companyId = Number(req.body?.companyId || 0);
    const role = String(req.body?.role || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const phone = String(req.body?.phone || "").trim();

    if (!userId) {
      return res.status(400).json({ error: "Neplatne ID uzivatele." });
    }

    const fields = [];
    const values = [];

    if (companyId) {
      if (!superAdmin) {
        return res.status(403).json({ error: "Zmenu company muze provest pouze superadmin." });
      }
      fields.push("company_id = ?");
      values.push(companyId);
    }
    if (role) {
      if (!superAdmin && role !== "admin") {
        return res.status(403).json({ error: "Muzete spravovat pouze admin ucty." });
      }
      if (superAdmin && !["admin", "coach", "player"].includes(role)) {
        return res.status(400).json({ error: "Neplatna role uzivatele." });
      }
      fields.push("role = ?");
      values.push(role);
    }
    if (email) {
      fields.push("email = ?");
      values.push(email);
    }
    if (firstName) {
      fields.push("first_name = ?");
      values.push(firstName);
    }
    if (lastName) {
      fields.push("last_name = ?");
      values.push(lastName);
    }
    if (phone) {
      fields.push("phone = ?");
      values.push(phone);
    }
    if (password) {
      fields.push("password_hash = ?");
      values.push(await hashPassword(password));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "Neni co upravit." });
    }

    try {
      const [existing] = await query(
        "SELECT id, company_id FROM users WHERE id = ? LIMIT 1",
        [userId]
      );

      if (!existing) {
        return res.status(404).json({ error: "Uzivatel neexistuje." });
      }

      if (!superAdmin) {
        if (Number(existing.company_id) !== Number(req.admin.companyId)) {
          return res.status(403).json({ error: "K tomuto uzivateli nemate pristup." });
        }

        const [existingRoleRow] = await query(
          "SELECT role FROM users WHERE id = ? LIMIT 1",
          [userId]
        );
        if (String(existingRoleRow?.role || "") !== "admin") {
          return res.status(403).json({ error: "Lze spravovat pouze admin ucty." });
        }
      }

      if (companyId) {
        const [company] = await query(
          "SELECT id FROM companies WHERE id = ? LIMIT 1",
          [companyId]
        );
        if (!company) {
          return res.status(404).json({ error: "Company neexistuje." });
        }
      }

      values.push(userId);
      await query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);

      const [updated] = await query(
        "SELECT id, company_id, role, email, first_name, last_name, phone, current_credit, created_at FROM users WHERE id = ? LIMIT 1",
        [userId]
      );

      return res.json({
        id: Number(updated.id),
        companyId: Number(updated.company_id),
        role: updated.role,
        email: updated.email,
        firstName: updated.first_name,
        lastName: updated.last_name,
        phone: updated.phone,
        currentCredit: Number(updated.current_credit),
        createdAt: updated.created_at,
      });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Uzivatel s timto e-mailem jiz v company existuje." });
      }

      return res.status(500).json({ error: "Nepodarilo se upravit uzivatele." });
    }
  });

  app.get("/api/admin/categories", requireAdmin, async (req, res) => {
    const requestedCompanyId = Number(req.query.companyId || 0);
    const companyId = isSuperAdmin(req.admin)
      ? requestedCompanyId || null
      : Number(req.admin.companyId);

    try {
      await ensureCategorySchema();
      const rows = await query(
        `SELECT id, company_id, name, description, default_slot_duration, icon
         FROM categories
         ${companyId ? "WHERE company_id = ?" : ""}
         ORDER BY id`,
        companyId ? [companyId] : []
      );

      return res.json(
        rows.map((category) => ({
          id: Number(category.id),
          companyId: Number(category.company_id),
          name: category.name,
          description: category.description,
            icon: category.icon || null,
          defaultSlotDuration: Number(category.default_slot_duration),
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist kategorie pro admin sekci." });
    }
  });

  app.post("/api/admin/categories", requireAdmin, async (req, res) => {
    const companyId = isSuperAdmin(req.admin)
      ? Number(req.body?.companyId || 0)
      : Number(req.admin.companyId);
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const defaultSlotDuration = Number(req.body?.defaultSlotDuration || 0);
    const icon = normalizeCategoryIcon(req.body?.icon);

    if (!companyId || !name || !Number.isFinite(defaultSlotDuration) || defaultSlotDuration <= 0) {
      return res.status(400).json({ error: "Vyplnte company, nazev a delku slotu v minutach." });
    }

    try {
      await ensureCategorySchema();
      const company = await findCompanyById(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company neexistuje." });
      }

      const result = await query(
        `INSERT INTO categories (company_id, name, description, icon, default_slot_duration)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, name, description || null, icon, Math.round(defaultSlotDuration)]
      );

      const created = await findCategoryById(result.insertId);
      return res.status(201).json({
        id: Number(created.id),
        companyId: Number(created.company_id),
        name: created.name,
        description: created.description,
        icon: created.icon || null,
        defaultSlotDuration: Number(created.default_slot_duration),
      });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se vytvorit kategorii." });
    }
  });

  app.patch("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    const categoryId = Number(req.params.id || 0);
    const name = String(req.body?.name || "").trim();
    const descriptionProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "description");
    const description = String(req.body?.description || "").trim();
    const defaultSlotDurationRaw = req.body?.defaultSlotDuration;
    const iconProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "icon");
    const icon = normalizeCategoryIcon(req.body?.icon);

    if (!categoryId) {
      return res.status(400).json({ error: "Neplatne ID kategorie." });
    }

    try {
      const existing = await findCategoryById(categoryId);
      if (!existing) {
        return res.status(404).json({ error: "Kategorie neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, existing.company_id)) {
        return res.status(403).json({ error: "K teto kategorii nemate pristup." });
      }

      const fields = [];
      const values = [];
      if (name) {
        fields.push("name = ?");
        values.push(name);
      }
      if (descriptionProvided) {
        fields.push("description = ?");
        values.push(description || null);
      }
      if (iconProvided) {
        fields.push("icon = ?");
        values.push(icon);
      }
      if (defaultSlotDurationRaw !== undefined) {
        const defaultSlotDuration = Number(defaultSlotDurationRaw);
        if (!Number.isFinite(defaultSlotDuration) || defaultSlotDuration <= 0) {
          return res.status(400).json({ error: "Delka slotu musi byt kladne cislo." });
        }
        fields.push("default_slot_duration = ?");
        values.push(Math.round(defaultSlotDuration));
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "Neni co upravit." });
      }

      values.push(categoryId);
      await query(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`, values);

      const updated = await findCategoryById(categoryId);
      return res.json({
        id: Number(updated.id),
        companyId: Number(updated.company_id),
        name: updated.name,
        description: updated.description,
        icon: updated.icon || null,
        defaultSlotDuration: Number(updated.default_slot_duration),
      });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se upravit kategorii." });
    }
  });

  app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    const categoryId = Number(req.params.id || 0);

    if (!categoryId) {
      return res.status(400).json({ error: "Neplatne ID kategorie." });
    }

    try {
      const existing = await findCategoryById(categoryId);
      if (!existing) {
        return res.status(404).json({ error: "Kategorie neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, existing.company_id)) {
        return res.status(403).json({ error: "K teto kategorii nemate pristup." });
      }

      await query("DELETE FROM categories WHERE id = ?", [categoryId]);
      return res.json({ ok: true, categoryId });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se odstranit kategorii." });
    }
  });

  app.get("/api/admin/resources", requireAdmin, async (req, res) => {
    const categoryId = Number(req.query.categoryId || 0);

    if (!categoryId) {
      return res.status(400).json({ error: "Chybi categoryId." });
    }

    try {
      const category = await findCategoryById(categoryId);
      if (!category) {
        return res.status(404).json({ error: "Kategorie neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, category.company_id)) {
        return res.status(403).json({ error: "K tehle kategorii nemate pristup." });
      }

      const rows = await query(
        `SELECT id, category_id, name, is_active
         FROM resources
         WHERE category_id = ?
         ORDER BY id`,
        [categoryId]
      );

      return res.json(
        rows.map((resource) => ({
          id: Number(resource.id),
          categoryId: Number(resource.category_id),
          name: resource.name,
          isActive: Boolean(resource.is_active),
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist zdroje." });
    }
  });

  app.post("/api/admin/resources", requireAdmin, async (req, res) => {
    const categoryId = Number(req.body?.categoryId || 0);
    const name = String(req.body?.name || "").trim();
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive);

    if (!categoryId || !name) {
      return res.status(400).json({ error: "Vyplnte kategorii a nazev zdroje." });
    }

    try {
      const category = await findCategoryById(categoryId);
      if (!category) {
        return res.status(404).json({ error: "Kategorie neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, category.company_id)) {
        return res.status(403).json({ error: "K tehle kategorii nemate pristup." });
      }

      const result = await query(
        `INSERT INTO resources (category_id, name, is_active)
         VALUES (?, ?, ?)`,
        [categoryId, name, isActive ? 1 : 0]
      );

      const created = await findResourceById(result.insertId);
      return res.status(201).json({
        id: Number(created.id),
        categoryId: Number(created.category_id),
        name: created.name,
        isActive: Boolean(created.is_active),
      });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se vytvorit zdroj." });
    }
  });

  app.patch("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    const resourceId = Number(req.params.id || 0);

    if (!resourceId) {
      return res.status(400).json({ error: "Neplatne ID zdroje." });
    }

    try {
      const existing = await findResourceById(resourceId);
      if (!existing) {
        return res.status(404).json({ error: "Zdroj neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, existing.company_id)) {
        return res.status(403).json({ error: "K tomuto zdroji nemate pristup." });
      }

      const fields = [];
      const values = [];
      const categoryId = Number(req.body?.categoryId || 0);
      const name = String(req.body?.name || "").trim();

      if (categoryId) {
        const category = await findCategoryById(categoryId);
        if (!category) {
          return res.status(404).json({ error: "Cilova kategorie neexistuje." });
        }
        if (!hasCompanyAccess(req.admin, category.company_id)) {
          return res.status(403).json({ error: "Do cilove kategorie nemate pristup." });
        }
        fields.push("category_id = ?");
        values.push(categoryId);
      }
      if (name) {
        fields.push("name = ?");
        values.push(name);
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "isActive")) {
        fields.push("is_active = ?");
        values.push(req.body.isActive ? 1 : 0);
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "Neni co upravit." });
      }

      values.push(resourceId);
      await query(`UPDATE resources SET ${fields.join(", ")} WHERE id = ?`, values);

      const updated = await findResourceById(resourceId);
      return res.json({
        id: Number(updated.id),
        categoryId: Number(updated.category_id),
        name: updated.name,
        isActive: Boolean(updated.is_active),
      });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se upravit zdroj." });
    }
  });

  app.delete("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    const resourceId = Number(req.params.id || 0);

    if (!resourceId) {
      return res.status(400).json({ error: "Neplatne ID zdroje." });
    }

    try {
      const existing = await findResourceById(resourceId);
      if (!existing) {
        return res.status(404).json({ error: "Zdroj neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, existing.company_id)) {
        return res.status(403).json({ error: "K tomuto zdroji nemate pristup." });
      }

      await query("DELETE FROM resources WHERE id = ?", [resourceId]);
      return res.json({ ok: true, resourceId });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se odstranit zdroj." });
    }
  });

  app.get("/api/admin/pricing-windows", requireAdmin, async (req, res) => {
    const categoryId = Number(req.query.categoryId || 0);

    if (!categoryId) {
      return res.status(400).json({ error: "Chybi categoryId." });
    }

    try {
      const category = await findCategoryById(categoryId);
      if (!category) {
        return res.status(404).json({ error: "Kategorie neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, category.company_id)) {
        return res.status(403).json({ error: "K tehle kategorii nemate pristup." });
      }

      const rows = await query(
        `SELECT pw.id, pw.category_id, pw.resource_id, pw.day_of_week, pw.time_from, pw.time_to, pw.price_per_slot, r.name AS resource_name
         FROM pricing_windows pw
         LEFT JOIN resources r ON r.id = pw.resource_id
         WHERE pw.category_id = ?
         ORDER BY day_of_week, time_from, id`,
        [categoryId]
      );

      return res.json(rows.map(serializePricingWindow));
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist cenikova okna." });
    }
  });

  app.post("/api/admin/pricing-windows", requireAdmin, async (req, res) => {
    const categoryId = Number(req.body?.categoryId || 0);
    const dayOfWeek = Number(req.body?.dayOfWeek || 0);
    const timeFrom = normalizeTimeValue(req.body?.timeFrom);
    const timeTo = normalizeTimeValue(req.body?.timeTo);
    const pricePerSlot = Number(req.body?.pricePerSlot || 0);
    const resourceIdsInput = Array.isArray(req.body?.resourceIds)
      ? req.body.resourceIds
      : [];
    const fallbackResourceId = Number(req.body?.resourceId || 0);
    const targetResourceIds = [
      ...new Set(
        (resourceIdsInput.length > 0
          ? resourceIdsInput
          : fallbackResourceId
            ? [fallbackResourceId]
            : []
        )
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      ),
    ];

    if (!categoryId || dayOfWeek < 1 || dayOfWeek > 7 || !timeFrom || !timeTo || !Number.isFinite(pricePerSlot) || pricePerSlot < 0) {
      return res.status(400).json({ error: "Vyplnte kategorii, den, casove rozmezi a cenu za slot." });
    }
    if (timeFrom >= timeTo) {
      return res.status(400).json({ error: "Cas od musi byt driv nez cas do." });
    }

    try {
      const category = await findCategoryById(categoryId);
      if (!category) {
        return res.status(404).json({ error: "Kategorie neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, category.company_id)) {
        return res.status(403).json({ error: "K tehle kategorii nemate pristup." });
      }

      if (targetResourceIds.length > 0) {
        const categoryResources = await query(
          "SELECT id FROM resources WHERE category_id = ? AND id IN (?)",
          [categoryId, targetResourceIds]
        );
        const availableIds = new Set(categoryResources.map((item) => Number(item.id)));
        const invalidResourceId = targetResourceIds.find(
          (resourceId) => !availableIds.has(Number(resourceId))
        );

        if (invalidResourceId) {
          return res.status(400).json({
            error: `Zdroj #${invalidResourceId} nepatri do zvolene kategorie.`,
          });
        }
      }

      const createTargets = targetResourceIds.length > 0 ? targetResourceIds : [null];
      const createdWindows = [];

      for (const resourceId of createTargets) {
        const result = await query(
          `INSERT INTO pricing_windows (category_id, resource_id, day_of_week, time_from, time_to, price_per_slot)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [categoryId, resourceId, dayOfWeek, timeFrom, timeTo, pricePerSlot]
        );

        const created = await findPricingWindowById(result.insertId);
        createdWindows.push(serializePricingWindow(created));
      }

      if (createdWindows.length === 1) {
        return res.status(201).json(createdWindows[0]);
      }

      return res.status(201).json({ created: createdWindows });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se vytvorit cenikove okno." });
    }
  });

  app.patch("/api/admin/pricing-windows/:id", requireAdmin, async (req, res) => {
    const windowId = Number(req.params.id || 0);

    if (!windowId) {
      return res.status(400).json({ error: "Neplatne ID cenikoveho okna." });
    }

    try {
      const existing = await findPricingWindowById(windowId);
      if (!existing) {
        return res.status(404).json({ error: "Cenikove okno neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, existing.company_id)) {
        return res.status(403).json({ error: "K tomuto cenikovemu oknu nemate pristup." });
      }

      const fields = [];
      const values = [];
      const categoryId = Number(req.body?.categoryId || 0);
      const dayOfWeekRaw = req.body?.dayOfWeek;
      const timeFromRaw = req.body?.timeFrom;
      const timeToRaw = req.body?.timeTo;
      const pricePerSlotRaw = req.body?.pricePerSlot;
      const resourceIdRaw = req.body?.resourceId;
      const resourceIdsRaw = Array.isArray(req.body?.resourceIds)
        ? req.body.resourceIds
        : null;

      if (categoryId) {
        const category = await findCategoryById(categoryId);
        if (!category) {
          return res.status(404).json({ error: "Cilova kategorie neexistuje." });
        }
        if (!hasCompanyAccess(req.admin, category.company_id)) {
          return res.status(403).json({ error: "Do cilove kategorie nemate pristup." });
        }
        fields.push("category_id = ?");
        values.push(categoryId);
      }
      if (dayOfWeekRaw !== undefined) {
        const dayOfWeek = Number(dayOfWeekRaw);
        if (dayOfWeek < 1 || dayOfWeek > 7) {
          return res.status(400).json({ error: "Den v tydnu musi byt 1 az 7." });
        }
        fields.push("day_of_week = ?");
        values.push(dayOfWeek);
      }
      if (timeFromRaw !== undefined) {
        const timeFrom = normalizeTimeValue(timeFromRaw);
        if (!timeFrom) {
          return res.status(400).json({ error: "Cas od nema platny format." });
        }
        fields.push("time_from = ?");
        values.push(timeFrom);
      }
      if (timeToRaw !== undefined) {
        const timeTo = normalizeTimeValue(timeToRaw);
        if (!timeTo) {
          return res.status(400).json({ error: "Cas do nema platny format." });
        }
        fields.push("time_to = ?");
        values.push(timeTo);
      }
      if (pricePerSlotRaw !== undefined) {
        const pricePerSlot = Number(pricePerSlotRaw);
        if (!Number.isFinite(pricePerSlot) || pricePerSlot < 0) {
          return res.status(400).json({ error: "Cena za slot musi byt nezaporne cislo." });
        }
        fields.push("price_per_slot = ?");
        values.push(pricePerSlot);
      }

      let resourceTargets = null;
      if (resourceIdsRaw !== null) {
        const normalizedResourceIds = [
          ...new Set(
            resourceIdsRaw
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value > 0)
          ),
        ];
        resourceTargets = normalizedResourceIds.length > 0 ? normalizedResourceIds : [null];
      } else if (resourceIdRaw !== undefined) {
        const normalizedResourceId = Number(resourceIdRaw || 0);
        resourceTargets = normalizedResourceId > 0 ? [normalizedResourceId] : [null];
      }

      if (resourceTargets !== null) {
        const targetCategoryId = categoryId || Number(existing.category_id);
        const targetResourceIds = resourceTargets.filter((value) => value !== null);
        if (targetResourceIds.length > 0) {
          const validResources = await query(
            "SELECT id FROM resources WHERE category_id = ? AND id IN (?)",
            [targetCategoryId, targetResourceIds]
          );
          const validIds = new Set(validResources.map((item) => Number(item.id)));
          const invalidResourceId = targetResourceIds.find(
            (resourceId) => !validIds.has(Number(resourceId))
          );

          if (invalidResourceId) {
            return res.status(400).json({
              error: `Zdroj #${invalidResourceId} nepatri do kategorie cenikoveho okna.`,
            });
          }
        }

        if (resourceTargets[0] === null) {
          fields.push("resource_id = NULL");
        } else {
          fields.push("resource_id = ?");
          values.push(Number(resourceTargets[0]));
        }
      }

      const nextTimeFrom = timeFromRaw !== undefined ? normalizeTimeValue(timeFromRaw) : String(existing.time_from);
      const nextTimeTo = timeToRaw !== undefined ? normalizeTimeValue(timeToRaw) : String(existing.time_to);
      if (nextTimeFrom >= nextTimeTo) {
        return res.status(400).json({ error: "Cas od musi byt driv nez cas do." });
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "Neni co upravit." });
      }

      const nextCategoryId = categoryId || Number(existing.category_id);
      const nextDayOfWeek =
        dayOfWeekRaw !== undefined
          ? Number(dayOfWeekRaw)
          : Number(existing.day_of_week);
      const nextPricePerSlot =
        pricePerSlotRaw !== undefined
          ? Number(pricePerSlotRaw)
          : Number(existing.price_per_slot);

      values.push(windowId);
      await query(`UPDATE pricing_windows SET ${fields.join(", ")} WHERE id = ?`, values);

      const createdWindows = [];
      if (resourceTargets !== null && resourceTargets.length > 1) {
        for (let index = 1; index < resourceTargets.length; index += 1) {
          const result = await query(
            `INSERT INTO pricing_windows (category_id, resource_id, day_of_week, time_from, time_to, price_per_slot)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              nextCategoryId,
              resourceTargets[index],
              nextDayOfWeek,
              nextTimeFrom,
              nextTimeTo,
              nextPricePerSlot,
            ]
          );

          const createdWindow = await findPricingWindowById(result.insertId);
          createdWindows.push(serializePricingWindow(createdWindow));
        }
      }

      const updated = await findPricingWindowById(windowId);
      if (createdWindows.length > 0) {
        return res.json({
          updated: serializePricingWindow(updated),
          created: createdWindows,
        });
      }

      return res.json(serializePricingWindow(updated));
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se upravit cenikove okno." });
    }
  });

  app.delete("/api/admin/pricing-windows/:id", requireAdmin, async (req, res) => {
    const windowId = Number(req.params.id || 0);

    if (!windowId) {
      return res.status(400).json({ error: "Neplatne ID cenikoveho okna." });
    }

    try {
      const existing = await findPricingWindowById(windowId);
      if (!existing) {
        return res.status(404).json({ error: "Cenikove okno neexistuje." });
      }
      if (!hasCompanyAccess(req.admin, existing.company_id)) {
        return res.status(403).json({ error: "K tomuto cenikovemu oknu nemate pristup." });
      }

      await query("DELETE FROM pricing_windows WHERE id = ?", [windowId]);
      return res.json({ ok: true, windowId });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se odstranit cenikove okno." });
    }
  });

  app.get("/api/admin/booking-settings", requireAdmin, async (req, res) => {
    const requestedCompanyId = Number(req.query.companyId || 0);
    const companyId = isSuperAdmin(req.admin)
      ? requestedCompanyId || null
      : Number(req.admin.companyId);

    if (!companyId) {
      return res.status(400).json({ error: "Chybi companyId." });
    }

    try {
      const company = await findCompanyById(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company neexistuje." });
      }

      if (!hasCompanyAccess(req.admin, companyId)) {
        return res.status(403).json({ error: "K teto company nemate pristup." });
      }

      const settings = await getCompanyBookingSettings(companyId);
      return res.json(settings);
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist pravidla rezervace." });
    }
  });

  app.patch("/api/admin/booking-settings", requireAdmin, async (req, res) => {
    const requestedCompanyId = Number(req.body?.companyId || 0);
    const companyId = isSuperAdmin(req.admin)
      ? requestedCompanyId || null
      : Number(req.admin.companyId);
    const minAdvanceMinutes = normalizeMinAdvanceMinutes(req.body?.minAdvanceMinutes);

    if (!companyId) {
      return res.status(400).json({ error: "Chybi companyId." });
    }
    if (minAdvanceMinutes === null) {
      return res.status(400).json({ error: "Minimalni predstih musi byt cislo 0 az 10080 minut." });
    }

    try {
      const company = await findCompanyById(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company neexistuje." });
      }

      if (!hasCompanyAccess(req.admin, companyId)) {
        return res.status(403).json({ error: "K teto company nemate pristup." });
      }

      await ensureBookingSettingsSchema();
      await query(
        `INSERT INTO company_booking_settings (company_id, min_advance_minutes)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE min_advance_minutes = VALUES(min_advance_minutes)`,
        [companyId, minAdvanceMinutes]
      );

      return res.json({
        companyId: Number(companyId),
        minAdvanceMinutes,
      });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se ulozit pravidla rezervace." });
    }
  });

  app.get("/api/categories", async (req, res) => {
    const companyId = Number(req.query.companyId || 0) || 1;

    try {
      await ensureCategorySchema();
      const categories = await query(
        `SELECT c.id, c.name, c.description, c.icon, c.default_slot_duration,
                COUNT(r.id) AS active_resource_count
         FROM categories c
         LEFT JOIN resources r ON r.category_id = c.id AND r.is_active = 1
         WHERE c.company_id = ?
         GROUP BY c.id, c.name, c.description, c.icon, c.default_slot_duration
         ORDER BY c.id`,
        [companyId]
      );
      res.json(
        categories.map((category) => ({
          ...category,
          icon: category.icon || null,
          activeResourceCount: Number(category.active_resource_count) || 0,
        }))
      );
    } catch (error) {
      res.status(500).json({ error: "Nepodarilo se nacist kategorie." });
    }
  });

  app.get("/api/resources", async (req, res) => {
    const categoryId = Number(req.query.categoryId || 0);
    const companyId = Number(req.query.companyId || 0) || 1;

    if (!categoryId) {
      return res.status(400).json({ error: "Chybi categoryId." });
    }

    try {
      const rows = await query(
        `SELECT r.id, r.name
         FROM resources r
         JOIN categories c ON c.id = r.category_id
         WHERE r.category_id = ? AND c.company_id = ? AND r.is_active = 1
         ORDER BY r.id`,
        [categoryId, companyId]
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist prostredky." });
    }
  });

  app.get("/api/availability", async (req, res) => {
    const categoryId = Number(req.query.categoryId || 0);
    const date = String(req.query.date || "").trim();
    const companyId = Number(req.query.companyId || 0) || 1;

    if (!categoryId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res
        .status(400)
        .json({ error: "Je potreba categoryId a date ve formatu YYYY-MM-DD." });
    }

    try {
      const dayOfWeek = dayOfWeekForPricing(date);
      const bookingSettings = await getCompanyBookingSettings(companyId);

      const [category] = await query(
        "SELECT default_slot_duration FROM categories WHERE id = ? AND company_id = ? LIMIT 1",
        [categoryId, companyId]
      );

      if (!category) {
        return res.status(404).json({ error: "Kategorie neexistuje." });
      }

      const windows = await query(
        "SELECT id, resource_id, time_from, time_to, price_per_slot FROM pricing_windows WHERE category_id = ? AND day_of_week = ? ORDER BY resource_id IS NULL DESC, time_from, id",
        [categoryId, dayOfWeek]
      );

      const resources = await query(
        `SELECT r.id, r.name
         FROM resources r
         JOIN categories c ON c.id = r.category_id
         WHERE r.category_id = ? AND c.company_id = ? AND r.is_active = 1
         ORDER BY r.id`,
        [categoryId, companyId]
      );

      const slotMinutes = Number(category.default_slot_duration) || 30;
      const categoryWideSlots = [];
      const slotsByResource = new Map();

      for (const window of windows) {
        const windowSlots = buildSlotsForWindow(
          String(window.time_from),
          String(window.time_to),
          slotMinutes
        ).map((slot) => ({
          ...slot,
          price: Number(window.price_per_slot),
        }));

        if (window.resource_id == null) {
          categoryWideSlots.push(...windowSlots);
          continue;
        }

        const resourceId = Number(window.resource_id);
        const current = slotsByResource.get(resourceId) || [];
        current.push(...windowSlots);
        slotsByResource.set(resourceId, current);
      }

      const resourcesWithSlots = resources.map((resource) => ({
        ...resource,
        slots: [
          ...categoryWideSlots,
          ...(slotsByResource.get(Number(resource.id)) || []),
        ],
      }));

      const reservedSlots = await query(
        "SELECT resource_id, time_start FROM reservation_slots WHERE date = ? AND resource_id IN (SELECT id FROM resources WHERE category_id = ?)",
        [date, categoryId]
      );

      const resourcesWithAvailability = groupSlotsByResource(resourcesWithSlots, reservedSlots);
      const leadTimeFilteredResources = filterSlotsByLeadTime(
        resourcesWithAvailability,
        date,
        bookingSettings.minAdvanceMinutes
      );

      return res.json({
        date,
        categoryId,
        slotMinutes,
        minAdvanceMinutes: bookingSettings.minAdvanceMinutes,
        resources: leadTimeFilteredResources,
      });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist dostupnost." });
    }
  });

  app.get("/api/admin/reservations", requireAdmin, async (req, res) => {
    const status = String(req.query.status || "").trim();
    const date = String(req.query.date || "").trim();
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const conditions = [];
    const values = [];

    if (req.admin.role !== "superadmin") {
      conditions.push("r.company_id = ?");
      values.push(req.admin.companyId);
    }

    if (status) {
      conditions.push("r.status = ?");
      values.push(status);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      conditions.push("EXISTS (SELECT 1 FROM reservation_slots s WHERE s.reservation_id = r.id AND s.date = ?)");
      values.push(date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const reservations = await query(
        `SELECT
           r.id,
           r.status,
           r.total_price,
           r.note,
           r.created_at,
           c.name AS category_name,
           u.first_name,
           u.last_name,
           u.email,
           u.phone
         FROM reservations r
         JOIN users u ON u.id = r.user_id
         JOIN categories c ON c.id = r.category_id
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT ?`,
        [...values, limit]
      );

      if (reservations.length === 0) {
        return res.json([]);
      }

      const reservationIds = reservations.map((item) => item.id);
      const slotRows = await query(
        "SELECT rs.reservation_id, rs.date, rs.time_start, rs.time_end, rs.price, r.name AS resource_name FROM reservation_slots rs JOIN resources r ON r.id = rs.resource_id WHERE rs.reservation_id IN (?) ORDER BY rs.date, rs.time_start",
        [reservationIds]
      );

      const slotsByReservation = new Map();
      for (const slot of slotRows) {
        const list = slotsByReservation.get(slot.reservation_id) || [];
        list.push(slot);
        slotsByReservation.set(slot.reservation_id, list);
      }

      return res.json(
        reservations.map((reservation) => ({
          ...reservation,
          slots: slotsByReservation.get(reservation.id) || [],
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist seznam rezervaci." });
    }
  });

  app.get("/api/admin/reservations/pending-count", requireAdmin, async (req, res) => {
    try {
      const [result] = await query(
        `SELECT COUNT(*) AS pending_count
         FROM reservations r
         WHERE r.status = 'pending'
           ${req.admin.role === "superadmin" ? "" : "AND r.company_id = ?"}`,
        req.admin.role === "superadmin" ? [] : [req.admin.companyId]
      );

      return res.json({ pendingCount: Number(result?.pending_count) || 0 });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se nacist pocet cekajicich rezervaci." });
    }
  });

  app.patch("/api/admin/reservations/:id/approve", requireAdmin, async (req, res) => {
    const reservationId = Number(req.params.id || 0);

    if (!reservationId) {
      return res.status(400).json({ error: "Neplatne ID rezervace." });
    }

    try {
      const [existing] = await query(
        "SELECT id, company_id, status FROM reservations WHERE id = ? LIMIT 1",
        [reservationId]
      );

      if (!existing) {
        return res.status(404).json({ error: "Rezervace neexistuje." });
      }

      if (req.admin.role !== "superadmin" && Number(existing.company_id) !== Number(req.admin.companyId)) {
        return res.status(403).json({ error: "K teto rezervaci nemate pristup." });
      }

      if (existing.status === "cancelled") {
        return res.status(409).json({ error: "Stornovanou rezervaci nelze schvalit." });
      }

      if (existing.status === "confirmed") {
        return res.status(409).json({ error: "Rezervace uz je schvalena." });
      }

      await query(
        "UPDATE reservations SET status = 'confirmed' WHERE id = ?",
        [reservationId]
      );

      return res.json({ ok: true, reservationId, status: "confirmed" });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se schvalit rezervaci." });
    }
  });

  app.patch("/api/admin/reservations/:id/cancel", requireAdmin, async (req, res) => {
    const reservationId = Number(req.params.id || 0);
    const reason = String(req.body?.reason || "").trim();

    if (!reservationId) {
      return res.status(400).json({ error: "Neplatne ID rezervace." });
    }

    try {
      const [existing] = await query(
        "SELECT id, company_id, status, note FROM reservations WHERE id = ? LIMIT 1",
        [reservationId]
      );

      if (!existing) {
        return res.status(404).json({ error: "Rezervace neexistuje." });
      }

      if (req.admin.role !== "superadmin" && Number(existing.company_id) !== Number(req.admin.companyId)) {
        return res.status(403).json({ error: "K teto rezervaci nemate pristup." });
      }

      if (existing.status === "cancelled") {
        return res.status(409).json({ error: "Rezervace uz je stornovana." });
      }

      const cancelSuffix = reason ? `\n[storno] ${reason}` : "\n[storno]";

      await query(
        "UPDATE reservations SET status = 'cancelled', note = CONCAT(IFNULL(note, ''), ?) WHERE id = ?",
        [cancelSuffix, reservationId]
      );

      return res.json({ ok: true, reservationId });
    } catch (error) {
      return res.status(500).json({ error: "Nepodarilo se stornovat rezervaci." });
    }
  });

  app.post("/api/reservations", async (req, res) => {
    const {
      categoryId,
      resourceId,
      date,
      slotStarts = [],
      firstName,
      lastName,
      email,
      phone,
      note,
      companyId,
    } = req.body || {};

    // Pokud companyId není v requestu, zkusit z query parametru
    const requestedCompanyId = companyId || Number(req.query.companyId || 0);
    const finalCompanyId = requestedCompanyId || 1; // Fallback na company_id = 1 pro backward compat

    if (
      !categoryId ||
      !resourceId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ||
      !Array.isArray(slotStarts) ||
      slotStarts.length === 0 ||
      !firstName ||
      !lastName ||
      !email
    ) {
      return res.status(400).json({ error: "Neplatna data rezervace." });
    }

    try {
      const dayOfWeek = dayOfWeekForPricing(date);
      const bookingSettings = await getCompanyBookingSettings(finalCompanyId);
      const windows = await query(
        "SELECT resource_id, time_from, time_to, price_per_slot FROM pricing_windows WHERE category_id = ? AND day_of_week = ? AND (resource_id IS NULL OR resource_id = ?) ORDER BY resource_id IS NULL DESC, time_from",
        [categoryId, dayOfWeek, resourceId]
      );

      const [category] = await query(
        "SELECT default_slot_duration FROM categories WHERE id = ? LIMIT 1",
        [categoryId]
      );
      const slotMinutes = Number(category?.default_slot_duration) || 30;

      const allowedSlots = new Map();
      for (const window of windows) {
        const slots = buildSlotsForWindow(
          String(window.time_from),
          String(window.time_to),
          slotMinutes
        );
        for (const slot of slots) {
          allowedSlots.set(slot.time_start, {
            ...slot,
            price: Number(window.price_per_slot),
          });
        }
      }

      const uniqueSlotStarts = [...new Set(slotStarts)].sort();

      const selected = uniqueSlotStarts
        .filter((value) => allowedSlots.has(value))
        .map((value) => allowedSlots.get(value));

      if (selected.length !== uniqueSlotStarts.length) {
        return res.status(400).json({ error: "Vybrane sloty nejsou povolene." });
      }

      const blockedByLeadTime = uniqueSlotStarts.find(
        (slotStart) =>
          !isSlotBookableWithLeadTime(
            date,
            slotStart,
            bookingSettings.minAdvanceMinutes
          )
      );

      if (blockedByLeadTime) {
        return res.status(400).json({
          error: `Rezervaci je nutne vytvorit alespon ${bookingSettings.minAdvanceMinutes} minut pred zacatkem.`
        });
      }

      const totalPrice = selected.reduce((sum, slot) => sum + slot.price, 0);

       const result = await withTransaction(async (connection) => {
         const [categoryExists] = await txQuery(
           connection,
            "SELECT id FROM categories WHERE id = ? AND company_id = ? LIMIT 1",
            [categoryId, finalCompanyId]
         );

         if (!categoryExists) {
           const categoryError = new Error("Kategorie neexistuje.");
           categoryError.statusCode = 404;
           throw categoryError;
         }

         const [resourceExists] = await txQuery(
           connection,
           "SELECT id FROM resources WHERE id = ? AND category_id = ? AND is_active = 1 LIMIT 1",
           [resourceId, categoryId]
         );

         if (!resourceExists) {
           const resourceError = new Error("Prostredky neodpovidaji kategorii.");
           resourceError.statusCode = 400;
           throw resourceError;
         }

         const [existingUser] = await txQuery(
           connection,
           "SELECT id FROM users WHERE email = ? AND company_id = ? LIMIT 1",
           [email, finalCompanyId]
         );

         let userId = existingUser?.id;

         if (!userId) {
           try {
             const userResult = await txQuery(
               connection,
               "INSERT INTO users (company_id, role, email, password_hash, first_name, last_name, phone, current_credit) VALUES (?, 'player', ?, '', ?, ?, ?, 0.00)",
               [finalCompanyId, email, firstName, lastName, phone || null]
             );
             userId = userResult.insertId;
           } catch (error) {
             if (error?.code !== "ER_DUP_ENTRY") {
               throw error;
             }

             const [lateUser] = await txQuery(
               connection,
               "SELECT id FROM users WHERE email = ? AND company_id = ? LIMIT 1",
               [email, finalCompanyId]
             );
             userId = lateUser?.id;
           }
         }

         const conflicts = await txQuery(
           connection,
           "SELECT time_start FROM reservation_slots WHERE resource_id = ? AND date = ? AND time_start IN (?) FOR UPDATE",
           [resourceId, date, uniqueSlotStarts]
         );

         if (conflicts.length > 0) {
           const conflictError = new Error("Nektere sloty jsou uz obsazene.");
           conflictError.statusCode = 409;
           conflictError.conflicts = conflicts.map((item) => item.time_start);
           throw conflictError;
         }

         const reservationResult = await txQuery(
           connection,
            "INSERT INTO reservations (company_id, user_id, category_id, total_price, status, note) VALUES (?, ?, ?, ?, 'pending', ?)",
           [finalCompanyId, userId, categoryId, totalPrice, note || null]
         );

        const reservationId = reservationResult.insertId;

        for (const slot of selected) {
          await txQuery(
            connection,
            "INSERT INTO reservation_slots (reservation_id, resource_id, date, time_start, time_end, price) VALUES (?, ?, ?, ?, ?, ?)",
            [reservationId, resourceId, date, slot.time_start, slot.time_end, slot.price]
          );
        }

        return {
          reservationId,
          totalPrice,
          status: "pending",
          slots: selected,
        };
      });

      return res.status(201).json({
        reservationId: result.reservationId,
        totalPrice: result.totalPrice,
        status: result.status,
        slots: result.slots,
      });
    } catch (error) {
      if (error?.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      if (error?.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }

      if (error?.statusCode === 409) {
        return res.status(409).json({
          error: error.message,
          conflicts: error.conflicts || [],
        });
      }

      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Nektere sloty byly mezitim obsazeny." });
      }
      return res.status(500).json({ error: "Nepodarilo se vytvorit rezervaci." });
    }
  });

  return app;
}



