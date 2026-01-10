// Cloudinary unsigned upload helper with progress, retries, and base64 fallback - Online Deployment Ready
(function () {
  const cfg = window.config && window.config.cloudinary;
  const deploymentCfg = window.config && window.config.deployment;

  if (!cfg) {
    console.error('Cloudinary config missing.');
    return;
  }

  async function uploadToCloudinary(file, { onProgress, onRetry } = {}) {
    // Enhanced validation for online deployment
    if (!file) throw new Error('No file provided');
    if (file.size > cfg.max_file_size_mb * 1024 * 1024) throw new Error('File too large');
    if (!cfg.allowed_types.includes(file.type)) throw new Error('Invalid file type');

    // Check if we're online
    if (!navigator.onLine) {
      throw new Error('No internet connection. Upload not possible.');
    }

    const maxAttempts = deploymentCfg ? deploymentCfg.retryAttempts : 3;
    let attempt = 0;
    let lastErr = null;

    while (attempt < maxAttempts) {
      try {
        console.log(`Cloudinary upload attempt ${attempt + 1}/${maxAttempts}`);
        const result = await _uploadOnce(file, onProgress);
        return result;
      } catch (err) {
        lastErr = err;
        attempt++;

        console.warn(`Cloudinary upload attempt ${attempt} failed:`, err.message);

        if (typeof onRetry === 'function') {
          onRetry(attempt, maxAttempts, err);
        }

        // Don't retry on certain errors
        if (err.message.includes('Invalid file type') ||
            err.message.includes('File too large') ||
            err.message.includes('No file provided')) {
          break;
        }

        // Exponential backoff with jitter
        const baseDelay = deploymentCfg ? deploymentCfg.retryDelay : 1000;
        const backoff = baseDelay * (2 ** attempt) + Math.random() * 1000;
        console.log(`Retrying in ${Math.round(backoff)}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }

    console.error('All Cloudinary upload attempts failed, falling back to local storage');

    // Enhanced fallback for online deployment
    try {
      const base64 = await fileToBase64(file);
      console.log('Using base64 fallback for offline/online compatibility');
      return {
        fallback_base64: base64,
        fallback_reason: 'All upload attempts failed',
        original_error: lastErr?.message
      };
    } catch (err) {
      throw lastErr || err;
    }
  }

  function _uploadOnce(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Enhanced XMLHttpRequest setup for online deployment
      xhr.open('POST', cfg.upload_url, true);
      xhr.timeout = cfg.timeout_ms || 45000; // Increased timeout for online

      // Set headers for better CORS handling
      if (cfg.headers) {
        Object.keys(cfg.headers).forEach(key => {
          xhr.setRequestHeader(key, cfg.headers[key]);
        });
      }

      // Add additional headers for online deployment
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (window.config.environment === 'production') {
        xhr.setRequestHeader('X-Environment', 'production');
      }

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);

            // Enhanced response validation
            if (!data || typeof data !== 'object') {
              reject(new Error('Invalid response format from Cloudinary'));
              return;
            }

            if (data.error) {
              reject(new Error(`Cloudinary error: ${data.error.message || 'Unknown error'}`));
              return;
            }

            if (!data.secure_url && !data.url) {
              reject(new Error('No image URL in Cloudinary response'));
              return;
            }

            console.log('Cloudinary upload successful');
            resolve(data);
          } catch (err) {
            console.error('Failed to parse Cloudinary response:', err);
            reject(new Error('Invalid JSON response from Cloudinary'));
          }
        } else {
          let errorMessage = `HTTP ${xhr.status}`;
          try {
            const errorData = JSON.parse(xhr.responseText);
            if (errorData && errorData.error) {
              errorMessage = errorData.error.message || errorData.error;
            }
          } catch (e) {
            // Response wasn't JSON, use status text
            errorMessage = xhr.statusText || 'Unknown error';
          }
          reject(new Error(`Cloudinary upload failed: ${errorMessage}`));
        }
      };

      xhr.onerror = function () {
        reject(new Error('Network error: Unable to reach Cloudinary servers'));
      };

      xhr.ontimeout = function () {
        reject(new Error('Upload timeout: Cloudinary server did not respond in time'));
      };

      xhr.onabort = function () {
        reject(new Error('Upload aborted'));
      };

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.onprogress = function (ev) {
          if (ev.lengthComputable) {
            const percent = Math.round((ev.loaded / ev.total) * 100);
            onProgress(percent);
          }
        };
      }

      // Enhanced FormData preparation
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', cfg.upload_preset);

      // Add metadata for better tracking in production
      if (window.config.environment === 'production') {
        formData.append('folder', 'ring0-properties');
        formData.append('resource_type', 'auto');
      }

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
