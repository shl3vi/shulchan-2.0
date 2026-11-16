import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

function load(file, marker, prefix) {
  const src = fs.readFileSync(path.join(root, "assets", file), "utf8");
  const start = src.indexOf(prefix) + prefix.length;
  const end = src.indexOf(marker);
  const expr = src.slice(start, end).trim().replace(/;\s*$/, "");
  return Function(`"use strict"; return (${expr});`)();
}

const catalogs = load("i18n.js", "/* catalogs:end */", "const catalogs = ");

test("every language has the same site copy", () => {
  const locales = ["en", "he", "es", "ru", "ar"];
  assert.deepEqual(Object.keys(catalogs).sort(), [...locales].sort());
  const keys = Object.keys(catalogs.en).sort();
  assert.ok(keys.length > 100);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(catalogs[locale]).sort(), keys, locale);
    for (const key of keys) assert.ok(String(catalogs[locale][key]).trim(), `${locale} ${key}`);
  }
});

test("every phrase on the site has a translation", () => {
  const used = new Set();
  const html = ["index.html", "support.html", "account.html", "privacy.html", "terms.html"]
    .map((name) => fs.readFileSync(path.join(root, name), "utf8"))
    .join("\n");
  for (const match of html.matchAll(/data-i18n(?:-html|-aria|-alt|-content)?="([^"]+)"/g)) used.add(match[1]);
  const js = fs.readFileSync(path.join(root, "assets/site.js"), "utf8");
  for (const match of js.matchAll(/\.t\("([^"]+)"\)/g)) used.add(match[1]);
  const missing = [...used].filter((key) => !(key in catalogs.en));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 50);
});

test("the browser language is used, and English is the default", () => {
  const src = fs.readFileSync(path.join(root, "assets/locale.js"), "utf8");
  const end = src.indexOf("/* resolveLocale:end */");
  const resolveLocale = Function(`${src.slice(0, end)}; return resolveLocale;`)();
  assert.equal(resolveLocale({ query: "", saved: "", languages: ["he-IL", "en"] }).lang, "he");
  assert.equal(resolveLocale({ query: "", saved: "", languages: ["he-IL", "en"] }).rtl, true);
  assert.equal(resolveLocale({ query: "", saved: "", languages: ["es-MX"] }).lang, "es");
  assert.equal(resolveLocale({ query: "", saved: "", languages: ["ru"] }).lang, "ru");
  assert.equal(resolveLocale({ query: "", saved: "", languages: ["ar-EG", "en"] }).lang, "ar");
  assert.equal(resolveLocale({ query: "", saved: "", languages: ["fr-FR", "de"] }).lang, "en");
  assert.equal(resolveLocale({ query: "", saved: "", languages: [] }).lang, "en");
  assert.equal(resolveLocale({ query: "pt", saved: "", languages: ["he"] }).lang, "he");
  assert.equal(resolveLocale({ query: "", saved: "es", languages: ["he"] }).lang, "es");
  assert.equal(resolveLocale({ query: "ru", saved: "es", languages: ["he"] }).lang, "ru");
  assert.equal(resolveLocale({ query: "ru", saved: "es", languages: ["he"] }).explicit, true);
  assert.equal(resolveLocale({ query: "", saved: "", languages: ["en-US"] }).explicit, false);
});
