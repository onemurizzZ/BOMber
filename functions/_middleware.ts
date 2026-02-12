import { withSeoHeaders } from "./_lib/site-content";

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const response = await context.next();
  const origin = new URL(context.request.url).origin;
  return withSeoHeaders(response, origin);
}
