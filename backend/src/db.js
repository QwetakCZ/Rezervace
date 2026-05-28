import mysql from "mysql2/promise";
import { config } from "./config.js";

// Active24 (a další hostingy) používají self-signed SSL certifikáty.
// Parsujeme DATABASE_URL ručně a přidáme ssl: { rejectUnauthorized: false }
function buildPoolConfig(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      ssl: { rejectUnauthorized: false },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };
  } catch {
    // Fallback na původní URL pokud parsování selže
    return databaseUrl;
  }
}

const pool = mysql.createPool(buildPoolConfig(config.databaseUrl));

export async function query(sql, values = []) {
  const [rows] = await pool.query(sql, values);
  return rows;
}

export async function txQuery(connection, sql, values = []) {
  const [rows] = await connection.query(sql, values);
  return rows;
}

export async function withTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function closePool() {
  await pool.end();
}


