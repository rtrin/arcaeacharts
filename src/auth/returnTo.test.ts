import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnTo } from "./returnTo.ts";

test("accepts internal return paths and rejects external redirects", () => {
  assert.equal(safeReturnTo("/records/new?from=catalog"), "/records/new?from=catalog");
  assert.equal(safeReturnTo("https://example.com"), "/records");
  assert.equal(safeReturnTo("//example.com"), "/records");
  assert.equal(safeReturnTo("/\\example.com"), "/records");
  assert.equal(safeReturnTo(null), "/records");
});
