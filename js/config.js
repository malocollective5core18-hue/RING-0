// Centralized config for Cloudinary and Supabase
window.config = {
  cloudinary: {
    cloud_name: 'dcpqnmdas',
    upload_preset: 'unsigned_images',
    upload_url: 'https://api.cloudinary.com/v1_1/dcpqnmdas/image/upload',
    max_file_size_mb: 5,
    timeout_ms: 30000,
    allowed_types: ['image/jpeg','image/jpg','image/png','image/gif','image/webp']
  },
  supabase: {
    url: 'https://dngbicvrkxetsrirzmwn.supabase.co',
    anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZ2JpY3Zya3hldHNyaXJ6bXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MzAyMTMsImV4cCI6MjA4MjUwNjIxM30.RVDwv00a5ZuwKPbgq8dVYuMhAP0L55VYxmaCHRzM6dY'
  }
};

// Configuration validation guard
(function() {
  const config = window.config;
  let isHealthy = true;

  if (!config) {
    console.error('CRITICAL: window.config is undefined. Load config.js before other scripts.');
    showConfigError('Configuration not loaded');
    return;
  }

  // Check Supabase configuration
  if (!config.supabase || !config.supabase.url || !config.supabase.anon_key) {
    console.error('CRITICAL: Supabase configuration incomplete. Check config.js');
    showConfigError('Supabase configuration incomplete');
    isHealthy = false;
  } else if (config.supabase.anon_key.includes('example_anon_key') || config.supabase.anon_key.includes('USE_PROVIDED')) {
    console.error('CRITICAL: Supabase anon key is placeholder. Replace with real key before deployment.');
    showConfigError('Supabase anon key is placeholder - replace with real key');
    isHealthy = false;
  }

  // Check Cloudinary configuration
  if (!config.cloudinary || !config.cloudinary.cloud_name || !config.cloudinary.upload_preset) {
    console.error('CRITICAL: Cloudinary configuration incomplete. Check config.js');
    showConfigError('Cloudinary configuration incomplete');
    isHealthy = false;
  }

  // Update health indicator
  const indicator = document.getElementById('configHealthIndicator');
  if (indicator) {
    if (isHealthy) {
      indicator.textContent = '✓ Configuration: Healthy';
      indicator.style.background = '#35d07f';
      // Auto-hide healthy indicator after 5 seconds
      setTimeout(() => {
        indicator.style.display = 'none';
      }, 5000);
    } else {
      indicator.textContent = '❌ Configuration: Issues Found';
      indicator.style.background = '#ff6b6b';
      indicator.style.display = 'block';
    }
  }

  console.log('Configuration validation:', isHealthy ? 'PASSED' : 'FAILED');

  function showConfigError(message) {
    // Show visual error indicator
    const indicator = document.getElementById('configHealthIndicator');
    if (indicator) {
      indicator.textContent = `❌ ${message}`;
      indicator.style.background = '#ff6b6b';
      indicator.style.display = 'block';
    }
  }
})();
