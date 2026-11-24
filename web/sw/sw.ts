/// <reference lib="webworker" />
// Service worker = backend statické verze. Obsluhuje všechna volání na api/* nad IndexedDB.
import { handle } from "./handlers";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const scope = new URL(self.registration.scope);

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname + "api/")) return;
  const path = url.pathname.slice(scope.pathname.length + 4);
  e.respondWith(handle(e.request, path));
});
