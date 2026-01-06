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
    anon_key: 'USE_PROVIDED_ANON_KEY'
  }
};
