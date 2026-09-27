import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const helperUrl = new URL("../lib/local-date.ts", import.meta.url).href;

function dateInLisbon(isoDate) {
  const script = `
    import { localDateString } from ${JSON.stringify(helperUrl)};
    process.stdout.write(localDateString(new Date(${JSON.stringify(isoDate)})));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf8",
    env: { ...process.env, TZ: "Europe/Lisbon" },
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("localDateString follows the Lisbon civil date across the UTC summer boundary", () => {
  assert.equal(dateInLisbon("2026-09-19T23:30:00Z"), "2026-09-20");
});

test("localDateString follows the Lisbon civil date in winter", () => {
  assert.equal(dateInLisbon("2026-01-01T23:30:00Z"), "2026-01-01");
});
