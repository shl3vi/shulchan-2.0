import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "./version.ts";

test("older builds sort before the minimum", () => {
  assert.equal(compareVersions("1.0.0", "1.2.0"), -1);
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
  assert.equal(compareVersions("1.2.1", "1.2.0"), 1);
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
});
