import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { appleSignInOff, assertSafeAuthConfig, returnUrl } from "./auth.js";

const pem = (type: "ec" | "rsa") => {
  const { privateKey } = type === "ec"
    ? generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    : generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
};

/** Railway holds the .p8 on one line, with a literal \n for each line break. */
const oneLine = (value: string) => value.replace(/\n/g, "\\n");

const apple = { APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567", APPLE_PRIVATE_KEY: oneLine(pem("ec")) };
const production = { NODE_ENV: "production", ...apple };

test("production starts with a working Apple key", () => {
  assert.doesNotThrow(() => assertSafeAuthConfig(production));
});

test("a key pasted with real line breaks also works", () => {
  assert.doesNotThrow(() => assertSafeAuthConfig({ ...production, APPLE_PRIVATE_KEY: pem("ec") }));
});

test("production starts without any Apple key, with Apple sign-in off", () => {
  assert.doesNotThrow(() => assertSafeAuthConfig({ NODE_ENV: "production" }));
  assert.equal(appleSignInOff({ NODE_ENV: "production" }), true);
  assert.equal(appleSignInOff(production), false);
});

test("local dev keeps Apple sign-in on without the key", () => {
  assert.equal(appleSignInOff({}), false);
  assert.equal(appleSignInOff({ NODE_ENV: "development" }), false);
});

test("production does not start with a key that is only partly set", () => {
  assert.throws(() => assertSafeAuthConfig({ ...production, APPLE_KEY_ID: " " }), /^Error: APPLE_KEY_ID must be set too/);
  assert.throws(() => assertSafeAuthConfig({ NODE_ENV: "production", APPLE_TEAM_ID: "TEAM123456" }), /APPLE_KEY_ID, APPLE_PRIVATE_KEY must be set too/);
});

test("production does not start with a broken key", () => {
  const cut = apple.APPLE_PRIVATE_KEY.slice(0, 80);
  assert.throws(() => assertSafeAuthConfig({ ...production, APPLE_PRIVATE_KEY: cut }), /not a readable private key/);
  assert.throws(() => assertSafeAuthConfig({ ...production, APPLE_PRIVATE_KEY: "hello" }), /not a readable private key/);
});

test("production does not start with a key that is not a Sign in with Apple key", () => {
  assert.throws(() => assertSafeAuthConfig({ ...production, APPLE_PRIVATE_KEY: oneLine(pem("rsa")) }), /not a Sign in with Apple key/);
});

test("local dev starts without the Apple key", () => {
  assert.doesNotThrow(() => assertSafeAuthConfig({}));
  assert.doesNotThrow(() => assertSafeAuthConfig({ NODE_ENV: "development", AUTH_UPSTREAM: "https://example.test" }));
});

test("AUTH_UPSTREAM still blocks production", () => {
  assert.throws(() => assertSafeAuthConfig({ ...production, AUTH_UPSTREAM: "https://example.test" }), /AUTH_UPSTREAM must not be set/);
});

test("the sign-in code goes only to the app's own link", () => {
  assert.equal(returnUrl("shulchan://auth"), "shulchan://auth");
  assert.equal(returnUrl("shulchan://auth/"), "shulchan://auth");
});

test("no other address can catch the sign-in code", () => {
  for (const address of [
    "exp://localhost:8081/--/auth",
    "exp://127.0.0.1:8081/--/auth",
    "exp://192.168.1.20:8081/--/auth",
    "exps://abc.exp.direct/--/auth",
    "http://localhost:8081/auth",
    "https://loochka.com/auth",
    "https://evil.example/auth",
    "shulchan://other",
    "shulchan://auth?code=1",
    "shulchan://user@auth",
    "shulchan://auth/extra",
    "not a url",
    "",
  ]) {
    assert.equal(returnUrl(address), "", address);
  }
});
