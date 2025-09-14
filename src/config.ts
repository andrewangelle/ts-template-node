import { createIdGenerator } from './utils.ts';

export const PORT = process.env.PORT ? Number(process.env.PORT) : 9009;
export const PING_INTERVAL_MS = 30_000; // send ping every 30s
export const ID_GEN = createIdGenerator('client-');
