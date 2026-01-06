// Cloudinary unsigned upload helper with progress, retries, and base64 fallback
(function () {
  const cfg = window.config && window.config.cloudinary;
  if (!cfg) {
    console.error('Cloudinary config missing.');
    return;
  }

  async function uploadToCloudinary(file, { onProgress } = {}) {
    // Validate
    if (!file) throw new Error('No file provided');
    if (file.size > cfg.max_file_size_mb * 1024 * 1024) throw new Error('File too large');
    if (!cfg.allowed_types.includes(file.type)) throw new Error('Invalid file type');

    const maxAttempts = 3;
    let attempt = 0;
    let lastErr = null;

    while (attempt < maxAttempts) {
      try {
        const result = await _uploadOnce(file, onProgress);
        return result;
      } catch (err) {
        lastErr = err;
        attempt++;
        const backoff = 2 ** attempt * 300; // exponential backoff
        await new Promise(r => setTimeout(r, backoff));
      }
    }

    // Fallback: return base64 data URL
    try {
      const base64 = await fileToBase64(file);
      return { fallback_base64: base64 };
    } catch (err) {
      throw lastErr || err;
    }
  }

  function _uploadOnce(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', cfg.upload_url, true);
      xhr.timeout = cfg.timeout_ms || 30000;

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (err) {
            reject(new Error('Invalid server response'));
          }
        } else {
          reject(new Error('Upload failed: ' + xhr.status));
        }
      };

      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.ontimeout = function () { reject(new Error('Upload timeout')); };

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.onprogress = function (ev) {
          if (ev.lengthComputable) {
            onProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', cfg.upload_preset);
      xhr.send(formData);
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.cloudinaryUpload = uploadToCloudinary;
})();
