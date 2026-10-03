import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { normalizePresenceMap } from "../src/schema-diagnostics.js";

const script = await readFile(new URL("../script.js", import.meta.url), "utf8");

test("schema diagnostics accepts production array responses", () => {
  assert.deepEqual(normalizePresenceMap(["idempotency_key", "warehouse_code"]), {
    idempotency_key: true,
    warehouse_code: true
  });
});

test("schema diagnostics preserves legacy object responses", () => {
  assert.deepEqual(normalizePresenceMap({ idempotency_key: true, warehouse_code: false }), {
    idempotency_key: true,
    warehouse_code: false
  });
});

test("replenishment health recognizes the canonical idempotency index", () => {
  assert.match(script, /wms_replenishment_idempotency_uidx/);
  assert.match(script, /normalizePresenceMap\(data && data\.columns\)/);
  assert.match(script, /normalizePresenceMap\(data && data\.indexes\)/);
  assert.match(script, /Object\.keys\(result\.columns\)\.every/);
});
