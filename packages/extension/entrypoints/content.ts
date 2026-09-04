import { JioHotstarAdapter } from "@/src/adapter/JioHotstarAdapter";
import { ConnectionManager } from "@/src/net/ConnectionManager";
import { decideCorrection, estimateOffset } from "@/src/sync/SyncEngine";
import type { Participant, RoomState } from "@hotstar-sync/protocol";

const SERVER = 'ws://localhost:8787';

export default defineContentScript({
  matches: ['*://*.hotstar.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[Hotstar Sync] content script loaded on', location.href);
    const adapter = new JioHotstarAdapter();

    let conn: ConnectionManager | null = null;
    let roomCode: string | null = null;
    let roomState: RoomState | null = null;
    let participants: Participant[] = [];
    let connected = false;
    const echo = { play: 0, pause: 0, seek: 0 };
    let clockOffset = 0;        // serverClock - clientClock, in ms
    let bestRtt = Infinity;     // keep the offset from the fastest round-trip
    const serverNow = () => Date.now() + clockOffset;
    const ping = () => conn?.send({ type: 'ping', t0: Date.now() });

    // ---- room from the URL hash (#hsync=CODE) ----
    const roomFromHash = () => location.hash.match(/hsync=([a-z0-9]+)/i)?.[1] ?? null;

    function joinRoom(code: string) {
      if (conn) conn.close();
      roomCode = code;
      connected = false;
      conn = new ConnectionManager(`${SERVER}/rooms/${code}/ws`, {
        onMessage: (msg) => {
          if (msg.type === 'state') { roomState = msg.state; onRoomState(); }
          else if (msg.type === 'presence') participants = msg.participants;
          else if (msg.type === 'pong') {
            const rtt = Date.now() - msg.t0;
            if (rtt < bestRtt) { bestRtt = rtt; clockOffset = estimateOffset(msg.t0, msg.serverTime, Date.now()); }
          }
          render();
        },
        onStatus: (open) => {
          connected = open;
          if (open) { bestRtt = Infinity; for (let i = 0; i < 4; i++) setTimeout(ping, i * 250); }
          render();
        },
      });
      conn.connect();
      conn.send({ type: 'hello', name: 'me' });
      render();
    }

    function startParty() {
      const code = Math.random().toString(36).slice(2, 8);
      location.hash = 'hsync=' + code;   // the current URL is now the invite link
      joinRoom(code);
      // seed the new room with our current playback so we aren't dragged to 0:00
      const st = adapter.getState();
      if (st && conn) conn.send({ type: st.playing ? 'play' : 'pause', position: st.currentTime });
    }

    // ---- sync core ----
    function drive(kind: 'play' | 'pause' | 'seek', fn: () => void) { echo[kind]++; fn(); }

    function onRoomState() {
      const rs = roomState;
      if (!rs || rs.revision === 0) return;   // ignore a fresh, untouched room
      const st = adapter.getState();
      if (!st) return;
      if (rs.playing && !st.playing) drive('play', () => adapter.play());
      else if (!rs.playing && st.playing) drive('pause', () => adapter.pause());
      const c = decideCorrection(rs, st.currentTime, serverNow());
      if (c.kind === 'seek') drive('seek', () => adapter.seek(c.time));
    }

    function driftCheck() {
      const rs = roomState;
      if (!rs || !rs.playing) return;
      const st = adapter.getState();
      if (!st || !st.playing) return;
      const c = decideCorrection(rs, st.currentTime, serverNow());
      if (c.kind === 'seek') drive('seek', () => adapter.seek(c.time));
      else if (c.kind === 'nudge') adapter.setRate(c.rate);
      else if (st.rate !== rs.rate) adapter.setRate(rs.rate);
    }

    function sendLocal(type: 'play' | 'pause' | 'seek') {
      if (!conn) return;
      if (echo[type] > 0) { echo[type]--; return; }
      const st = adapter.getState();
      if (!st) return;
      conn.send({ type, position: st.currentTime });
      if (roomState) {
        if (type === 'play') roomState.playing = true;
        else if (type === 'pause') roomState.playing = false;
        roomState.positionAtEpoch = st.currentTime;
        roomState.anchorServerTime = serverNow();
      }
    }
    adapter.on('play', () => sendLocal('play'));
    adapter.on('pause', () => sendLocal('pause'));
    adapter.on('seeked', () => sendLocal('seek'));

    // ---- overlay panel (interactive) ----
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647',
      minWidth: '240px', padding: '12px 14px', background: 'rgba(14,18,27,.94)',
      color: '#e7eef6', font: '500 12px/1.55 ui-monospace, monospace',
      borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,.45)', whiteSpace: 'pre',
    });
    document.body.appendChild(panel);

    const fmt = (s: number) => Number.isFinite(s) ? new Date(s * 1000).toISOString().slice(11, 19) : '--:--:--';

    function button(label: string, onClick: () => void) {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        marginTop: '8px', width: '100%', padding: '7px 10px', cursor: 'pointer',
        background: '#0e7c86', color: '#fff', border: 'none', borderRadius: '8px',
        font: '600 12px ui-monospace, monospace',
      });
      b.onclick = onClick;
      return b;
    }

    function render() {
      const st = adapter.getState();
      panel.textContent = '';
      const head = document.createElement('div');
      head.style.whiteSpace = 'pre';
      head.textContent = roomCode
        ? `Hotstar Sync\n${connected ? '● connected' : '○ connecting…'} · ${participants.length} here\n` +
          `room ${roomCode}  clk ${clockOffset >= 0 ? '+' : ''}${clockOffset}ms\n` +
          (roomState ? `${roomState.playing ? '▶' : '⏸'} ${fmt(roomState.positionAtEpoch)}  rev ${roomState.revision}\n` : '') +
          (st ? `me ${st.playing ? '▶' : '⏸'} ${fmt(st.currentTime)}` : 'me no <video>')
        : `Hotstar Sync\nNo party yet`;
      panel.appendChild(head);

      if (!roomCode) {
        panel.appendChild(button('▶ Start Watch Party', startParty));
      } else {
        panel.appendChild(button('⟳ Sync to room', () => onRoomState()));   // click = user gesture → play() allowed
        panel.appendChild(button('🔗 Copy invite link', async () => {
          try { await navigator.clipboard.writeText(location.href); } catch {}
        }));
      }
    }

    // ---- boot ----
    const existing = roomFromHash();
    if (existing) joinRoom(existing);
    window.addEventListener('hashchange', () => { const c = roomFromHash(); if (c && c !== roomCode) joinRoom(c); });

    const PLAYBACK = ['play', 'pause', 'seeking', 'seeked', 'ratechange'] as const;
    PLAYBACK.forEach((e) => adapter.on(e, render));
    const timer = window.setInterval(() => { driftCheck(); render(); }, 1000);
    const pingTimer = window.setInterval(ping, 15000);   // keep the clock estimate fresh
    render();

    window.addEventListener('pagehide', () => {
      window.clearInterval(timer);
      window.clearInterval(pingTimer);
      conn?.close();
      adapter.destroy();
    });
  }
});