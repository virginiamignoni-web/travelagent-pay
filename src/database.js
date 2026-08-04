import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const isTest = Boolean(process.env.NODE_TEST_CONTEXT);
const databasePath = process.env.TRAVELAGENT_DB_PATH || (isTest ? ":memory:" : join(here, "..", "data", "travelagent.sqlite"));

if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS reservations (
    reservation_id TEXT PRIMARY KEY,
    booking_reference TEXT NOT NULL UNIQUE,
    traveler_wallet TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reservations_wallet_created
    ON reservations (traveler_wallet, created_at DESC);
`);

const upsertReservation = database.prepare(`
  INSERT INTO reservations (reservation_id, booking_reference, traveler_wallet, status, created_at, payload_json)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(reservation_id) DO UPDATE SET
    booking_reference = excluded.booking_reference,
    traveler_wallet = excluded.traveler_wallet,
    status = excluded.status,
    created_at = excluded.created_at,
    payload_json = excluded.payload_json
`);
const selectReservation = database.prepare("SELECT payload_json FROM reservations WHERE reservation_id = ?");
const selectAllReservations = database.prepare("SELECT payload_json FROM reservations ORDER BY created_at DESC");
const selectWalletReservations = database.prepare("SELECT payload_json FROM reservations WHERE traveler_wallet = ? ORDER BY created_at DESC");

export function persistReservation(reservation) {
  upsertReservation.run(
    reservation.reservationId,
    reservation.bookingReference,
    reservation.travelerWallet || null,
    reservation.status,
    reservation.createdAt,
    JSON.stringify(reservation),
  );
  return structuredClone(reservation);
}

export function findReservation(reservationId) {
  const row = selectReservation.get(reservationId);
  return row ? JSON.parse(row.payload_json) : null;
}

export function findReservations({ travelerWallet } = {}) {
  const rows = travelerWallet ? selectWalletReservations.all(travelerWallet) : selectAllReservations.all();
  return rows.map((row) => JSON.parse(row.payload_json));
}

export function databaseInfo() {
  return { engine: "sqlite", persistent: databasePath !== ":memory:", path: databasePath === ":memory:" ? ":memory:" : "data/travelagent.sqlite" };
}
