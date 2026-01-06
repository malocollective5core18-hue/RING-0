// Realtime subscription manager for posts
(function () {
  const POLL_FALLBACK_SECONDS = 5;
  let channel = null;
  let polling = null;

  async function subscribePosts({ onInsert, onDelete } = {}) {
    if (!window.supabaseClient) {
      console.warn('No supabase client available; starting polling fallback');
      startPolling(onInsert);
      return;
    }

    try {
      channel = window.supabaseClient
        .channel('posts-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
          if (typeof onInsert === 'function') onInsert(payload.new);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (payload) => {
          if (typeof onDelete === 'function') onDelete(payload.old);
        })
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscribe failed, using polling fallback', err);
      startPolling(onInsert);
    }
  }

  function startPolling(onInsert) {
    if (polling) return;
    polling = setInterval(async () => {
      try {
        const res = await window.supabaseHelper.fetchPosts();
        if (res.error) return;
        if (typeof onInsert === 'function') onInsert(null, res.data);
      } catch (err) {
        console.debug('Polling error', err);
      }
    }, POLL_FALLBACK_SECONDS * 1000);
  }

  function stopPolling() {
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
  }

  window.realtime = { subscribePosts, stopPolling };
})();
