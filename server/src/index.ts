/**
 * server/src/index.ts — WS giriş kapısı. Her bağlantıya özel Room (1 insan + botlar).
 * Railway/Fly.io'da KALICI process olarak çalışır — Vercel'DE DEĞİL.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './room.ts';
import type { ClientMsg } from './protocol.ts';

const PORT = Number(process.env.PORT ?? 8080);
const TICK_HZ = Number(process.env.TICK_HZ ?? 20);

const rooms = new Map<string, Room>();

const wss = new WebSocketServer({ port: PORT });
console.log(`[server] ws://0.0.0.0:${PORT} @${TICK_HZ}Hz`);

wss.on('connection', (socket: WebSocket) => {
  let room: Room | null = null;
  let id: string | null = null;

  const cleanup = () => {
    if (room && id) {
      room.leave(id);
      if (room.empty) {
        room.stop();
        rooms.delete(room.id);
      }
    }
    room = null;
    id = null;
  };

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as ClientMsg;
      if (msg.t === 'hello') {
        if (room) return;
        room = new Room(TICK_HZ);
        rooms.set(room.id, room);
        id = room.join(socket, msg.name);
        room.start();
        return;
      }
      if (room && id) room.onMessage(id, msg);
    } catch {
      socket.send(JSON.stringify({ t: 'error', message: 'bad-message' }));
    }
  });

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});
