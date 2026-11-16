import assert from "node:assert/strict";
import test from "node:test";
import { readOneConfig, readPublicConfig, regionOf } from "./publicConfig.js";

test("a partial config keeps the other defaults", () => {
  const config = readOneConfig({
    ads: { mode: "live", androidUnitId: "ca-app-pub-1/2", iosUnitId: "nope", testDevices: ["ABCDEF12", "x"] },
    poker: { autoDealDefault: false },
    update: { minVersion: "1.2.0", force: true, iosUrl: "https://apps.apple.com/app/id1", androidUrl: "http://evil.example" },
    announcement: "  Hello  ",
    names: { embedded: ["nope"], words: ["x", "zz"] },
  });
  assert.equal(config.ads.mode, "live");
  assert.equal(config.ads.androidUnitId, "ca-app-pub-1/2");
  assert.equal(config.ads.iosUnitId, "");
  assert.deepEqual(config.ads.testDevices, ["ABCDEF12"]);
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
  const set = readPublicConfig("{");
  assert.equal(set.default.ads.mode, "test");
  assert.equal(set.default.poker.autoDealDefault, true);
  assert.equal(set.default.update.minVersion, "");
  assert.deepEqual(set.regions, {});
});

test("each region is a whole config of its own", () => {
  const set = readPublicConfig(JSON.stringify({
    default: { ads: { mode: "live" }, announcement: "Hi", poker: { autoDealDefault: false } },
    fr: { ads: { mode: "off" } },
    USA: { ads: { mode: "off" } },
  }));
  assert.equal(set.default.ads.mode, "live");
  assert.equal(set.regions.FR?.ads.mode, "off");
  // Not merged over the default: what France leaves out is the built-in value.
  assert.equal(set.regions.FR?.announcement, "");
  assert.equal(set.regions.FR?.poker.autoDealDefault, true);
  assert.equal(set.regions.USA, undefined);
});

test("the older single config becomes the default", () => {
  const set = readPublicConfig(JSON.stringify({ ads: { enabled: false }, announcement: "Old" }));
  assert.equal(set.default.ads.mode, "off");
  assert.equal(set.default.announcement, "Old");
  assert.deepEqual(set.regions, {});
});

test("only a two-letter region is accepted", () => {
  assert.equal(regionOf("fr"), "FR");
  assert.equal(regionOf("FRA"), "");
  assert.equal(regionOf(["FR"]), "");
  assert.equal(regionOf(undefined), "");
});
