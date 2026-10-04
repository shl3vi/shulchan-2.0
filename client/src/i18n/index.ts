/**
 * Add a language by copying `en` and translating every key.
 * The device language is matched on its language code (`he`, `en`, …).
 */
const catalogs = {
  en: {
    enterYourName: "how the table sees you",
    yourName: "Your name",
    smallBlind: "Small blind",
    buyIn: "Buy-in",
    moreThan: "More than {n}",
    yourAmount: "Your amount",
    dealMeIn: "Deal me in",
    shuffling: "Shuffling…",
    tagline: "Open a table. Send the link. Play.",
    atTable: "You're at a table",
    backToSeat: "Tap to go back to your seat",
    serverUnreachable: "Could not reach the server",
    wholeNumber: "Enter a whole number of at least {n}",
    invited: "YOU'RE INVITED",
    takeASeat: "Take a seat.",
    sitDown: "Sit down",
    sittingDown: "Sitting down…",
    couldNotJoin: "Could not join",
    inviteMissing: "This invite link is missing a table.",
    statistics: "Statistics",
    shareTable: "Share table",
    leaveGame: "Leave game",
    shareMessage: "Pull up a chair at my Shulchan table.\n{link}",
    sitFirst: "Sit down from the home screen first.",
    noPlayers: "No players",
    remove: "Remove",
    pot: "Pot {n}",
    waiting: "Waiting",
    openSeat: "Open",
    amount: "amount",
    waitingTurn: "Waiting for your turn",
    leftTable: "You are no longer at this table",
    alreadyAtTable: "You are already at a table",
    preflop: "Pre-Flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    fold: "fold",
    check: "check",
    call: "call",
    bet: "bet",
    raise: "raise",
    deal: "Deal",
  },
  he: {
    enterYourName: "איך השולחן רואה אותך",
    yourName: "השם שלך",
    smallBlind: "סמול בליינד",
    buyIn: "כניסה",
    moreThan: "יותר מ-{n}",
    yourAmount: "סכום לבחירה",
    dealMeIn: "חלקו לי קלפים",
    shuffling: "מערבבים…",
    tagline: "פותחים שולחן. שולחים קישור. משחקים.",
    atTable: "אתם בשולחן",
    backToSeat: "חזרו לכיסא",
    serverUnreachable: "אין חיבור לשרת",
    wholeNumber: "הכניסו מספר שלם, לפחות {n}",
    invited: "הוזמנתם",
    takeASeat: "שבו לשולחן.",
    sitDown: "לשבת",
    sittingDown: "יושבים…",
    couldNotJoin: "אי אפשר להצטרף",
    inviteMissing: "בקישור חסר שולחן.",
    statistics: "סטטיסטיקה",
    shareTable: "שיתוף שולחן",
    leaveGame: "יציאה מהמשחק",
    shareMessage: "בואו לשולחן שלי בשולחן.\n{link}",
    sitFirst: "קודם יושבים מהמסך הראשי.",
    noPlayers: "אין שחקנים",
    remove: "הסרה",
    pot: "קופה {n}",
    waiting: "ממתינים",
    openSeat: "פנוי",
    amount: "סכום",
    waitingTurn: "ממתינים לתור שלך",
    leftTable: "כבר לא בשולחן",
    alreadyAtTable: "כבר יושבים בשולחן",
    preflop: "פרי-פלופ",
    flop: "פלופ",
    turn: "טרן",
    river: "ריבר",
    fold: "פולד",
    check: "צ'ק",
    call: "קול",
    bet: "בט",
    raise: "רייז",
    deal: "חלוקה",
  },
} as const;

export type Locale = keyof typeof catalogs;
export type MessageKey = keyof typeof catalogs.en;

function deviceLanguage(): string {
  return (Intl.DateTimeFormat().resolvedOptions().locale || "en").toLowerCase();
}

export function locale(): Locale {
  const code = deviceLanguage().split(/[-_]/)[0] ?? "en";
  return code in catalogs ? (code as Locale) : "en";
}

const rtl = new Set<Locale>(["he"]);

export function isRtl() {
  return rtl.has(locale());
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = catalogs[locale()][key] ?? catalogs.en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}
