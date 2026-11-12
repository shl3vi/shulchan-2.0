const EMBEDDED = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "retard",
  "pussy", "whore", "slut", "porn", "horny", "penis", "vagina", "dildo",
  "dick", "cock", "tits", "nude", "puta", "puto",
  "mierda", "joder", "cabron", "maricon", "verga", "pendejo", "gilipollas",
  "שרמוטה", "מניאק", "מזדיין", "כוסאמק",
];

const WORDS = ["ass", "sex", "cum", "fag", "tit", "hoe", "זין", "כוס"];

let extraEmbedded: string[] = [];
let extraWords: string[] = [];

/** Words from remote config, checked the same way as the list above. */
export function setNameExtras(embedded: string[], words: string[]) {
  extraEmbedded = embedded.map(compact).filter((term) => term.length >= 2);
  extraWords = words.map(compact).filter((term) => term.length >= 2);
}

function fold(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t");
}

function squash(value: string) {
  return value.replace(/(.)\1{2,}/gu, "$1");
}

function compact(value: string) {
  return squash(fold(value).replace(/[^\p{L}]+/gu, ""));
}

function tokens(value: string) {
  return fold(value).split(/[^\p{L}]+/u).map(squash).filter((token) => token.length > 0);
}

export function blockedName(raw: string) {
  const flat = compact(raw);
  if (!flat) return false;
  if (EMBEDDED.some((term) => flat.includes(term))) return true;
  if (extraEmbedded.some((term) => flat.includes(term))) return true;
  const parts = new Set(tokens(raw));
  return WORDS.some((term) => parts.has(term) || flat === term)
    || extraWords.some((term) => parts.has(term) || flat === term);
}

export type NameProblem = "length" | "blocked";

export function nameProblem(raw: string): NameProblem | null {
  const name = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  if (name.length < 1 || name.length > 24) return "length";
  if (blockedName(name)) return "blocked";
  return null;
}

export function playerName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  if (nameProblem(name)) return null;
  return name;
}
