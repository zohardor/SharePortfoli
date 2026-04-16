/**
 * Cloudflare Worker — Yahoo Finance CORS Proxy
 * פריסה: https://dash.cloudflare.com → Workers & Pages → Create Worker → הדבק קוד זה → Deploy
 */

const ALLOWED_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return corsResponse(JSON.stringify({ error: 'Missing ?url= parameter' }), 400);
    }

    // Security: only allow Yahoo Finance
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid URL' }), 400);
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return corsResponse(JSON.stringify({ error: 'Host not allowed' }), 403);
    }

    // Fetch from Yahoo Finance
    try {
      const resp = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      const body = await resp.text();
      return corsResponse(body, resp.status, 'application/json');
    } catch (err) {
      return corsResponse(JSON.stringify({ error: err.message }), 502);
    }
  },
};

function corsResponse(body, status = 200, contentType = 'application/json') {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'public, max-age=900', // 15 min cache
    },
  });
}
