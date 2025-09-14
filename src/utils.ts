import { WebSocket } from 'ws';
import type { Client, WSMessage } from './types.ts';

/** Broadcast a message to all connected clients (optionally excluding one id) */
export function broadcast<Payload>(
  clients: Map<string, Client>,
  msg: WSMessage<Payload>,
  excludeId?: string,
) {
  const raw = JSON.stringify(msg);
  for (const [id, client] of clients.entries()) {
    if (id === excludeId) continue;
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(raw);
    }
  }
}

/** Send a message to specific client id */
export function sendTo<Payload>(
  clients: Map<string, Client>,
  toId: string,
  msg: WSMessage<Payload>,
) {
  const client = clients.get(toId);

  if (!client) return false;

  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

/** Cleanly remove a client */
export function removeClient(clients: Map<string, Client>, id: string) {
  const client = clients.get(id);
  if (!client) return;
  try {
    client.socket.terminate();
  } catch {
    // ignore
  }
  clients.delete(id);
  console.log(`client ${id} removed. total clients: ${clients.size}`);
}

/** Handle incoming JSON messages safely */
export function safeParse<Payload>(data: WebSocket.Data): Payload | null {
  try {
    if (typeof data === 'string') return JSON.parse(data) as Payload;
    if (data instanceof Buffer || Array.isArray(data))
      return JSON.parse(data.toString()) as Payload;
    // unsupported data type (ArrayBuffer, etc.)
    return null;
  } catch (_err) {
    return null;
  }
}

export function createIdGenerator(prefix = 'c') {
  let n = 0;
  return () => `${prefix}${++n}`;
}
