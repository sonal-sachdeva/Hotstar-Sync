import { JioHotstarAdapter } from "@/src/adapter/JioHotstarAdapter";


export default defineContentScript({
  matches: ['*://*.hotstar.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[Hotstar Sync] content script loaded on', location.href);
    const adapter = new JioHotstarAdapter();
    const panel = document.createElement('div');

    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '16px',
      right : '16px',
      zindex: '2147483647',
      minWidth : '210px',
      padding: '10px 12px',
      background: 'rgba(14,18,27,.92)',
      color: '#e7eef6',
      font: '500 12px/1.55 ui-monospace, monospace',
      borderRadius: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      pointerEvents: 'none',
      whiteSpace: 'pre',
  });
  document.body.appendChild(panel);

  const fmt = (s:number) => Number.isFinite(s) ? new Date(s * 1000).toISOString().slice(11, 19) : '--:--:--';
  const PLAYBACK = ['play', 'pause', 'seeking', 'seeked', 'ratechange'] as const;
  function render(){
    const st = adapter.getState();
    const id = adapter.getMediaIdentity();
    panel.textContent = st
      ? `Hotstar Sync\n${st.playing ? '▶ playing' : '⏸ paused'}   ${st.rate}x\n` +
          `${fmt(st.currentTime)} / ${fmt(st.duration)}\n` +
          `show     ${id.showId ?? '—'}\ncontent  ${id.contentId ?? '—'}`
        : 'Hotstar Sync\nno <video> yet…';
  }
  PLAYBACK.forEach((e) => adapter.on(e, render));
  const timer = window.setInterval(render, 500);
  render();

  window.addEventListener('pagehide', () => {
    window.clearInterval(timer);
    adapter.destroy();
  });
}
});
