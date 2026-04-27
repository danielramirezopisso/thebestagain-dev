// generate_sitemap.js
// Run with: node generate_sitemap.js
// Requires: npm install @supabase/supabase-js
// Writes sitemap.xml to current directory

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://pwlskdjmgqxikbamfshj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA';
const BASE_URL = 'https://thebestagain.com';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function generateSitemap() {
  console.log('Fetching markers…');

  const { data: markers, error } = await sb
    .from('markers')
    .select('id,updated_at,group_type,category_id')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error.message); process.exit(1); }

  console.log(`Found ${markers.length} markers`);

  // Static pages
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'weekly' },
    { url: '/map.html', priority: '0.9', changefreq: 'daily' },
    { url: '/list.html', priority: '0.8', changefreq: 'daily' },
    { url: '/products.html', priority: '0.8', changefreq: 'daily' },
    { url: '/rutas.html', priority: '0.8', changefreq: 'weekly' },
    { url: '/ranking.html', priority: '0.9', changefreq: 'monthly' },
  ];

  const today = new Date().toISOString().split('T')[0];

  const urls = [
    // Static pages
    ...staticPages.map(p => `
  <url>
    <loc>${BASE_URL}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),

    // Marker pages
    ...markers.map(m => {
      const lastmod = m.updated_at ? m.updated_at.split('T')[0] : today;
      const cat = m.category_id ? `&cat=${m.category_id}` : '';
      return `
  <url>
    <loc>${BASE_URL}/marker.html?id=${m.id}${cat}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${m.group_type === 'place' ? '0.7' : '0.6'}</priority>
  </url>`;
    })
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`;

  fs.writeFileSync('sitemap.xml', xml);
  console.log(`✅ sitemap.xml written with ${markers.length + staticPages.length} URLs`);
  console.log('Upload sitemap.xml to your GitHub repo root to deploy it.');
}

generateSitemap();
