import mysql from "mysql2/promise";
import { config } from "./config.js";

const pool = mysql.createPool(config.databaseUrl);

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


