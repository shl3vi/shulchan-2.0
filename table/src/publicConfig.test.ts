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
  assert.equal(config.games.poker.autoDealDefault, false);
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
  assert.equal(set.default.games.poker.autoDealDefault, true);
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
  assert.equal(set.regions.FR?.games.poker.autoDealDefault, true);
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

test("video quality is read per game and kept in range", () => {
  const config = readOneConfig({
    video: { poker: { width: 480, height: 360, frameRate: 99, maxKbps: "fast" }, backgammon: "nope" },
  });
  assert.deepEqual(config.games.poker.video, { width: 480, height: 360, frameRate: 30, maxKbps: 150 });
  assert.deepEqual(config.games.backgammon.video, { width: 320, height: 240, frameRate: 15, maxKbps: 150 });
  assert.deepEqual(readOneConfig({}).games.poker.video, { width: 320, height: 240, frameRate: 15, maxKbps: 150 });
});

test("each game reads its own section, and the older top-level sections still work", () => {
  const config = readOneConfig({
    games: {
      poker: { autoDealDefault: false, turnSecondsDefault: 999, video: { width: 640 } },
      backgammon: { video: { frameRate: 10 } },
    },
  });
  assert.equal(config.games.poker.autoDealDefault, false);
  assert.equal(config.games.poker.turnSecondsDefault, 300);
  assert.equal(config.games.poker.video.width, 640);
  assert.equal(config.games.backgammon.video.frameRate, 10);
  const old = readOneConfig({ poker: { turnSecondsDefault: 45 }, video: { backgammon: { width: 480 } } });
  assert.equal(old.games.poker.turnSecondsDefault, 45);
  assert.equal(old.games.backgammon.video.width, 480);
});
