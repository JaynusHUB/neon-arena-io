# NEON ARENA — Authoritative Server (iskelet, çalışır durumda)

Node.js + WebSocket, **20Hz authoritative tick**. Oyun mantığı oyunun kendi
`../src/logic/` klasöründen gelir — server ayrı fizik yazmaz.

## Çalıştırma

```bash
cd server
cp .env.example .env
docker compose up -d        # postgres + redis (opsiyonel — yoksa da oyun çalışır)
npm install
npm run dev                 # tsx watch → ws://localhost:8080
```

DB migrate: `npm run db:push` (drizzle-kit, `DATABASE_URL` gerekli).

## Mimari

- `src/index.ts` — WS kapısı. Her bağlantıya **özel oda** (1 insan + botlar).
- `src/room.ts` — 50ms tick: input uygula → `stepState` → snapshot yayınla.
  Ölümde `runs` tablosuna yazar + Redis leaderboard'a işler (ikisi de
  best-effort: DB/Redis yoksa oyun durmaz).
- `src/protocol.ts` — mesaj sözleşmesi. Client SADECE input gönderir
  (`hello/input/split/eject`); skor server state'inden hesaplanır.
- `src/db/schema.ts` — `players` + `runs` (Drizzle).
- `src/leaderboard.ts` — Redis sorted-set: `neon:lb:all`, `:daily:`, `:weekly:`.
- Snapshot bandı: yemlerin tamamı değil, oyuncuya en yakın **600** tanesi
  gönderilir (~12KB/tick). İstemci culling'i tamamlar.

## Sıradaki adımlar (henüz YOK)

1. **İstemci bağlama:** `src/game/Game.ts` yerine `NetGame` adaptörü —
   `protocol.ts` snapshot'larını render eder, input'uWS'ye gönderir.
   Mevcut local `Game` aynen kalır (offline/test modu).
2. **Aynı-oda multiplayer:** oda başına N insan (şu an oda = 1 insan + botlar).
   `state.player` yerine `room.remotes` başına hücre sahipliği gerekir —
   `logic/` tarafında `stepState` imzasına dokunur, dikkatli refactor ister.
3. **Anti-cheat:** input rate-limit + hedef ışınlanma kontrolü.
4. **Deploy:** Railway/Fly.io (kalıcı process). Vercel'e DEĞİL.
