// 車型連動下拉。
// 取代舊版 AjaxFController.GetVehicleModelsByVehicleMakeID
// （reference/old/Tsurumaru/Controllers/AjaxFController.cs）。
//
// 舊版是 POST，且直接回傳拼接的 <option> HTML 字串 —— 把資料層與呈現層綁死，
// 也讓資料庫內容未經跳脫就進入 DOM。這裡改為 GET 回傳 JSON，由前端組出 option。
// 見 docs/08-security.md 缺陷 11。

import type { APIRoute } from 'astro';
import { getModelsByMake } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const raw = url.searchParams.get('makeId');
  const makeId = Number(raw);

  if (!raw || !Number.isInteger(makeId) || makeId <= 0) {
    return new Response(JSON.stringify({ error: 'makeId 必須是正整數' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const rows = await getModelsByMake(makeId);

  return new Response(
    JSON.stringify({ models: rows.map((m) => ({ id: m.id, title: m.title })) }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    },
  );
};
