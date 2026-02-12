interface FetcherBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  ASSETS: FetcherBinding;
}

const INDEXABLE_ROBOTS_TAG =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

function createBaseHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  if (!merged.has("Referrer-Policy")) {
    merged.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  if (!merged.has("X-Content-Type-Options")) {
    merged.set("X-Content-Type-Options", "nosniff");
  }
  return merged;
}

function textResponse(
  text: string,
  status = 200,
  headers?: HeadersInit
): Response {
  const merged = createBaseHeaders(headers);
  if (!merged.has("Content-Type")) {
    merged.set("Content-Type", "text/plain; charset=utf-8");
  }
  return new Response(text, { status, headers: merged });
}

function xmlResponse(
  xml: string,
  status = 200,
  headers?: HeadersInit
): Response {
  const merged = createBaseHeaders(headers);
  merged.set("Content-Type", "application/xml; charset=utf-8");
  return new Response(xml, { status, headers: merged });
}

function markdownResponse(
  markdown: string,
  status = 200,
  headers?: HeadersInit
): Response {
  const merged = new Headers(headers);
  merged.set("Content-Type", "text/markdown; charset=utf-8");
  return textResponse(markdown, status, merged);
}

function createRobotsTxt(origin: string): string {
  return `User-agent: *
Allow: /
Disallow: /cdn-cgi/

Sitemap: ${origin}/sitemap.xml
`;
}

function createSitemapXml(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${origin}/llms.txt</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${origin}/llms-full.txt</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
`;
}

function createLlmsTxt(origin: string): string {
  return `# BOMber
> UTF-8/Shift_JIS テキストを UTF-8 BOM付き に変換し、ZIPで一括ダウンロードできるブラウザ完結ツール。

## Canonical
- [BOMber](${origin}/)
- [Sitemap](${origin}/sitemap.xml)

## Quick Answers
- Q: BOMberは何をする？  
  A: UTF-8/Shift_JISテキストを UTF-8 BOM付き に変換し、複数ファイルをZIPで取得できる。
- Q: ファイルは外部送信される？  
  A: 送信されない。変換とZIP生成はブラウザ内で実行される。
- Q: 対応文字コードは？  
  A: UTF-8 と Shift_JIS。バイナリや解釈不能データは除外される。

## Resources
- [Full LLM Context](${origin}/llms-full.txt)
- [robots.txt](${origin}/robots.txt)
`;
}

function createLlmsFullTxt(origin: string): string {
  return `# BOMber Full Context

## 1. Product Summary
- BOMber は UTF-8 / Shift_JIS テキストを UTF-8 BOM付きへ変換する Web アプリ。
- 複数ファイルをまとめて ZIP ダウンロードできる。
- 変換処理はブラウザ内で完結し、ファイル内容を外部アップロードしない。

## 2. Primary User Intents
- 「Excelで文字化けしない UTF-8 BOM 付き CSV を作りたい」
- 「Shift_JIS のテキスト資産を UTF-8 BOM 付きへ移行したい」
- 「複数ファイルを一括変換してまとめて保存したい」

## 3. Conversion Rules
- Input:
  - UTF-8 または Shift_JIS として解釈可能なテキストファイル
  - 1ファイルあたり最大20MB
- Output:
  - UTF-8 BOM 付きバイト列
  - 変換成功ファイルをZIPでまとめてダウンロード
- Safeguards:
  - NULバイトを含むバイナリや解釈不能データは除外
  - 既にBOM付きUTF-8の場合は再付与しない（そのまま成功扱い）

## 4. Error Cases
- FILE_TOO_LARGE: 1ファイル20MBを超過
- NON_TEXT_OR_INVALID_UTF8: テキストとして解釈不能（バイナリ含む）
- READ_ERROR: ブラウザでのファイル読み込み失敗

## 5. AI / Agent Integration
- Browser API: navigator.modelContext (WebMCP)
- Remote MCP endpoint は不要。ブラウザ実装が registerTool または provideContext を提供する場合に連携可能。

## 6. Public URLs
- App: ${origin}/
- robots: ${origin}/robots.txt
- sitemap: ${origin}/sitemap.xml
- llms: ${origin}/llms.txt
- llms full: ${origin}/llms-full.txt
`;
}

function withSeoHeaders(response: Response, origin: string): Response {
  const headers = createBaseHeaders(response.headers);

  if (headers.get("Content-Type")?.includes("text/html")) {
    headers.set("X-Robots-Tag", INDEXABLE_ROBOTS_TAG);
    headers.set("Content-Language", "ja");
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    headers.append("Link", `<${origin}/>; rel="canonical"`);
    headers.append("Link", `<${origin}/sitemap.xml>; rel="sitemap"; type="application/xml"`);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    if (url.pathname === "/robots.txt") {
      return textResponse(createRobotsTxt(origin), 200, {
        "Cache-Control": "public, max-age=3600",
        "X-Robots-Tag": "index, follow"
      });
    }

    if (url.pathname === "/sitemap.xml") {
      return xmlResponse(createSitemapXml(origin), 200, {
        "Cache-Control": "public, max-age=3600",
        "X-Robots-Tag": "index, follow"
      });
    }

    if (url.pathname === "/llms.txt" || url.pathname === "/.well-known/llms.txt") {
      return markdownResponse(createLlmsTxt(origin), 200, {
        "Cache-Control": "public, max-age=3600",
        "Content-Language": "ja",
        "X-Robots-Tag": "index, follow"
      });
    }

    if (
      url.pathname === "/llms-full.txt" ||
      url.pathname === "/.well-known/llms-full.txt"
    ) {
      return markdownResponse(createLlmsFullTxt(origin), 200, {
        "Cache-Control": "public, max-age=3600",
        "Content-Language": "ja",
        "X-Robots-Tag": "index, follow"
      });
    }

    const response = await env.ASSETS.fetch(request);
    return withSeoHeaders(response, origin);
  }
};
