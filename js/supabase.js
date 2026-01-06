// Initialize Supabase client and provide minimal helpers
(function () {
  if (!window.config || !window.config.supabase) {
    console.error('Supabase config missing. Load config.js first.');
    return;
  }

  if (typeof supabase === 'undefined') {
    console.warn('Supabase library not found. Ensure CDN script is loaded in head.');
  }

  try {
    window.supabaseClient = (typeof supabase !== 'undefined')
      ? supabase.createClient(window.config.supabase.url, window.config.supabase.anon_key)
      : null;
  } catch (err) {
    console.error('Error initializing Supabase client', err);
    window.supabaseClient = null;
  }

  // Minimal DB helpers
  window.supabaseHelper = {
    async fetchPosts() {
      if (!window.supabaseClient) return { data: [], error: new Error('no client') };
      return await window.supabaseClient.from('posts').select('*').order('created_at', { ascending: false });
    },
    async insertPost(payload) {
      if (!window.supabaseClient) return { data: null, error: new Error('no client') };
      return await window.supabaseClient.from('posts').insert([payload]);
    },
    async deletePost(id) {
      if (!window.supabaseClient) return { error: new Error('no client') };
      return await window.supabaseClient.from('posts').delete().eq('id', id);
    }
  };
})();
