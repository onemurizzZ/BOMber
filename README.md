# BOMber

UTF-8/Shift_JISテキストをUTF-8 BOM付きへ変換し、複数ファイルをZIPでまとめてダウンロードできるWebアプリです。  
Cloudflare Workersへそのままデプロイでき、WebMCPブラウザAPI (`navigator.modelContext`) でツール登録できます。

## セットアップ (pnpm)

```bash
pnpm install
pnpm test
pnpm build
```

## ローカル起動

```bash
# フロントエンド開発
pnpm dev

# Cloudflare Worker込みの動作確認
pnpm dev:cf
```

## デプロイ (Cloudflare Workers)

1. Cloudflareへログイン:

```bash
pnpm wrangler login
pnpm wrangler whoami
```

2. デプロイ:

```bash
pnpm deploy
```

## SEO / AEO 実装ポイント

- サーバーサイド配信HTMLに、タイトル・説明・canonical・`hreflang`・OGP・Twitter Cardを定義
- `Organization` / `WebSite` / `WebApplication` / `FAQPage` の JSON-LD を埋め込み
- `/robots.txt` と `/sitemap.xml` をWorkerで配信し、クローラー向け導線を提供
- `llms.txt` / `llms-full.txt` を公開し、LLM/エージェント向けの要約・制約・入出力仕様を提供
- `/.well-known/llms.txt` / `/.well-known/llms-full.txt` にも対応

## WebMCP / MCP 実装ポイント

- W3C WebMCP Working Draftに基づき、`navigator.modelContext` を利用
- `registerTool` または `provideContext` が利用可能な実装に対応
- `convert_utf8_text_to_bom` ツールをブラウザAPI経由で登録

## 主なエンドポイント

- `/` - アプリ本体
- `/robots.txt` - クローラー制御
- `/sitemap.xml` - サイトマップ
- `/llms.txt` / `/llms-full.txt` - LLM向け文脈
- `/.well-known/llms.txt` / `/.well-known/llms-full.txt` - LLM向け文脈（互換エンドポイント）
