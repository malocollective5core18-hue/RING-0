// App bootstrap: load posts, wire realtime, wire upload form minimally
(function () {
  async function init() {
    // ensure clients exist
    if (!window.supabaseClient) console.warn('Supabase client missing');

    // find a container to render posts
    const container = document.getElementById('adminImagesContainer') || document.querySelector('.admin-images-container') || document.getElementById('postsContainer');

    // initial load
    try {
      const res = await window.supabaseHelper.fetchPosts();
      if (!res.error && res.data && container) {
        window.UI.renderPosts(container, res.data);
      }
    } catch (e) { console.warn('Failed to load posts', e); }

    // realtime
    window.realtime && window.realtime.subscribePosts({
      onInsert: async (newPost, all) => {
        // if polling uses (all) param, re-render whole list
        if (Array.isArray(all)) {
          if (container) window.UI.renderPosts(container, all);
          return;
        }
        if (container && newPost) {
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
          const result = await window.cloudinaryUpload(file, { onProgress: (p) => {
            const bar = document.querySelector('.upload-progress-fill');
            if (bar) bar.style.width = p + '%';
          }});

          const imageUrl = result && (result.secure_url || result.url || result.fallback_base64);
          if (!imageUrl) throw new Error('No image URL returned');

          const payload = { title: sanitize(title), description: sanitize(description), image_url: imageUrl, category, target_url: targetUrl };

          if (!navigator.onLine) {
            window.offlineQueue.add({ type: 'insert', data: payload });
            alert('Queued for upload while offline');
          } else {
            await window.supabaseHelper.insertPost(payload);
          }

          // reset form
          createForm.reset();
          const preview = document.getElementById('imagePreview'); if (preview) preview.style.display = 'none';
        } catch (err) {
          console.error('Upload failed', err);
          alert('Upload failed: ' + (err.message || err));
        }
      });
    }

    function sanitize(str) {
      return String(str).replace(/[<>]/g, '');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
