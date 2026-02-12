import { createSitemapXml, xmlResponse } from "./_lib/site-content";

interface RequestContext {
  request: Request;
}

export function onRequest(context: RequestContext): Response {
  const origin = new URL(context.request.url).origin;
  return xmlResponse(createSitemapXml(origin), 200, {
    "Cache-Control": "public, max-age=3600",
    "X-Robots-Tag": "index, follow"
  });
}
