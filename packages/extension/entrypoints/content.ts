import { JioHotstarAdapter } from "@/src/adapter/JioHotstarAdapter";
import { ConnectionManager } from "@/src/net/ConnectionManager";
import { decideCorrection } from "@/src/sync/SyncEngine";
import type { Participant, RoomState } from "@hotstar-sync/protocol";

const SERVER = 'ws://localhost:8787';
const ROOM = 'test';

export default defineContentScript({
  matches: ['*://*.hotstar.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[Hotstar Sync] content script loaded on', location.href);
    const adapter = new JioHotstarAdapter();
    let roomState: RoomState | null = null;
    let participants: Participant[] = [];
    let connected = false;

    // How many upcoming play/pause/seek events WE caused (a correction), so we
    // don't echo them back to the server as if the user did them.
    const echo = { play: 0, pause: 0, seek: 0 };

    const conn = new ConnectionManager(`${SERVER}/rooms/${ROOM}/ws`, {
      onMessage: (msg) => {
        if (msg.type === 'state') { roomState = msg.state; onRoomState(); }
        else if (msg.type === 'presence') participants = msg.participants;
        render();
      },
      onStatus: (open) => { connected = open; render(); }
    });
    conn.connect();
    conn.send({ type: 'hello', name: 'me' });

    function drive(kind: 'play' | 'pause' | 'seek', fn: () => void) {
      echo[kind]++;      // expect one matching event that we should NOT re-broadcast
      fn();
    }

    // On an incoming STATE MESSAGE: match play/pause and realign position.
    function onRoomState() {
      const rs = roomState;
      if (!rs) return;
      const st = adapter.getState();
      if (!st) return;
      if (rs.playing && !st.playing) drive('play', () => adapter.play());
      else if (!rs.playing && st.playing) drive('pause', () => adapter.pause());
      const c = decideCorrection(rs, st.currentTime, Date.now());
      if (c.kind === 'seek') drive('seek', () => adapter.seek(c.time));
    }

    // On the HEARTBEAT: only correct drift, and ONLY while BOTH are playing.
    // Rate nudges are invisible and deliberately do NOT block the user's own actions.
    function driftCheck() {
      const rs = roomState;
      if (!rs || !rs.playing) return;
      const st = adapter.getState();
      if (!st || !st.playing) return;
      const c = decideCorrection(rs, st.currentTime, Date.now());
      if (c.kind === 'seek') drive('seek', () => adapter.seek(c.time));
      else if (c.kind === 'nudge') adapter.setRate(c.rate);
      else if (st.rate !== rs.rate) adapter.setRate(rs.rate);
    }

    // The user's OWN action becomes a command -- unless it was our own correction.
    function sendLocal(type: 'play' | 'pause' | 'seek') {
      if (echo[type] > 0) { echo[type]--; return; }
      const st = adapter.getState();
      if (!st) return;
      conn.send({ type, position: st.currentTime });
      if (roomState) {
        if (type === 'play') roomState.playing = true;
        else if (type === 'pause') roomState.playing = false;
        roomState.positionAtEpoch = st.currentTime;
        roomState.anchorServerTime = Date.now();
      }
    }
    adapter.on('play', () => sendLocal('play'));
    adapter.on('pause', () => sendLocal('pause'));
    adapter.on('seeked', () => sendLocal('seek'));

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647',
      minWidth: '230px', padding: '10px 12px',
      background: 'rgba(14,18,27,.92)', color: '#e7eef6',
      font: '500 12px/1.55 ui-monospace, monospace',
      borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      pointerEvents: 'none', whiteSpace: 'pre',
    });
    document.body.appendChild(panel);

    const fmt = (s: number) => Number.isFinite(s) ? new Date(s * 1000).toISOString().slice(11, 19) : '--:--:--';
    const PLAYBACK = ['play', 'pause', 'seeking', 'seeked', 'ratechange'] as const;
    function render() {
      const st = adapter.getState();
      panel.textContent =
        `Hotstar Sync\n` +
        `${connected ? '● connected' : '○ connecting…'} · ${participants.length} here\n` +
        (roomState ? `room ${roomState.playing ? '▶' : '⏸'} ${fmt(roomState.positionAtEpoch)}  rev ${roomState.revision}\n` : `room —\n`) +
        (st ? `me   ${st.playing ? '▶' : '⏸'} ${fmt(st.currentTime)}` : `me   no <video>`);
    }
    PLAYBACK.forEach((e) => adapter.on(e, render));
    const timer = window.setInterval(() => { driftCheck(); render(); }, 1000);
    render();

    window.addEventListener('pagehide', () => {
      window.clearInterval(timer);
      conn.close();
      adapter.destroy();
    });
  }
});
