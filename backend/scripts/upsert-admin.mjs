import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const databaseUrl = process.env.DATABASE_URL || "mysql://root@localhost:3306/stolni_tenis_rezervace";
const email = String(getArg("email")).trim().toLowerCase();
const password = String(getArg("password"));
const companyId = Number(getArg("companyId", "1"));
const role = String(getArg("role", "admin")).trim();
const firstName = String(getArg("firstName", "Admin")).trim() || "Admin";
const lastName = String(getArg("lastName", "User")).trim() || "User";

if (!email || !password || !companyId || !["admin", "superadmin"].includes(role)) {
  console.error(
    "Pouziti: node scripts/upsert-admin.mjs --email=admin@example.com --password=Heslo123 --companyId=1 [--role=admin|superadmin] [--firstName=Admin] [--lastName=User]"
  );
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const connection = await mysql.createConnection(databaseUrl);

try {
  const [existingRows] = await connection.query(
    "SELECT id FROM users WHERE email = ? AND company_id = ? LIMIT 1",
    [email, companyId]
  );

  if (existingRows.length > 0) {
    const userId = existingRows[0].id;
    await connection.query(
      "UPDATE users SET role = ?, password_hash = ?, first_name = ?, last_name = ? WHERE id = ?",
      [role, passwordHash, firstName, lastName, userId]
    );
    console.log(`${role} uzivatel aktualizovan (id=${userId}, email=${email}, companyId=${companyId}).`);
  } else {
    const [result] = await connection.query(
      "INSERT INTO users (company_id, role, email, password_hash, first_name, last_name, current_credit) VALUES (?, ?, ?, ?, ?, ?, 0.00)",
      [companyId, role, email, passwordHash, firstName, lastName]
    );
    console.log(
      `${role} uzivatel vytvoren (id=${result.insertId}, email=${email}, companyId=${companyId}).`
    );
  }
} finally {
  await connection.end();
}


