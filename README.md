# Ma

`Ma` は、音声ガイダンス付きのマインドフルネス実践アプリです。  
単なるタイマーや定型文ではなく、同じ相手が戻ってくる感覚を持てる companion を目指していて、セッション履歴、ジャーナル、チェックイン、観察メモをもとに応答の重心が少しずつ変わります。

## できること

- 音声つきのマインドフルネスセッション
- ジャーナル保存とルーピング
- 感謝、慈悲、感情マッピング、SBNRR、チェックインなどの実践
- 実践履歴の保存
- companion の持続状態
  - 記憶
  - 予測誤差
  - GWT 的な前景化
- browser camera を使った「見守り」観察
  - セッション中の画像から短い観察文を作り、companion memory に残す

## 構成

- `ma-server`
  - Rust / Axum 製 API サーバー
  - Turso を使った記録保存
  - OpenAI / Claude による companion 応答
  - ElevenLabs TTS
- `ma-web`
  - TypeScript / Vite 製フロントエンド
  - セッション UI
  - 音声再生
  - browser camera からの observation 送信

`ma-server` は `ma-web/dist` を埋め込んで配信します。  
つまり frontend を更新したら、先に `ma-web` を build してから server を起動する前提です。

## 必要なもの

- Rust stable
- Node.js 20 以上
- npm
- Turso database
- OpenAI か Claude の API key
- ElevenLabs API key

## セットアップ

### 1. 環境変数を用意する

`.env.example` を元に `.env` を作ります。

```bash
cp .env.example .env
```

最低限必要なのはこのへんです。

- `TURSO_URL`
- `TURSO_TOKEN`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `LLM_PROVIDER`
- `OPENAI_API_KEY` または `ANTHROPIC_API_KEY`

### 2. frontend を install / build する

```bash
cd ma-web
npm install
npm run build
cd ..
```

### 3. server を起動する

```bash
cargo run -p ma-server
```

デフォルトでは `http://localhost:3001` で待ち受けます。

ただし、現状の認証設定は特定の Cognito Hosted UI / callback URL を前提にコードへ固定されています。  
local でそのままログインまで通したい場合は、後述の認証設定も自分の環境へ合わせて更新してください。

## 使い方

### 1. ログインする

起動すると認証チェックが走り、未ログインなら Cognito Hosted UI にリダイレクトされます。

### 2. セッションを選ぶ

トップ画面で次のモードから選べます。

- やさしい
- もっとやさしい
- 体をめぐる
- SBNRR
- 感情をたどる
- 感謝する
- 思いを届ける
- チェックイン

### 3. 必要なら「見守り」を有効にする

通常の timed session 画面では `見守りを有効にする` ボタンを押すと browser camera が有効になります。

- camera 許可が必要です
- secure origin か `localhost` で動かしてください
- 画像は短い観察文に変換され、companion memory に残ります

いまの実装では、browser camera の見守りは通常セッション画面から使う想定です。

### 4. セッションを終える

セッション後は、必要に応じてジャーナルを書いたり、履歴を見返したりできます。

## テスト

```bash
cargo test -p ma-server
cd ma-web && npm test
```

## いまの前提と注意点

### 認証設定はコードに埋め込まれています

現状、Cognito の設定値はここにハードコードされています。

- `ma-web/src/auth.ts`
- `ma-server/src/auth.rs`

そのまま fork して別環境で動かす場合は、この値を自分の Cognito 設定に合わせて更新してください。  
特に frontend の `REDIRECT_URI` が固定なので、ここを変えないと local login は戻ってきません。

### frontend は embedded 配信です

`ma-server` は `ma-web/dist` を埋め込んで返します。  
frontend を変えたのに反映されないときは、まず `ma-web` を build し直してください。

### camera 見守りはブラウザ依存です

- camera API に対応したブラウザが必要です
- 権限拒否時は見守りは無効のままです
- 観察は「見えている事実」だけを短文で要約する方針です

## 開発の流れ

frontend を触ったとき:

```bash
cd ma-web
npm test
npm run build
cd ..
```

server を触ったとき:

```bash
cargo test -p ma-server
```

## ライセンス

まだ未設定です。
