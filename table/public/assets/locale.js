function resolveLocale(input) {
  var LOCALES = { en: 1, he: 1, es: 1, ru: 1, ar: 1 };
  var RTL = { he: 1, ar: 1 };
  function valid(code) { return LOCALES[code] === 1; }
  function base(value) { return String(value || "").toLowerCase().split("-")[0]; }
  var query = base(input.query);
  if (valid(query)) return { lang: query, explicit: true, rtl: RTL[query] === 1 };
  var saved = base(input.saved);
  if (valid(saved)) return { lang: saved, explicit: true, rtl: RTL[saved] === 1 };
  var list = input.languages || [];
  for (var i = 0; i < list.length; i++) {
    var code = base(list[i]);
    if (valid(code)) return { lang: code, explicit: false, rtl: RTL[code] === 1 };
  }
  return { lang: "en", explicit: false, rtl: false };
}
/* resolveLocale:end */

(function () {
  var saved = "";
  try { saved = localStorage.getItem("loochka.locale") || ""; } catch (e) {}
  var query = "";
  try { query = new URLSearchParams(location.search).get("lang") || ""; } catch (e) {}
  var languages = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en"];
  var picked = resolveLocale({ query: query, saved: saved, languages: languages });
  if (query && picked.explicit) {
    try { localStorage.setItem("loochka.locale", picked.lang); } catch (e) {}
  }
  document.documentElement.lang = picked.lang;
  document.documentElement.dir = picked.rtl ? "rtl" : "ltr";
  window.__loochkaLocale = picked.lang;
  if (picked.lang === "he" || picked.lang === "ar") {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = picked.lang === "he"
      ? "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap"
      : "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap";
    link.setAttribute("data-locale-font", picked.lang);
    document.head.appendChild(link);
  }
  if (picked.lang !== "en") {
    document.documentElement.classList.add("i18n-pending");
    setTimeout(function () {
      document.documentElement.classList.remove("i18n-pending");
    }, 4000);
  }
})();
