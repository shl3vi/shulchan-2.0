import AsyncStorage from "@react-native-async-storage/async-storage";

/** Change this when the terms change in a way players must accept again. */
export const TERMS_VERSION = "2026-11-16-2";
const KEY = "shulchan.terms";

export async function hasAcceptedTerms() {
  try {
    return (await AsyncStorage.getItem(KEY)) === TERMS_VERSION;
  } catch {
    return false;
  }
}

export async function acceptTerms() {
  try {
    await AsyncStorage.setItem(KEY, TERMS_VERSION);
  } catch {
    // The player continues; the next launch asks again.
  }
}
