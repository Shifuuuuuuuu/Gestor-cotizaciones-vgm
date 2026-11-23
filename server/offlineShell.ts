import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Plugin } from "vite";
export function offlineShell(): Plugin {
  return {
    name: "vgm-offline-shell",
    apply: "build",
    closeBundle() {
      const root = resolve("dist");
      const assets = [
        "/",
        "/index.html",
        "/vgm-icon.png",
        ...readdirSync(resolve(root, "assets")).map((f) => "/assets/" + f),
      ];
      const version = createHash("sha256")
        .update(readFileSync(resolve(root, "index.html")))
        .digest("hex")
        .slice(0, 16);
      const source = [
        "const CACHE=" + JSON.stringify("vgm-shell-" + version) + ";",
        "const ASSETS=" + JSON.stringify(assets) + ";",
        "self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));",
        "self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('vgm-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));",
        "self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(url.pathname))||fetch(req)));});",
      ].join("\n");
      writeFileSync(resolve(root, "sw.js"), source);
    },
  };
}
