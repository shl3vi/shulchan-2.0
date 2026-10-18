import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { saveHost } from "@/game/hostStore";

export default function AuthReturn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; email?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const email = typeof params.email === "string" ? params.email : "";

  useEffect(() => {
    if (!token || !email) {
      router.replace("/");
      return;
    }
    void saveHost({ token, email }).then(() => router.replace("/"));
  }, [email, router, token]);

  return null;
}
