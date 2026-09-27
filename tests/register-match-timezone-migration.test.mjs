import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../supabase/migrations/20260927_register_match_local_timezone.sql",
  import.meta.url,
);

test("register_match migration sets Lisbon time on the existing function signature", () => {
  const sql = readFileSync(migrationUrl, "utf8")
    .replace(/--[^\n]*/g, "")
    .trim();
  const argumentTypes = [
    "date",
    "uuid",
    "uuid",
    "uuid",
    "uuid",
    "integer",
    "integer",
    "integer",
    "integer",
    "integer",
    "integer",
    "integer",
    "integer",
    "integer",
  ];
  const signature = argumentTypes.join("\\s*,\\s*");
  const expectedMigration = new RegExp(
    `^ALTER\\s+FUNCTION\\s+public\\.register_match\\s*\\(\\s*${signature}\\s*\\)\\s+SET\\s+timezone\\s+TO\\s+'Europe/Lisbon'\\s*;$`,
    "i",
  );

  assert.match(
    sql,
    expectedMigration,
    "migration should alter the existing public.register_match(date, uuid, uuid, uuid, uuid, integer x9) function and set its timezone to Europe/Lisbon",
  );
});
