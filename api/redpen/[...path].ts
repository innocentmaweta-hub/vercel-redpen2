import type { VercelRequest, VercelResponse } from '@vercel/node';

const WORDPRESS_API = 'https://redpen.empire16.com/wp-json/redpen/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Reconstruct the path, e.g. ['auth', 'register'] -> 'auth/register'
  const pathSegments = req.query.path;
  const path = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;

  const targetUrl = `${WORDPRESS_API}/${path}/`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // Forward the Authorization header if the client sent one
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization as string;
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : JSON.stringify(req.body),
    });

    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(502).json({ message: 'Failed to reach WordPress API' });
  }
}
