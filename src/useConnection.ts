import { useEffect, useState } from "react";
export function useConnection() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let stopped = false,
      pending = false;
    let controller: AbortController | null = null;
    async function check() {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 5000);
      try {
        const response = await fetch("/api/config", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!stopped)
          setConnected(
            response.ok && ["local", "firebase"].includes(data.mode),
          );
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    }
    const changed = (event: Event) => {
      if (!stopped) setConnected((event as CustomEvent<boolean>).detail);
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const timer = setInterval(check, 20000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    window.addEventListener("vgm-connection", changed);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      window.removeEventListener("vgm-connection", changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return connected;
}
