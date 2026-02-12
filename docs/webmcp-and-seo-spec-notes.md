# 実装根拠メモ (WebMCP / MCP / SEO / AEO)

## WebMCP

- W3C Working Draft `Web Model Context Protocol API` (2026-02-10)
  - `Navigator` に `modelContext` 属性を追加する定義
  - 本実装では `navigator.modelContext` の存在を確認し、ツール登録処理を実行
  - https://www.w3.org/TR/webmcp/
- W3C WG Minutes (2025-09-17)
  - `provideContext` をコアにしつつ `registerTool`/`unregisterTool` を検討・整理
  - 本実装では双方をフォールバック対応
  - https://www.w3.org/2025/09/17-webmachinelearning-minutes.html

## MCP

- リモートMCPサーバー方式ではなく、WebMCPブラウザAPI方式を採用
- そのためHTTP `/mcp` エンドポイントは提供しない構成へ変更

## SEO

- Google Search Essentials
  - クロール可能性、インデックス可能性、主要メタデータの整備
- Google タイトルリンクのベストプラクティス
  - 明確で一貫したタイトル付与
- Google 構造化データ導入ガイド
  - JSON-LD形式で `WebApplication` と `FAQPage` を付与
  - https://developers.google.com/search/docs/fundamentals/seo-starter-guide
  - https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data

## AEO

- `llms.txt` 提案仕様
  - LLM向けにコンテンツ構造と参照先を公開
  - 本実装では `/llms.txt` と `/llms-full.txt` を提供
  - https://llmstxt.org/
