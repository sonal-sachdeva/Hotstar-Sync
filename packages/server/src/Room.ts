import { Participant, RoomState, ServerMessage, ClientCommand } from "@hotstar-sync/protocol";

const DEFAULT_ROOM = (): RoomState => ({
  playing: false,
  positionAtEpoch: 0,
  anchorServerTime: Date.now(),
  rate: 1,
  revision: 0,
});

// ---- limits ----
const MAX_NAME = 40;
const MAX_POSITION = 24 * 3600;     // 24h in seconds: a sane playback bound
const RATE_CAP = 30;                // burst capacity per socket
const RATE_REFILL_PER_SEC = 5;      // sustained messages/sec per socket

// ---- validation: turn untrusted JSON into a known-good ClientCommand, or null ----
function parseCommand(raw: string): ClientCommand | null {
  let m: any;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m.type !== 'string') return null;

  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const validPos = (v: unknown) => num(v) && v >= 0 && v <= MAX_POSITION;

  switch (m.type) {
    case 'hello': {
      if (typeof m.name !== 'string') return null;
      const name = m.name.slice(0, MAX_NAME).replace(/[\x00-\x1f]/g, '').trim() || 'guest';
      return { type: 'hello', name };
    }
    case 'ping':
      return num(m.t0) ? { type: 'ping', t0: m.t0 } : null;
    case 'play':
    case 'pause':
    case 'seek':
      return validPos(m.position) ? ({ type: m.type, position: m.position } as ClientCommand) : null;
    default:
      return null;
  }
}

export class Room {
  private room: RoomState = DEFAULT_ROOM();
  private buckets = new Map<WebSocket, { tokens: number; last: number }>();

  constructor(private state: DurableObjectState, private env: unknown) {
    this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<RoomState>('room')) ?? DEFAULT_ROOM();
    });
  }

  // ---- structured logging (captured by `wrangler tail`) ----
  private log(event: string, data: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ ts: Date.now(), room: this.state.id.toString().slice(0, 12), event, ...data }));
  }

  // ---- per-socket token-bucket rate limiter ----
  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    let b = this.buckets.get(ws);
    if (!b) { b = { tokens: RATE_CAP, last: now }; this.buckets.set(ws, b); }
    b.tokens = Math.min(RATE_CAP, b.tokens + ((now - b.last) / 1000) * RATE_REFILL_PER_SEC);
    b.last = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);
    const me: Participant = { id: crypto.randomUUID().slice(0, 6), name: 'guest' };
    server.serializeAttachment(me);
    this.log('join', { id: me.id, size: this.state.getWebSockets().length });
    this.send(server, { type: 'state', state: this.room });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (!this.allow(ws)) { this.log('rate_limited'); return; }
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const cmd = parseCommand(raw);
    if (!cmd) { this.log('invalid_message'); return; }

    if (cmd.type === 'ping') {
      this.send(ws, { type: 'pong', t0: cmd.t0, serverTime: Date.now() });
      return;
    }
    if (cmd.type === 'hello') {
      const me = ws.deserializeAttachment() as Participant;
      me.name = cmd.name;
      ws.serializeAttachment(me);
      this.broadcastPresence();
      return;
    }

    if (cmd.type === 'play') { this.room.playing = true; this.room.positionAtEpoch = cmd.position; }
    else if (cmd.type === 'pause') { this.room.playing = false; this.room.positionAtEpoch = cmd.position; }
    else if (cmd.type === 'seek') { this.room.positionAtEpoch = cmd.position; }

    this.room.anchorServerTime = Date.now();
    this.room.revision++;
    await this.state.storage.put('room', this.room);
    this.log('command', { type: cmd.type, revision: this.room.revision, playing: this.room.playing });
    this.broadcastState();
  }

  async webSocketClose(ws: WebSocket) {
    this.buckets.delete(ws);
    this.log('leave', { size: Math.max(0, this.state.getWebSockets().length - 1) });
    this.broadcastPresence(ws);
  }

  private broadcastState() {
    const msg: ServerMessage = { type: 'state', state: this.room };
    for (const s of this.state.getWebSockets()) this.send(s, msg);
  }

  private participants(exclude?: WebSocket): Participant[] {
    return this.state.getWebSockets().filter((s) => s !== exclude).map((s) => s.deserializeAttachment() as Participant);
  }

  private broadcastPresence(exclude?: WebSocket) {
    const msg: ServerMessage = { type: 'presence', participants: this.participants(exclude) };
    for (const s of this.state.getWebSockets()) { if (s !== exclude) this.send(s, msg); }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    ws.send(JSON.stringify(msg));
  }
}
