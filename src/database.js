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
  CREATE TABLE IF NOT EXISTS protection_sessions (
    session_id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vouchers (
    voucher_id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
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
const upsertProtection = database.prepare("INSERT INTO protection_sessions (session_id, updated_at, payload_json) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET updated_at = excluded.updated_at, payload_json = excluded.payload_json");
const selectProtection = database.prepare("SELECT payload_json FROM protection_sessions WHERE session_id = ?");
const upsertVoucher = database.prepare("INSERT INTO vouchers (voucher_id, updated_at, payload_json) VALUES (?, ?, ?) ON CONFLICT(voucher_id) DO UPDATE SET updated_at = excluded.updated_at, payload_json = excluded.payload_json");
const selectVoucher = database.prepare("SELECT payload_json FROM vouchers WHERE voucher_id = ?");

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

export function persistProtectionSession(session) {
  upsertProtection.run(session.sessionId, session.updatedAt || session.createdAt, JSON.stringify(session));
  return structuredClone(session);
}

export function findProtectionSession(sessionId) {
  const row = selectProtection.get(sessionId);
  return row ? JSON.parse(row.payload_json) : null;
}

export function persistVoucher(voucher) {
  upsertVoucher.run(voucher.id, voucher.redeemedAt || voucher.issuedAt, JSON.stringify(voucher));
  return structuredClone(voucher);
}

export function findVoucher(voucherId) {
  const row = selectVoucher.get(voucherId);
  return row ? JSON.parse(row.payload_json) : null;
}
