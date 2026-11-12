import assert from "node:assert/strict";
import test from "node:test";
import { readPublicConfig } from "./publicConfig.js";

test("a partial config keeps the other defaults", () => {
  const config = readPublicConfig(JSON.stringify({
    ads: { enabled: false, bannerUnitId: "ca-app-pub-1/2" },
    poker: { autoDealDefault: false },
    update: { minVersion: "1.2.0", force: true, iosUrl: "https://apps.apple.com/app/id1", androidUrl: "http://evil.example" },
    announcement: "  Hello  ",
    names: { embedded: ["nope"], words: ["x", "zz"] },
  }));
  assert.equal(config.ads.enabled, false);
  assert.equal(config.ads.bannerUnitId, "ca-app-pub-1/2");
  assert.equal(config.poker.autoDealDefault, false);
  assert.equal(config.update.minVersion, "1.2.0");
  assert.equal(config.update.force, true);
  assert.equal(config.update.iosUrl, "https://apps.apple.com/app/id1");
  assert.equal(config.update.androidUrl, "");
  assert.equal(config.announcement, "Hello");
  assert.deepEqual(config.names.embedded, ["nope"]);
  assert.deepEqual(config.names.words, ["zz"]);
});

test("broken config falls back to the built-in values", () => {
  const config = readPublicConfig("{");
  assert.equal(config.ads.enabled, true);
  assert.equal(config.poker.autoDealDefault, true);
  assert.equal(config.update.minVersion, "");
  assert.equal(config.announcement, "");
  assert.deepEqual(config.names.words, []);
});
