import http from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { createSocketServer } from './socket';
import { prisma } from './lib/prisma';
import { startDueDateJob } from './jobs/dueDates';

const app = createApp();
const server = http.createServer(app);
createSocketServer(server);
const job = startDueDateJob();

server.listen(env.PORT, () => {
  console.log(`TaskFlow API listening on port ${env.PORT} (${env.NODE_ENV})`);
  console.log(`Allowed CORS origins: ${env.corsOrigins.join(', ')}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  clearInterval(job);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
