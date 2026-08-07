// sitemap，涵蓋所有靜態頁與每一台車的詳情頁。
// 見 docs/07-migration.md#其他

import type { APIRoute } from 'astro';
import { getAllVehicleIds } from '../lib/db';
import { VEHICLE_TYPE } from '../lib/enums';

export const prerender = false;

export const GET: APIRoute = async ({ site, url }) => {
  const origin = (site ?? new URL(url.origin)).origin;
  const vehicles = await getAllVehicleIds();

  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/cars', priority: '0.9' },
    { loc: '/bikes', priority: '0.9' },
    { loc: '/about', priority: '0.5' },
    { loc: '/map', priority: '0.5' },
    { loc: '/privacy', priority: '0.3' },
    ...vehicles.map((v) => ({
      loc: `${v.type === VEHICLE_TYPE.CAR ? '/cars' : '/bikes'}/${v.id}`,
      priority: '0.8',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${origin}${u.loc}</loc><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
