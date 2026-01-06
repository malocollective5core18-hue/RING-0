// Multi-tab sync manager: BroadcastChannel primary, localStorage fallback
(function () {
  const CHANNEL_NAME = 'ring0-property-sync';
  let bc = null;
  const listeners = new Set();

  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (ev) => {
      try { listeners.forEach(fn => fn(ev.data)); } catch(e){}
    };
  } catch (err) {
    bc = null;
  }

  window.syncManager = {
    broadcast(msg) {
      const payload = Object.assign({ ts: Date.now() }, msg);
      if (bc) {
        try { bc.postMessage(payload); } catch (e) { /* ignore */ }
      }
      try {
        localStorage.setItem('ring0_sync_msg', JSON.stringify(payload));
        // keep a short lived key to trigger storage events
        setTimeout(() => localStorage.removeItem('ring0_sync_msg'), 200);
      } catch (e) {}
    },
    onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };

  window.addEventListener('storage', (ev) => {
    if (ev.key === 'ring0_sync_msg' && ev.newValue) {
      try { const data = JSON.parse(ev.newValue); listeners.forEach(fn => fn(data)); } catch(e){}
    }
  });
})();
