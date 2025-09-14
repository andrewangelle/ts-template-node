import type { WebSocket } from 'ws';

export interface WSMessage<Payload = unknown> {
  action: string;
  payload?: Payload;
  // optional: target client id for private messages
  to?: string;
}

export interface Client {
  id: string;
  socket: WebSocket;
  isAlive: boolean;
}
