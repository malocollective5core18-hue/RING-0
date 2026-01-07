// Initialize Supabase client with real-time support
(function () {
  console.log('Loading Supabase client...');
  
  if (!window.config || !window.config.supabase) {
    console.error('Supabase config missing. Load config.js first.');
    return;
  }

  // Wait a moment to ensure supabase library is loaded
  setTimeout(() => {
    if (typeof supabase === 'undefined') {
      console.error('❌ Supabase library not loaded. Check that the CDN script is in the head before this file.');
      return;
    }

    console.log('Supabase library found, version:', supabase?.SUPABASE_JS_VERSION || 'unknown');

    try {
      window.supabaseClient = supabase.createClient(
        window.config.supabase.url,
        window.config.supabase.anon_key,
        {
          realtime: {
            params: {
              eventsPerSecond: 10
            }
          },
          auth: {
            persistSession: true,
            autoRefreshToken: true
          }
        }
      );
      
      console.log('✅ Supabase client initialized successfully');
      
      // Test the connection
      testConnection();
      
    } catch (err) {
      console.error('❌ Error initializing Supabase client', err);
      window.supabaseClient = null;
    }

    // Enhanced DB helpers
    window.supabaseHelper = {
      async fetchPosts() {
        if (!window.supabaseClient) {
          console.warn('No Supabase client available');
          return { data: [], error: new Error('No Supabase client') };
        }
        
        try {
          const { data, error } = await window.supabaseClient
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          return { data, error: null };
        } catch (error) {
          console.error('Error fetching posts:', error);
          return { data: [], error };
        }
      },
      
      async insertPost(payload) {
        if (!window.supabaseClient) {
          return { data: null, error: new Error('No Supabase client') };
        }
        
        try {
          const { data, error } = await window.supabaseClient
            .from('posts')
            .insert([payload])
            .select();
          
          if (error) throw error;
          return { data, error: null };
        } catch (error) {
          console.error('Error inserting post:', error);
          return { data: null, error };
        }
      },
      
      async deletePost(id) {
        if (!window.supabaseClient) {
          return { error: new Error('No Supabase client') };
        }
        
        try {
          const { error } = await window.supabaseClient
            .from('posts')
            .delete()
            .eq('id', id);
          
          if (error) throw error;
          return { error: null };
        } catch (error) {
          console.error('Error deleting post:', error);
          return { error };
        }
      },
      
      async updatePost(id, updates) {
        if (!window.supabaseClient) {
          return { error: new Error('No Supabase client') };
        }
        
        try {
          const { data, error } = await window.supabaseClient
            .from('posts')
            .update(updates)
            .eq('id', id)
            .select();
          
          if (error) throw error;
          return { data, error: null };
        } catch (error) {
          console.error('Error updating post:', error);
          return { data: null, error };
        }
      }
    };
    
  }, 100); // Small delay to ensure scripts are loaded

  async function testConnection() {
    if (!window.supabaseClient) return;
    
    try {
      // Test a simple query
      const { data, error } = await window.supabaseClient
        .from('posts')
        .select('count')
        .limit(1)
        .single();
      
      if (error) {
        console.warn('Supabase connection test failed:', error.message);
      } else {
        console.log('✅ Supabase connection successful');
        
        // Test if real-time is available
        if (typeof window.supabaseClient.channel === 'function') {
          console.log('✅ Real-time capabilities available');
        } else {
          console.warn('⚠️ Real-time methods not available - check Supabase version');
        }
      }
    } catch (err) {
      console.warn('Supabase connection test error:', err.message);
    }
  }
})();