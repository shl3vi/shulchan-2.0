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
      .finally(() => router.replace("/"));
  }, [code, router]);

  return null;
}
