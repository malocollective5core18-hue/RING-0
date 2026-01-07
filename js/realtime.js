




// Real-time subscription manager for posts
(function () {
  const POLL_FALLBACK_SECONDS = 30;
  let channel = null;
  let polling = null;
  let subscriptionActive = false;

  async function subscribePosts({ onInsert, onUpdate, onDelete } = {}) {
    if (!window.supabaseClient) {
      console.warn('No Supabase client available; starting polling fallback');
      startPolling(onInsert);
      return;
    }

    // Check if real-time methods are available
    if (typeof window.supabaseClient.channel !== 'function') {
      console.warn('Real-time methods not available in Supabase client; using polling');
      startPolling(onInsert);
      return;
    }

    try {
      console.log('Setting up real-time subscription...');
      
      // Clean up any existing subscription
      if (channel) {
        try {
          await window.supabaseClient.removeChannel(channel);
        } catch (e) {
          console.debug('Error removing old channel:', e);
        }
        channel = null;
      }

      // Create new channel with v2 syntax
      channel = window.supabaseClient.channel('posts-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'posts'
          },
          (payload) => {
            console.log('Real-time INSERT received:', payload);
            if (typeof onInsert === 'function') onInsert(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'posts'
          },
          (payload) => {
            console.log('Real-time UPDATE received:', payload);
            if (typeof onUpdate === 'function') onUpdate(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'posts'
          },
          (payload) => {
            console.log('Real-time DELETE received:', payload);
            if (typeof onDelete === 'function') onDelete(payload.old);
          }
        )
        .subscribe((status) => {
          console.log('Real-time subscription status:', status);
          
          if (status === 'SUBSCRIBED') {
            subscriptionActive = true;
            console.log('✅ Real-time subscription active');
            stopPolling();
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('Realtime subscription closed, falling back to polling');
            subscriptionActive = false;
            startPolling(onInsert);
          }
        });

      // Handle subscription errors
      if (channel) {
        channel.on('error', (error) => {
          console.warn('Realtime channel error:', error);
          subscriptionActive = false;
          startPolling(onInsert);
        });
        
        channel.on('close', () => {
          console.log('Realtime channel closed');
          subscriptionActive = false;
          startPolling(onInsert);
        });
      }

    } catch (err) {
      console.warn('Realtime subscribe failed, using polling fallback', err);
      startPolling(onInsert);
    }
  }

  function startPolling(onInsert) {
    if (polling) return;
    
    console.log(`Starting polling every ${POLL_FALLBACK_SECONDS} seconds...`);
    
    polling = setInterval(async () => {
      if (subscriptionActive) {
        stopPolling();
        return;
      }
      
      try {
        const res = await window.supabaseHelper.fetchPosts();
        if (res.error) return;
        
        if (typeof onInsert === 'function') {
          // Pass all data for polling (could be multiple changes)
          onInsert(null, res.data);
        }
      } catch (err) {
        console.debug('Polling error', err);
      }
    }, POLL_FALLBACK_SECONDS * 1000);
  }

  function stopPolling() {
    if (polling) {
      clearInterval(polling);
      polling = null;
      console.log('Polling stopped');
    }
  }

  function unsubscribe() {
    if (channel && window.supabaseClient) {
      try {
        window.supabaseClient.removeChannel(channel);
      } catch (e) {
        console.debug('Error unsubscribing:', e);
      }
      channel = null;
    }
    stopPolling();
    subscriptionActive = false;
    console.log('Unsubscribed from real-time');
  }

  window.realtime = { 
    subscribePosts, 
    stopPolling, 
    unsubscribe,
    isActive: () => subscriptionActive
  };
})();