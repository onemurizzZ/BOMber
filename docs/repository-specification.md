# BOMber リポジトリ詳細仕様書

## 1. 文書の目的
- 本書は、`/Users/suzukikaito/Development/Private/BOMber` の実装コードを基に、機能・構成・入出力・運用方法を明文化する。
- 対象は開発者・レビュアー・運用担当者とし、「現実装が何をどう動かしているか」を把握できる状態を目的とする。

## 2. システム概要
### 2.1 プロダクト概要
- BOMber は、ブラウザ上でテキストファイルを UTF-8 BOM 付き形式へ変換し、複数ファイルを ZIP で一括ダウンロードする Web アプリ。
- 入力として UTF-8 または Shift_JIS を想定し、バイナリ的データや解釈不能データを除外する。
- Cloudflare Workers で配信され、SEO/AEO 向けエンドポイント（`robots.txt` / `sitemap.xml` / `llms.txt` / `llms-full.txt`）を提供する。
- WebMCP ブラウザ API (`navigator.modelContext`) 連携により、BOM 変換ツールをブラウザ内で登録可能。

### 2.2 非機能上の前提
- サーバーへファイルアップロードせず、変換処理はクライアント側で完結する。
- 1 ファイルあたり上限 20MB（`MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024`）。
- TypeScript `strict` 有効、`noEmit`（型検査専用）でビルド時に `vite build` を使用。

## 3. 技術スタック
- フロントエンド: TypeScript + Vite
- ZIP 生成: `jszip`
- テスト: Vitest（`jsdom` 環境）
- 実行基盤: Cloudflare Workers (`wrangler`)
- モジュール形式: ESM (`"type": "module"`)

## 4. リポジトリ構成
### 4.1 主要ディレクトリ
- `src/`
  - `main.ts`: UI 制御・変換実行オーケストレーション
  - `style.css`: 画面スタイル
  - `worker.ts`: Cloudflare Worker ハンドラ
  - `lib/encoding.ts`: エンコーディング判定と BOM 付与ロジック
  - `lib/archive.ts`: ZIP 生成
  - `lib/webmcp.ts`: WebMCP ツール定義・登録ロジック
  - `lib/types.ts`: 共通型定義
  - `lib/__tests__/`: 単体テスト
- `public/`
  - `favicon.svg`, `og-image.svg`, `site.webmanifest`
- `docs/`
  - `repository-specification.md`（本仕様書）
  - `webmcp-and-seo-spec-notes.md`（設計根拠メモ）

### 4.2 設定ファイル
- `package.json`: スクリプト、依存関係
- `tsconfig.json`: TS コンパイル設定
- `vite.config.ts`: Vite + Vitest 設定
- `wrangler.jsonc`: Worker エントリ、アセット配信設定
- `index.html`: SEO メタ・JSON-LD・画面マークアップ

## 5. 画面仕様（`index.html` + `src/main.ts`）
### 5.1 画面要素
- ドロップ領域: `#drop-zone`（`<label>`）
- ファイル入力: `#file-input`（`multiple`）
- 変換実行ボタン: `#convert-button`
- 選択ファイル一覧: `#selected-files`
- 選択件数バッジ: `#file-count`
- ステータス表示: `#status-text`
- 結果テーブル本体: `#results-body`
- WebMCP 状態表示: `#webmcp-status`
- 導火線進捗: `.fuse-track`, `#fuse-progress`, `#fuse-spark-tip`
- 爆発オーバーレイ: `#explosion-overlay`

初期化時に必須要素が取得できない場合、`Error("Failed to initialize UI element: <selector>")` を送出して処理中断する。

### 5.2 UI 状態管理
- 内部状態:
  - `selectedFiles: File[]`
  - `webMcpCleanup?: () => void`
- `setBusy(isBusy)`:
  - 変換中はファイル入力を無効化し、ドロップ領域へ `is-disabled` を付与。
  - 変換ボタンは「変換中」または「選択ファイル 0 件」で無効化し、`is-converting` を切り替える。
  - 導火線トラック `.fuse-track` の `is-active` を切り替える。
  - 変換終了時は導火線進捗（`#fuse-progress` / `#fuse-spark-tip`）を `0%` にリセットする。
- `setSelectedFiles(files)`:
  - ファイル一覧再描画
  - ファイル件数バッジ更新
  - ステータス文言更新
  - 変換ボタン活性/非活性を更新
- `setFuseProgress(ratio)`:
  - 導火線進捗を 0〜100% にクランプして反映
- `removeFile(index)`:
  - 選択済みファイル一覧から指定 index の要素を除外

### 5.3 入力操作仕様
- ドラッグ＆ドロップ:
  - `dragenter` / `dragover` で既定動作抑止し、`is-dragging` 付与
  - `dragleave` / `drop` で `is-dragging` 除去
  - `drop` 時、`event.dataTransfer?.files` を取り込み
- ファイル選択:
  - `input[type=file]` の `change` で `fileInput.files` を取り込み
- 選択済みリスト操作:
  - 各行の除外ボタン（`×`）で対象ファイルを個別に解除

### 5.4 変換実行仕様
1. ファイル未選択なら即 return。
2. `setBusy(true)`、ステータスを `導火線に点火... 変換中です` へ更新。
3. 各ファイルに対し `convertFileToBom(file)` を `Promise.all` で並列実行し、完了件数に応じて `setFuseProgress(completed / total)` を反映。
4. 全件完了後に進捗を 100% にし、200ms 待機して `triggerExplosion()` を実行（オーバーレイ表示 + 結果パネル揺れアニメーション）。
5. `results` をテーブル描画。
6. `output` を持つ結果のみ ZIP エントリ化し、`buildZip` で Blob 生成。
7. ZIP が 1 件以上なら自動ダウンロード（ファイル名: `converted_with_bom_YYYYMMDD_HHMMSS.zip`）。
8. ステータス文言:
  - 成功件数 > 0: `爆撃完了! x/y 件を変換。ZIPをダウンロードしました。`
  - 成功件数 = 0: `変換可能なファイルがありませんでした。`
9. 結果パネル（`#results-panel`）へスムーズスクロール。
10. 例外発生時: `爆発失敗... 予期せぬエラーが発生しました。`
11. `finally` で `setBusy(false)`。

### 5.5 変換結果テーブル仕様
- 表示列: `ファイル / 状態 / 元サイズ / 出力サイズ / 詳細`
- 状態表示:
  - `converted` -> `変換済み`
  - `already_bom` -> `既にBOMあり`
  - `error` -> `エラー`
- 行 class:
  - `status-converted` / `status-already_bom` / `status-error`
  - 追加で新規描画演出用 `is-new`
- 結果 0 件時の表示文言: `結果がありません。`

## 6. 変換コア仕様（`src/lib/encoding.ts`）
### 6.1 定数
- `UTF8_BOM = [0xEF, 0xBB, 0xBF]`
- `MAX_FILE_SIZE_BYTES = 20MB`

### 6.2 エンコーディング判定アルゴリズム
`decodeInputText(bytes)` は以下順序で判定:
1. NUL バイト (`0x00`) を 1 つでも含む場合は即 `null`（非テキスト扱い）。
2. 先頭が UTF-8 BOM の場合:
  - BOM を除いた領域を `TextDecoder("utf-8", { fatal: true })` で厳密デコード。
3. BOM がない場合:
  - まず UTF-8 厳密デコードを試行。
  - 失敗時、`TextDecoder("shift_jis", { fatal: true })` が利用可能なら Shift_JIS 厳密デコードを試行。
4. すべて失敗時は `null`。

### 6.3 変換結果仕様
`convertBytesToBom(bytes, {fileName, originalSize})` の戻り値:
- 成功時: `{ result, output }`
- 失敗時: `{ result }`（`output` なし）

`result.status` の意味:
- `converted`:
  - UTF-8 BOM なし UTF-8、または Shift_JIS から変換した場合
- `already_bom`:
  - 入力が UTF-8 BOM 付きと判定された場合（出力は原文維持）
- `error`:
  - 変換不可

`result.errorCode`:
- `FILE_TOO_LARGE`
- `NON_TEXT_OR_INVALID_UTF8`
- `READ_ERROR`（`convertFileToBom` のファイル読み込み失敗時）

### 6.4 エラーメッセージ
- サイズ超過: `1ファイル20MB以下にしてください。`
- 文字コード不正/非テキスト: `UTF-8/Shift_JISテキストとして読み取れませんでした。`
- 読み込み失敗: `ファイル読み込みに失敗しました。`

## 7. ZIP 生成仕様（`src/lib/archive.ts`）
- `buildZip(files: ZipEntry[])` は各 `ZipEntry{name, data}` を `JSZip.file` で追加し、`generateAsync({type: "blob"})` で `Blob` を返す。
- ファイル名は入力値をそのまま使用（リネーム・正規化は行わない）。

## 8. WebMCP 仕様（`src/lib/webmcp.ts`）
### 8.1 ツール定義
- ツール名: `convert_utf8_text_to_bom`（`WEB_MCP_TOOL_NAME`）
- 説明: テキストを UTF-8 BOM 付きへ変換して返却
- `inputSchema`:
  - `type: object`
  - 必須: `fileName`（1 文字以上）、`text`（文字列）
  - `additionalProperties: false`

### 8.2 ツール実行仕様
`executeConvertUtf8TextTool(input)`:
- 不正入力時は `isError: true` と説明テキストを返却。
- 正常入力時:
  1. `text` を UTF-8 バイト列化
  2. `convertBytesToBom` を実行
  3. 成功時は `structuredContent` に以下を格納
    - `result`: 変換結果
    - `outputText`: UTF-8 デコード結果
    - `outputBase64`: BOM 付きバイト列を Base64 化した文字列
- Base64 変換は 0x8000 バイトごとに分割して `btoa` へ渡す。

### 8.3 登録戦略
`registerBomToolWithBrowserApi(modelContextOverride?)`:
1. `modelContextOverride` 優先、なければ `navigator.modelContext` を参照。
2. `registerTool` が存在すれば優先使用。
3. なければ `provideContext({ tools: [tool] })` を使用。
4. どちらも無ければ `unsupported`。
5. 例外時は `failed` とエラー文言を返却。

戻り値 `WebMcpRegistrationResult`:
- `status`: `registered` / `unsupported` / `failed`
- `method`: `registerTool` または `provideContext`（登録時）
- `cleanup`:
  - `registerTool` の戻り値が `unregister` を持てばそれを使用
  - なければ `modelContext.unregisterTool` で代替

画面初期化時に登録を試行し、`#webmcp-status` へメッセージ表示。`beforeunload` で `cleanup` を実行。

## 9. Cloudflare Worker 仕様（`src/worker.ts`）
### 9.1 リクエストルーティング
- `/robots.txt`: `text/plain; charset=utf-8`
- `/sitemap.xml`: `application/xml; charset=utf-8`
- `/llms.txt`: `text/markdown; charset=utf-8`
- `/llms-full.txt`: `text/markdown; charset=utf-8`
- その他: `env.ASSETS.fetch(request)` で静的アセット返却

`origin` はリクエスト URL から動的生成し、`robots/sitemap/llms` の本文に埋め込む。

### 9.2 SEO ヘッダー付与
`withSeoHeaders(response)` は `env.ASSETS.fetch(request)` の戻り値に適用し、以下を追加:
- 常時:
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
- `Content-Type` に `text/html` を含む場合:
  - `X-Robots-Tag: index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`
  - `Content-Language: ja`
  - `Cache-Control: public, max-age=0, must-revalidate`

### 9.3 `wrangler.jsonc` 設定
- エントリ: `src/worker.ts`
- Assets:
  - `directory: "./dist"`
  - `not_found_handling: "single-page-application"`
  - `run_worker_first`: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`

## 10. SEO/AEO マークアップ仕様（`index.html`）
### 10.1 メタ情報
- `title`, `description`, `canonical`
- OGP (`og:type`, `og:title`, `og:description`, `og:image` 等)
- Twitter Card (`summary_large_image`)
- `robots` / `googlebot` 指定

### 10.2 構造化データ（JSON-LD）
- `WebApplication`
- `FAQPage`（3 問）
  - 対応形式
  - 既存 BOM の扱い
  - WebMCP 連携可否

## 11. 型仕様（`src/lib/types.ts`）
- `ConversionStatus = "converted" | "already_bom" | "error"`
- `ConversionErrorCode = "FILE_TOO_LARGE" | "NON_TEXT_OR_INVALID_UTF8" | "READ_ERROR"`
- `ConversionResult`:
  - `fileName`, `status`, `originalSize`
  - 任意: `outputSize`, `errorCode`, `message`
- `BatchConversionResult`:
  - `results: ConversionResult[]`
  - 任意: `zipBlob: Blob`
- `ZipEntry`:
  - `name: string`
  - `data: Uint8Array`

## 12. 開発・ビルド・運用仕様
### 12.1 スクリプト
- `pnpm dev`: Vite 開発サーバー
- `pnpm dev:cf`: ビルド後に `wrangler dev`
- `pnpm build`: `tsc --noEmit` + `vite build`
- `pnpm preview`: `pnpm build` + `wrangler dev`
- `pnpm deploy`: `pnpm build` + `wrangler deploy`
- `pnpm test`: Vitest 一括実行
- `pnpm test:watch`: Vitest watch

### 12.2 TypeScript 設定要点
- `target: ES2022`
- `moduleResolution: Bundler`
- `strict: true`
- `lib: ES2022 + DOM + DOM.Iterable + ESNext`

## 13. テスト仕様と観測結果
### 13.1 テスト対象
- `encoding.test.ts`:
  - UTF-8 BOM 付与
  - Shift_JIS 変換
  - 既存 BOM 維持
  - NUL 含有エラー
  - 不正バイト列エラー
  - サイズ上限エラー
- `archive.test.ts`:
  - ZIP 格納対象確認
  - ファイル名/内容維持
- `webmcp.test.ts`:
  - ツール変換成功
  - 不正入力エラー
  - `registerTool` 分岐

### 13.2 実行観測（2026-02-12）
- `pnpm test` 実行時、11 テスト中 4 件失敗を観測。
- 失敗ファイル:
  - `src/lib/__tests__/encoding.test.ts`
  - `src/lib/__tests__/archive.test.ts`
  - `src/lib/__tests__/webmcp.test.ts`
- 本書は失敗修正を含まない。現実装仕様の記述を目的とする。

## 14. 制約・既知の仕様上注意
- 変換対象はテキストのみ（NUL 含有は除外）。
- 文字コード判定は UTF-8 優先、次点で Shift_JIS（デコーダ利用可能時のみ）。
- 出力ファイル名は入力名をそのまま継承。
- ZIP ダウンロードはブラウザの `URL.createObjectURL` + `<a download>` に依存。
- Worker はリモート MCP サーバーを提供せず、WebMCP ブラウザ API 前提で連携する。

## 15. 変更影響の要点
- `encoding.ts` 変更は UI・WebMCP・テストの全経路へ直結するため回帰影響が大きい。
- `worker.ts` 変更は SEO クローラ挙動、AEO（`llms*.txt`）公開内容、キャッシュ戦略へ影響する。
- `index.html` の構造化データ変更は検索結果表示への影響があるため、スキーマ妥当性確認が必要。
