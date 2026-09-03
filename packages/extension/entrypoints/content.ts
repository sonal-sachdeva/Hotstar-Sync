export default defineContentScript({
  matches: ['*://*.hotstar.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[Hotstar Sync] content script loaded on', location.href);
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      position: 'fixed',
      bottom: '16px',
      right : '16px',
      zindex: '2147483647',
      padding: '8px 12px',
      background: '#0e7c86',
      color: '#ffffff',
      font: '600 12px system-ui, sans-serif',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,.3)',
      pointerEvents: 'none'
  });
  document.body.appendChild(badge);
  },
});
