// App bootstrap: load posts, wire realtime, wire upload form minimally
(function () {
  // Wait for everything to be ready
  function waitForSupabase() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.supabaseHelper && window.supabaseClient) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  async function init() {
    console.log('App initializing...');
    
    // Wait for Supabase to be ready
    await waitForSupabase();
    console.log('Supabase is ready, proceeding with app initialization');

    // find a container to render posts
    const container = document.getElementById('adminImagesContainer') || 
                     document.querySelector('.admin-images-container') || 
                     document.getElementById('postsContainer');

    // initial load
    try {
      const res = await window.supabaseHelper.fetchPosts();
      if (!res.error && res.data && container) {
        window.UI && window.UI.renderPosts && window.UI.renderPosts(container, res.data);
      }
    } catch (e) { 
      console.warn('Failed to load posts', e); 
    }

    // realtime - check if realtime module exists
    if (window.realtime && typeof window.realtime.subscribePosts === 'function') {
      window.realtime.subscribePosts({
        onInsert: async (newPost, all) => {
          // if polling uses (all) param, re-render whole list
          if (Array.isArray(all)) {
            if (container && window.UI && window.UI.renderPosts) {
              window.UI.renderPosts(container, all);
            }
            return;
          }
          if (container && newPost && window.UI && window.UI.createPostElement) {
            const el = window.UI.createPostElement(newPost);
            container.insertBefore(el, container.firstChild);
          }
        },
        onDelete: (oldPost) => {
          if (!oldPost || !container) return;
          const imgs = Array.from(container.querySelectorAll('img'));
          const target = imgs.find(i => i.src && i.src.includes(oldPost.image_url || ''));
          if (target && target.parentElement) target.parentElement.remove();
        }
      });
    }

    // wire upload form if present (uses existing form IDs)
    const uploadInput = document.getElementById('imageUpload');
    const uploadBtn = document.getElementById('imageSubmitBtn');
    const createForm = document.getElementById('createImageForm');
    if (createForm && uploadInput && uploadBtn) {
      createForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const file = uploadInput.files && uploadInput.files[0];
        if (!file) return alert('Select a file');

        const title = (document.getElementById('imageTitle') || {}).value || file.name;
        const description = (document.getElementById('imageDescription') || {}).value || '';
        const category = (document.getElementById('imageCategory') || {}).value || '';
        const targetUrl = (document.getElementById('imageTargetUrl') || {}).value || '';

        try {
          // Check if cloudinaryUpload exists
          if (typeof window.cloudinaryUpload !== 'function') {
            throw new Error('Cloudinary upload function not available');
          }

          const result = await window.cloudinaryUpload(file, { 
            onProgress: (p) => {
              const bar = document.querySelector('.upload-progress-fill');
              if (bar) bar.style.width = p + '%';
            }
          });

          const imageUrl = result && (result.secure_url || result.url || result.fallback_base64);
          if (!imageUrl) throw new Error('No image URL returned');

          // FIX: Use correct column names for your Supabase table
          const payload = { 
            title: sanitize(title), 
            description: sanitize(description), 
            image_url: imageUrl, 
            // Only include if your table has this column
            // category: category, 
            target_url: targetUrl 
          };

          // Check if we're online and supabaseHelper exists
          if (!navigator.onLine) {
            window.offlineQueue && window.offlineQueue.add && 
              window.offlineQueue.add({ type: 'insert', data: payload });
            alert('Queued for upload while offline');
          } else if (window.supabaseHelper && window.supabaseHelper.insertPost) {
            await window.supabaseHelper.insertPost(payload);
          } else {
            alert('Database connection not available. Saving locally.');
            // Save to localStorage as fallback
            const localImages = JSON.parse(localStorage.getItem('local_images') || '[]');
            localImages.push({...payload, id: Date.now(), local: true});
            localStorage.setItem('local_images', JSON.stringify(localImages));
          }

          // reset form
          createForm.reset();
          const preview = document.getElementById('imagePreview'); 
          if (preview) preview.style.display = 'none';
        } catch (err) {
          console.error('Upload failed', err);
          alert('Upload failed: ' + (err.message || err));
        }
      });
    }

    function sanitize(str) {
      return String(str || '').replace(/[<>]/g, '').substring(0, 500);
    }
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(init, 1000); // Give other scripts time to load
    });
  } else {
    setTimeout(init, 1000);
  }
})();