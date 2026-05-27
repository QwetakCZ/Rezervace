import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || "mysql://root@localhost:3306/stolni_tenis_rezervace";
const connection = await mysql.createConnection(databaseUrl);

try {
  await connection.query(
    "ALTER TABLE users MODIFY role ENUM('superadmin','admin','coach','player') NOT NULL DEFAULT 'player'"
  );
  console.log("users.role upraveno na superadmin/admin/coach/player");
} finally {
  await connection.end();
}

