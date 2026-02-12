import { createLlmsFullTxt, markdownResponse } from "./_lib/site-content";

interface RequestContext {
  request: Request;
}

export function onRequest(context: RequestContext): Response {
  const origin = new URL(context.request.url).origin;
  return markdownResponse(createLlmsFullTxt(origin), 200, {
    "Cache-Control": "public, max-age=3600",
    "Content-Language": "ja",
    "X-Robots-Tag": "index, follow"
  });
}
