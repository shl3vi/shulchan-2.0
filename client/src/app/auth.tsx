import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { redeemHostCode } from "@/game/api";
import { loadHost, saveHost } from "@/game/hostStore";

export default function AuthReturn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? params.code : "";

  useEffect(() => {
    if (!code) {
      router.replace("/");
      return;
    }
    void redeemHostCode(code)
      .then((host) => saveHost(host))
      .catch(async () => {
        if (await loadHost()) return;
      })
      // Sign-in started from "create table": land back on it already open.
      .finally(() => router.replace({ pathname: "/", params: { create: "1" } }));
  }, [code, router]);

  return null;
}
