/**
 * Vercel Function entry point.
 * The whole Express API and the Socket.IO server run in this single function.
 * vercel.json rewrites every path (including /socket.io WebSocket upgrades) to it, so routes keep
 * their normal paths (/api/..., /socket.io/...).
 *
 * Local development does not use this file — it runs src/index.ts (app.listen + background jobs).
 */
import http from 'node:http';
import { createApp } from '../src/app';
import { createSocketServer } from '../src/socket';

const app = createApp();
const server = http.createServer(app);
createSocketServer(server);

export default server;
