// Offline queue: persist operations and auto-sync on reconnect
(function () {
  const STORAGE_KEY = 'ring0_offline_queue_v1';
  let queue = [];

  function load() {
    try { queue = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { queue = []; }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); } catch (e) {}
  }

  function add(op) {
    op.ts = Date.now();
    queue.push(op);
    save();
    window.syncManager && window.syncManager.broadcast({ type: 'offline-queue-updated' });
  }

  async function processQueue() {
    if (!navigator.onLine) return;
    load();
    if (!queue.length) return;
    const copy = queue.slice();
    for (const item of copy) {
      try {
        if (item.type === 'insert') {
          await window.supabaseHelper.insertPost(item.data);
        } else if (item.type === 'delete') {
          await window.supabaseHelper.deletePost(item.id);
        }
        // remove on success
        queue = queue.filter(q => q.ts !== item.ts);
        save();
      } catch (e) {
        console.debug('Failed to sync queue item, will retry later', e);
      }
    }
  }

  window.addEventListener('online', () => { processQueue(); });

  load();

  window.offlineQueue = { add, processQueue, _raw: () => queue.slice() };
})();
