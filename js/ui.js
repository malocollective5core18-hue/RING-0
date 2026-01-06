// Minimal UI helpers to render posts and create safe DOM elements
(function () {
  function createPostElement(post) {
    const card = document.createElement('div');
    card.className = 'image-card';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = post.title || 'image';
    img.src = post.image_url || '';
    card.appendChild(img);

    const h4 = document.createElement('h4');
    h4.textContent = post.title || 'Untitled';
    card.appendChild(h4);

    const p = document.createElement('p');
    p.textContent = post.description || '';
    card.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'image-card-actions';

    const del = document.createElement('button');
    del.className = 'image-card-btn delete';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!post.id) return;
      try {
        await window.supabaseHelper.deletePost(post.id);
      } catch (e) {
        console.error(e);
      }
    });

    actions.appendChild(del);
    card.appendChild(actions);

    return card;
  }

  async function renderPosts(container, posts) {
    if (!container) return;
    container.innerHTML = '';
    for (const p of posts) {
      try {
        const el = createPostElement(p);
        container.appendChild(el);
      } catch (e) { console.warn('Error rendering post', e); }
    }
  }

  window.UI = { createPostElement, renderPosts };
})();
