/**
 * server/src/db/schema.ts — PostgreSQL şeması (Drizzle).
 * players: kalıcı oyuncu kimliği. runs: her ölümde bir satır (skor burada).
 */
import { pgTable, serial, text, integer, real, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const modeEnum = pgEnum('game_mode', ['ffa', 'teams']);

export const players = pgTable('players', {
  id: text('id').primaryKey(), // uuid (client bağlanırken üretir)
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  playerId: text('player_id')
    .notNull()
    .references(() => players.id),
  name: text('name').notNull(),
  score: integer('score').notNull(),
  mass: integer('mass').notNull(),
  survivedSec: real('survived_sec').notNull(),
  mode: modeEnum('mode').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
