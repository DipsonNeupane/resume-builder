import { requestSeo } from './src/seo/policy';

export default function middleware(request: Request): Response {
 const result = requestSeo(new URL(request.url), process.env.VERCEL_ENV === 'production');
 if (result.status) return new Response(request.method === 'HEAD' ? null : result.body, { status: result.status, headers: result.headers });
 // Vercel's native continuation protocol, identical to next() without pulling
 // a server SDK into this small middleware. Source:
 // https://github.com/vercel/vercel/blob/main/packages/functions/src/middleware.ts
 return new Response(null, { headers: { ...result.headers, 'x-middleware-next': '1' } });
}
