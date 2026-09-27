/**
 * server/src/room.ts — Authoritative oda: HER BAĞLANTIYA ÖZEL dünya + botlar.
 *
 * Oyun mantığının TAMAMI oyunun kendi logic/ klasöründen gelir
 * (../../src/logic) — server ayrı fizik YAZMAZ, tek kaynak korunur.
 * Tick: TICK_HZ (20Hz). Skor client'tan ASLA alınmaz (sadece input).
 *
 * NOT: çok-kişililik (aynı odada N insan) bu iskelette YOK — her socket
 * kendi odasını alır. Aynı-oda multiplayer bir sonraki adımdır (README).
 */
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { createGameState, stepState } from '../../src/logic/GameState.ts';
import type { GameState } from '../../src/logic/GameState.ts';
import { userSplit } from '../../src/logic/Player.ts';
import { firePellets } from '../../src/logic/Pellets.ts';
import { visualTheme } from '../../src/theme/visualTheme.ts';
import type { ClientMsg, ServerMsg } from './protocol.ts';
import { getDb } from './db/client.ts';
import { runs, players } from './db/schema.ts';
import { recordScore } from './leaderboard.ts';

interface RemotePlayer {
  id: string;
  socket: WebSocket;
  target: { x: number; y: number } | null;
  dead: boolean;
  deathSent: boolean;
}

interface RemotePlayer {
  id: string;
  socket: WebSocket;
  target: { x: number; y: number } | null;
  dead: boolean;
  deathSent: boolean;
}

export class Room {
  readonly id = randomUUID();
  readonly state: GameState;
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly tickMs: number;
  private timer: NodeJS.Timeout | null = null;
  private elapsed = 0;

  constructor(tickHz = 20) {
    this.state = createGameState();
    this.tickMs = Math.round(1000 / tickHz);
  }

  /** Yeni bağlantı → bu odadaki insan oyuncu (state.player). */
  join(socket: WebSocket, name: string): string {
    const id = randomUUID();
    this.state.player.id = id;
    this.state.player.name = name.slice(0, 24) || 'YOU';
    this.remotes.set(id, { id, socket, target: null, dead: false, deathSent: false });
    this.send(id, { t: 'welcome', id, team: this.state.player.team });
    return id;
  }

  leave(id: string): void {
    this.remotes.delete(id);
  }

  onMessage(id: string, msg: ClientMsg): void {
    const rp = this.remotes.get(id);
    if (!rp || this.state.playerDead) return;
    const p = this.state.player;
    if (msg.t === 'input') {
      rp.target = { x: msg.x, y: msg.y };
    } else if (msg.t === 'split') {
      const dx = (rp.target?.x ?? p.x) - p.x;
      const dy = (rp.target?.y ?? p.y) - p.y;
      userSplit(p, this.state.timeSec, Math.atan2(dy, dx));
    } else if (msg.t === 'eject') {
      const dx = (rp.target?.x ?? p.x) - p.x;
      const dy = (rp.target?.y ?? p.y) - p.y;
      const made = firePellets(p, Math.atan2(dy, dx), visualTheme.color.playerFill);
      for (const pellet of made) this.state.pellets.push(pellet);
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get empty(): boolean {
    return this.remotes.size === 0;
  }

  private tick(): void {
    const dt = this.tickMs / 1000;
    this.elapsed += dt;
    // Oda tek insanlı: ilk remote'un hedefi state.player'a uygulanır
    const first = this.remotes.values().next().value as RemotePlayer | undefined;
    stepState(this.state, first?.target ?? null, dt);

    // Ölüm → DB + leaderboard (best-effort), client'a death mesajı
    if (this.state.playerDead && this.state.death) {
      for (const [id, rp] of this.remotes) {
        if (!rp.deathSent) {
          rp.deathSent = true;
          const d = this.state.death;
          this.send(id, {
            t: 'death',
            score: d.score,
            bestMass: Math.round(d.bestMass),
            survivedSec: Math.round(d.survivedSec),
            killer: d.killer,
            killerSkin: d.killerSkin,
          });
          void this.persistRun(rp, d.score, d.bestMass, d.survivedSec);
        }
      }
    }

    this.broadcast();
  }

  private async persistRun(
    rp: RemotePlayer,
    score: number,
    bestMass: number,
    survivedSec: number,
  ): Promise<void> {
    const db = getDb();
    const p = this.state.player;
    if (db) {
      try {
        await db.insert(players).values({ id: rp.id, name: p.name }).onConflictDoNothing();
        await db.insert(runs).values({
          playerId: rp.id,
          name: p.name,
          score,
          mass: Math.round(bestMass),
          survivedSec,
          mode: 'ffa',
        });
      } catch (err) {
        console.error('[db] run kaydı başarısız:', (err as Error).message);
      }
    }
    await recordScore(p.name, score);
  }

  private broadcast(): void {
    const s = this.state;
    // Yem bandı: 4000 yemin tamamı her tick GÖNDERİLMEZ — oyuncuya yakın
    // 600 tanesi (istemci culling'i tamamlar). Bant ≈ 600×~20B = 12KB/tick.
    const px = s.player.x;
    const py = s.player.y;
    const foods = s.foods
      .map((f, i) => ({ f, d: (f.x - px) * (f.x - px) + (f.y - py) * (f.y - py), i }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 600)
      .map(({ f }) => ({
        x: Math.round(f.x),
        y: Math.round(f.y),
        hue: visualTheme.color.food.hueOf(f.seed),
      }));
    const msg: ServerMsg = {
      t: 'snap',
      time: s.timeSec,
      you: {
        cells: s.player.cells.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.radius) })),
        score: s.player.score,
        mass: Math.round(s.player.mass),
        dead: s.playerDead,
      },
      players: s.bots.map((b) => ({
        id: b.id,
        name: b.name,
        cells: b.cells.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.radius) })),
        score: b.score,
        mass: Math.round(b.mass),
      })),
      foods,
      viruses: s.viruses.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), r: Math.round(v.radius) })),
      board: [...s.bots.map((b) => ({ name: b.name, mass: b.mass })), { name: s.player.name, mass: s.player.mass }]
        .sort((a, b) => b.mass - a.mass)
        .slice(0, 10)
        .map((e) => ({ name: e.name, mass: Math.round(e.mass) })),
    };
    const json = JSON.stringify(msg);
    for (const rp of this.remotes.values()) {
      if (rp.socket.readyState === rp.socket.OPEN) rp.socket.send(json);
    }
  }

  private send(id: string, msg: ServerMsg): void {
    const rp = this.remotes.get(id);
    if (rp && rp.socket.readyState === rp.socket.OPEN) {
      rp.socket.send(JSON.stringify(msg));
    }
  }
}
