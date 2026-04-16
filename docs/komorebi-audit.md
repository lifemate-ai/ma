# komorebi Audit

更新日: 2026-04-16

## 目的

この監査は、`lifemate-ai/ma` を研究知見に支えられた日常利用向けプロダクト `komorebi` へ再設計するための現状把握をまとめたものです。焦点は次の 3 点です。

1. いま何が実装されているか
2. 研究知見を受け止めるには何が足りないか
3. どこに P0 の構造欠陥があるか

## 現行アーキテクチャの要約

### サーバ

- `ma-server` は `axum` + `libsql` + `rust-embed` 構成。
- `ma-web/dist` を埋め込み配信し、API と静的配信を同じバイナリで提供する。
- LLM provider は OpenAI / Anthropic を env で切替可能。
- 認証は Cognito JWT 検証だが、pool / region / audience がコード内ハードコード。
- 永続化は Turso 前提で、ローカル開発用の軽量 fallback は未整備。

### フロントエンド

- `vite` + TypeScript + PWA plugin。
- SPA だが router は持たず、`session` / `journal` / `history` を手書きで切替。
- ホーム画面は実質 `session` のみで、recommendation home や onboarding は未実装。
- 音声は WebAudio の bell と TTS playback を持ち、streaming fallback も一部ある。

### companion continuity

- `ma-server/src/companion/presence.rs` に持続状態がある。
- `familiarity / attunement / steadiness / protective_tension / openness / watchfulness` を DB に保存。
- session / journal / checkin / observation が memory として蓄積され、prompt に注入される。
- continuity の土台はすでに強い。ここは `komorebi` でも捨てずに活かすべき。

## 現在の主要機能

### 認証

- Front: `ma-web/src/auth.ts`
- Back: `ma-server/src/auth.rs`
- Cognito の PKCE ログインは動くが、domain / client id / redirect uri / pool id / region がコード直書き。
- localStorage key も `ma_*` に固定。

### セッション

- 標準 timed mode:
  - `yasashii`
  - `motto_yasashii`
  - `body_scan`
- bespoke mode:
  - `sbnrr`
  - `emotion_mapping`
  - `gratitude`
  - `compassion`
  - `checkin`

### 音声

- `ma-web/src/audio.ts`
  - bell
  - TTS stream / fallback
- `ma-web/src/voice-guidance.ts`
  - 表示文と読み上げ文の正規化
  - ElevenLabs tag 補完
  - stream 優先 / cancel 安全化

### カメラ観察

- Browser camera preview と snapshot 送信あり。
- `ma-web/src/session.ts` の通常 timed session でのみ有効。
- `ma-server/src/companion/mod.rs` の `/api/companion/observe` で observation memory 化。
- opt-in UI はあるが、privacy copy と保存/削除ポリシーの可視化は弱い。

### 履歴 / ジャーナル / チェックイン / インサイト

- session 終了後に journal 入力。
- `checkin` は 3 問の軽量フロー。
- `history` では unified history を日付ごとに表示。
- `insights` は mode 回数 / body_state / 時間帯 / 週ごとの頻度差分程度の単純 heuristic。

### PWA

- installable manifest あり。
- ただしブランドは `Ma — 間` のまま。
- offline strategy は静的 asset cache 中心で、protocol bundle の観点はない。

## 現在のユーザーフロー

### 1. 認証して session 画面へ入る

1. `ensureAuth()` が Cognito redirect / token refresh を処理
2. 認証が通ると `session` view を render
3. 失敗時の local dev fallback はない

### 2. session から mode を選ぶ

1. 呼吸系 2 分 session を選ぶ
2. または SBNRR / emotion mapping / gratitude / compassion / checkin を選ぶ
3. セッション前の状態測定はない

### 3. timed session を進める

1. greeting を再生
2. open cue
3. 2 分経過の halfway で一度だけ mid cue
4. close cue
5. 必要なら extension で +120 秒

### 4. bespoke mode を進める

- `body_scan`: 固定 cue 列
- `sbnrr`: 固定ステップ列
- `emotion_mapping`: 感情選択 -> 体の部位 -> loop back
- `gratitude`: 3 ラウンド固定
- `compassion`: 4 対象固定
- `checkin`: 3 問固定

### 5. 終了後

1. `journal` で短文入力
2. companion の loop back
3. `history` に戻る

### 6. camera watch

1. session 画面で opt-in
2. 定期 snapshot を送る
3. observation が companion memory に入る
4. timed session 以外では停止される

## 状態保持と companion 注入の現状

### フロントの状態保持

- `ma-web/src/store.ts`
  - `ma:stats` に `sessionsTotal` と `lastSessionDate`
- `ma-web/src/auth.ts`
  - `ma_id_token`
  - `ma_refresh_token`
- persistence は session recommendation や preference には使われていない

### サーバの永続データ

- `sessions`
- `journals`
- `checkins`
- `companion_state`
- `companion_memories`
- `companion_observations`

### companion prompt への注入箇所

- `greet`
- `guide`
- `close`
- `loop_back`
- `sbnrr_step`
- `observe`

`presence::build_presence_snapshot(...)` が直近セッション・ジャーナル・チェックイン・観察を集約し、prompt に memory context を注入する。ここは continuity の核として十分に価値がある。

## 研究観点からの不足

### 1. セッション定義が protocol ではなく UI 実装に埋まっている

- `session.ts` は 2 分固定を前提にしている
- `open -> mid -> close` が中心で、複数 cue / silent interval / condition 分岐を表現しづらい
- mode ごとに別実装が増えており、duration variant や safety 分岐に弱い

### 2. 短時間 practice を体系的に扱えていない

- 2 / 3 / 5 / 10 分帯の protocol registry がない
- breath, breathing space, stress reset, self-compassion break, sleep winddown を一貫したメタデータで扱えない

### 3. personalized recommendation の入力が存在しない

- user goals なし
- preferences なし
- pre/post state なし
- burden / repeat intent / early stop のログなし
- recommendation の説明可能性を作る土台が欠けている

### 4. curriculum が week-based 固定

- `ma-server/src/curriculum.rs` は 4 週間固定
- lapse 後の軽量 re-entry や state-aware personalization に対応していない

### 5. insights が outcome-aware でない

- pre/post 変化を見ていない
- burden を見ていない
- recommendation adoption を見ていない
- confidence / data volume / caution の概念がない

### 6. safety by design が UI / data model / engine に入っていない

- distress flag なし
- grounding 退避導線が常設されていない
- panic / dissociation / trauma reactivation を受けた recommendation 抑制ルールがない
- difficult-person compassion の caution gating がない

### 7. privacy by default が不十分

- camera watch は opt-in だが説明が短い
- session-only observation のポリシーが UI 上で見えにくい
- delete / clear history / clear observations の導線がない
- visible facts only 原則は server prompt にあるが、UX 全体にはまだ十分出ていない

### 8. mobile-ready な境界が弱い

- recommendation / protocol / analytics / session engine が UI から十分分離されていない
- 将来の iOS / Android 移植で再利用しにくい

## バグ・不整合・ハードコード

### P0

1. 認証設定のハードコード
   - `ma-web/src/auth.ts`
   - `ma-server/src/auth.rs`

2. API 認証ヘッダ不整合
   - `ma-web/src/api.ts` の `getHistory()` に auth header がない

3. server 側 query の unsafe fallback
   - `WHERE (user_id = ?1 OR ?1 = '')`
   - 空 user filter 時に全件へ広がる形になっている
   - auth bypass や header 漏れ時に privacy リスクが大きい

4. ブランド名の不整合
   - README
   - `index.html`
   - PWA manifest
   - prompt 内文言
   - localStorage key

5. セッションエンジンの固定 2 分依存
   - `BASE_DURATION = 120`
   - `EXTENSION = 120`
   - halfway cue 1 回前提

### P1

1. mode ごとの UI/logic 分断
2. recommendation API 不在
3. onboarding 不在
4. precheck / postcheck 不在
5. safety event 不在

### P2

1. offline-ready protocol bundle 不在
2. analytics schema 不在
3. domain layer の shared 化不足

## モバイル / PWA 観点の所見

- hover 前提の hover style が散見される
- thumb-friendly quick pick / one-handed operation が弱い
- install copy は現状ブランド名のまま
- audio session / lockscreen / background を意識した設計はまだ浅い

## 今ある強み

1. companion continuity の構造層がすでにある
2. camera observation が「見守り」の手触りを持っている
3. voice guidance 基盤は stream/fallback/cancel をある程度吸収している
4. web + server 同居で product iteration は速い
5. additive migration で拡張しやすい

## 監査まとめ

`ma` は「雰囲気のよい companion mindfulness app」としてはすでに魅力がある。ただし `komorebi` に必要な中核はまだ足りない。特に不足しているのは次の 4 つ。

1. protocol registry と deterministic session planning
2. state-aware recommendation と lightweight measurement
3. privacy / safety を UI と data model に落とした設計
4. auth / API / branding の P0 整理

結論として、`komorebi` の最初の実装は UI 追加からではなく、まず rename・config・auth・session definition・data model の順で基盤を立て直すべきです。
