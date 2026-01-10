// Online Deployment Helper - Handles CORS, domain validation, and connection testing
(function() {
  const config = window.config;
  if (!config) {
    console.error('Deployment helper: Config not loaded');
    return;
  }

  // Domain validation for online deployment
  function validateDomain() {
    const currentDomain = window.location.hostname;
    const whitelist = config.deployment.domainWhitelist || [];

    // Allow localhost and common development domains
    const isAllowed = whitelist.some(domain =>
      currentDomain === domain.replace('.', '') ||
      currentDomain.endsWith(domain) ||
      domain.startsWith('.') && currentDomain.endsWith(domain)
    );

    if (!isAllowed && config.environment === 'production') {
      console.warn(`Domain ${currentDomain} not in whitelist. Some features may be limited.`);
      return false;
    }

    console.log(`✅ Domain validation passed: ${currentDomain}`);
    return true;
  }

  // CORS preflight test for APIs
  async function testCORSConnectivity() {
    const apis = config.security.allowedOrigins || [];
    const results = {};

    for (const api of apis) {
      try {
        const response = await fetch(api + '/health', {
          method: 'HEAD',
          mode: 'cors',
          cache: 'no-cache',
          headers: {
            'Accept': 'application/json',
            'X-Test-Request': 'true'
          }
        });

        results[api] = {
          status: 'success',
          accessible: response.ok
        };

        console.log(`✅ CORS test passed for ${api}`);
      } catch (error) {
        results[api] = {
          status: 'error',
          error: error.message,
          accessible: false
        };

        console.warn(`⚠️ CORS test failed for ${api}:`, error.message);
      }
    }

    return results;
  }

  // Connection quality test
  async function testConnectionQuality() {
    const testUrls = [
      'https://www.google.com/favicon.ico',
      config.supabase.url + '/rest/v1/',
      config.cloudinary.upload_url
    ];

    const results = {};

    for (const url of testUrls) {
      const startTime = Date.now();

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache'
        });

        const endTime = Date.now();
        const latency = endTime - startTime;

        results[url] = {
          status: 'success',
          latency: latency,
          quality: latency < 500 ? 'excellent' :
                  latency < 1000 ? 'good' :
                  latency < 2000 ? 'fair' : 'poor'
        };

        console.log(`✅ Connection test: ${url} (${latency}ms - ${results[url].quality})`);
      } catch (error) {
        results[url] = {
          status: 'error',
          error: error.message,
          quality: 'unreachable'
        };

        console.warn(`⚠️ Connection test failed: ${url}`, error.message);
      }
    }

    return results;
  }

  // HTTPS enforcement for production
  function enforceHTTPS() {
    if (config.deployment.enableHTTPS &&
        window.location.protocol !== 'https:' &&
        config.environment === 'production') {

      console.warn('Redirecting to HTTPS for secure connection...');
      window.location.href = window.location.href.replace('http:', 'https:');
      return false;
    }

    return true;
  }

  // Service worker registration for PWA features
  async function registerServiceWorker() {
    if ('serviceWorker' in navigator && config.deployment.features.enableOfflineMode) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered:', registration.scope);

        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('✅ Service Worker updated');
              // Optionally show update notification to user
            }
          });
        });

      } catch (error) {
        console.warn('⚠️ Service Worker registration failed:', error.message);
      }
    }
  }

  // Initialize deployment checks
  async function initializeDeployment() {
    console.log('🚀 Initializing online deployment checks...');

    // 1. Enforce HTTPS in production
    if (!enforceHTTPS()) return;

    // 2. Validate domain
    const domainValid = validateDomain();

    // 3. Test CORS connectivity
    if (domainValid && config.deployment.enableCORS) {
      const corsResults = await testCORSConnectivity();
      window.deploymentStatus = {
        ...window.deploymentStatus,
        cors: corsResults
      };
    }

    // 4. Test connection quality
    const connectionResults = await testConnectionQuality();
    window.deploymentStatus = {
      ...window.deploymentStatus,
      connection: connectionResults,
      domainValid: domainValid,
      environment: config.environment,
      httpsEnabled: window.location.protocol === 'https:'
    };

    // 5. Register service worker
    await registerServiceWorker();

    // 6. Set up online/offline event handlers
    setupConnectivityHandlers();

    console.log('✅ Online deployment initialization complete');
    console.log('📊 Deployment Status:', window.deploymentStatus);

    // Dispatch deployment ready event
    window.dispatchEvent(new CustomEvent('deploymentReady', {
      detail: window.deploymentStatus
    }));
  }

  // Set up connectivity monitoring
  function setupConnectivityHandlers() {
    window.addEventListener('online', () => {
      console.log('🌐 Connection restored');
      showConnectivityStatus(true);

      // Retry any failed operations
      window.dispatchEvent(new CustomEvent('connectionRestored'));
    });

    window.addEventListener('offline', () => {
      console.log('📴 Connection lost');
      showConnectivityStatus(false);
    });

    // Initial status
    showConnectivityStatus(navigator.onLine);
  }

  // Show connectivity status to user
  function showConnectivityStatus(isOnline) {
    // Remove existing status indicator
    const existing = document.getElementById('connectivity-status');
    if (existing) existing.remove();

    if (!isOnline) {
      const statusDiv = document.createElement('div');
      statusDiv.id = 'connectivity-status';
      statusDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: rgba(255, 107, 107, 0.9);
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        z-index: 9999;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease;
      `;
      statusDiv.innerHTML = '📴 Offline Mode - Limited functionality';
      document.body.appendChild(statusDiv);

      // Auto-hide after 5 seconds
      setTimeout(() => {
        if (statusDiv.parentNode) {
          statusDiv.remove();
        }
      }, 5000);
    }
  }

  // Utility functions for deployment
  window.deploymentHelper = {
    validateDomain,
    testCORSConnectivity,
    testConnectionQuality,
    enforceHTTPS,
    registerServiceWorker,
    getStatus: () => window.deploymentStatus || {}
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDeployment);
  } else {
    initializeDeployment();
  }

})();