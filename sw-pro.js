/*
  声で野帳 Pro オフライン用（Service Worker）
  Copyright (c) 2026 tochigitfruits. All rights reserved.
  アプリ本体（pro.html）と、Excel出力・QRコードの部品、アイコン、文字（フォント）をこの端末に保存し、電波がなくても開けるようにします。
  入力したデータには触れません（データはアプリがブラウザ内に保存します）。外部へデータを送ることもありません。
  pro.html は保存しておいた版をすぐに出し、電波があれば裏で新しい版を確かめて入れ替えます（次に開いたときから新しい版）。
*/
const CACHE = "koe-pro-4.0";          // この名前を変えると、古い保存は消して取り直す
const PAGE = new URL("./pro.html", self.registration.scope.replace(/pro\.html$/, "")).href;
const CORE = [
  "./pro.html", "./manifest-pro.json",
  "./pro-favicon-32.png", "./pro-apple-touch-icon.png",
  "./pro-icon-192.png", "./pro-icon-512.png", "./pro-icon-maskable-192.png", "./pro-icon-maskable-512.png"
];
const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const base = self.registration.scope.replace(/pro\.html$/, "");
const abs = u => new URL(u, base).href;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(abs(u), { cache: "reload" })));
    /* 外部の部品は取れなくても入れ替えを止めない（次に使ったときに保存する） */
    await Promise.all(LIBS.map(async u => { try { const r = await fetch(u, { mode: "cors", credentials: "omit" }); if (r.ok) await c.put(u, r); } catch (_) {} }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("koe-pro-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const verOf = t => (String(t).match(/const APP_VER="([^"]+)"/) || [])[1] || "";

/* アプリ本体：保存した版をすぐに出し、裏で新しい版を確かめる */
async function page(req, ev) {
  const c = await caches.open(CACHE);
  const hit = await c.match(PAGE);
  const oldText = hit ? hit.clone().text() : Promise.resolve("");   /* 返す前に写しを取る（返した後は中身を読めない） */
  const net = (async () => {
    try {
      const r = await fetch(PAGE, { cache: "no-cache" });
      if (!r.ok) return null;
      const t = await r.clone().text();
      const old = await oldText;
      if (t !== old) {
        await c.put(PAGE, r.clone());
        if (hit) for (const cl of await self.clients.matchAll({ type: "window" })) cl.postMessage({ t: "update", ver: verOf(t) });
      }
      return r;
    } catch (_) { return null; }
  })();
  if (hit) { ev.waitUntil(net); return hit; }
  return (await net) || new Response("オフラインのため開けません。電波のある所で一度開いてください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/* 部品・アイコン・文字：保存があればそれを使い、なければ取って保存する */
async function asset(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: false });
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && (r.type === "basic" || r.type === "cors")) c.put(req, r.clone()).catch(() => {});
  return r;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (req.mode === "navigate") {
    if (u.origin === location.origin && u.pathname === new URL(PAGE).pathname) e.respondWith(page(req, e));
    return;
  }
  if (u.origin === location.origin) {
    if (CORE.some(p => abs(p) === u.origin + u.pathname)) e.respondWith(asset(req));
    return;
  }
  if (LIBS.includes(req.url) || FONT_HOSTS.includes(u.hostname)) e.respondWith(asset(req));
});

/* アプリからの問い合わせ：保存している本体の版 */
self.addEventListener("message", e => {
  if (e.data && e.data.t === "ver?") e.waitUntil((async () => {
    const hit = await (await caches.open(CACHE)).match(PAGE);
    e.source && e.source.postMessage({ t: "ver", ver: hit ? verOf(await hit.text()) : "", cache: CACHE });
  })());
});
