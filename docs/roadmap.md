# komorebi Roadmap

更新日: 2026-04-16

## 進め方の原則

1. 先に基盤を直す
2. その次に protocol / recommendation を入れる
3. UI polish は最後に寄せる
4. 研究 claim は docs と product copy の両方で控えめに保つ

## P0

### 目的

`Ma` のプロトタイプ構造から、`komorebi` の product 基盤へ移す。ここでは壊れやすい部分を先に直す。

### 作業項目

1. ブランド rename
   - visible string を `komorebi` へ更新
   - PWA manifest / title / meta / README / install copy を更新
   - 必要なら local storage key migration を追加

2. 認証 config の env 化
   - `ma-web/src/auth.ts`
   - `ma-server/src/auth.rs`
   - domain / pool / region / client id / redirect uri を env へ移動
   - dev / staging / prod 切替を可能にする
   - auth 未設定時の local dev mode を検討

3. API fetch の共通化
   - `ma-web/src/api.ts` に auth-aware fetch wrapper 導入
   - auth header / error handling / 401 対応 / JSON parse を統一
   - history 系の漏れを修正

4. DB migration scaffold
   - `user_preferences`
   - `user_goals`
   - `session_precheck`
   - `session_postcheck`
   - `session_events`
   - `recommendation_log`
   - `safety_events`
   - additive migration で入れる

5. protocol registry の受け皿を先に作る
   - `shared/protocols` 相当の構造
   - まず JSON or TS module で定義
   - old mode -> protocol id mapping を持たせる

### 完了条件

- branding が user-facing に `komorebi`
- auth が env で切替可能
- API auth inconsistency 解消
- migration が入る
- protocol definition を置く場所ができる

## P1

### 目的

short-time-first な practice product としての本体を作る。

### 作業項目

1. session engine refactor
   - `ProtocolDefinition`
   - `ProtocolVariant`
   - `Cue`
   - `SessionPlan`
   - `SessionEvent`
   - silent interval / extension / early stop / safety cue を first-class 化

2. protocol 実装
   - `breath_foundation`
   - `breathing_space`
   - `body_scan`
   - `open_awareness`
   - `emotion_labeling`
   - `loving_kindness`
   - `self_compassion_break`
   - `walking_mindfulness`
   - `stress_reset`
   - `sleep_winddown`
   - `checkin`
   - `sbnrr` は reflective pause として再位置付け

3. onboarding
   - use case
   - goal
   - available time
   - posture
   - voice density
   - eyes open/closed
   - watch opt-in
   - safety note

4. pre/post check
   - stress
   - agitation
   - energy
   - sleepiness
   - body tension
   - overwhelm
   - self-criticism
   - burden / repeat intent / too activated / too sleepy

5. recommendation engine v1
   - rule-based + score-based
   - deterministic rationale
   - top 3 recommendation
   - explanation trace

6. insights v2
   - burden
   - repeat intent
   - pre/post delta
   - re-entry success
   - recommendation adoption
   - confidence and data volume

### 完了条件

- 2 / 3 / 5 / 10 分帯の複数 protocol が動く
- onboarding / precheck / postcheck がある
- recommendations API/UI が動く
- insights が trend + rationale を返す

## P2

### 目的

継続性、安全性、モバイル展開しやすさを仕上げる。

### 作業項目

1. safety by design
   - session 中 stop / shorter close / grounding actions
   - distress branch
   - crisis wording
   - difficult-person compassion gating

2. camera consent cleanup
   - explicit opt-in copy
   - session-only explanation
   - history / delete policy visibility
   - recommendation では visible facts only を維持

3. PWA / offline
   - offline protocol bundle
   - fallback TTS / text mode
   - service worker cache 戦略見直し
   - install copy 改善

4. mobile-ready architecture
   - UI 非依存 domain layer
   - shared schema
   - session / recommendation / analytics の分離

5. analytics / observability
   - event schema
   - rationale debug mode
   - prompt trace with redaction

### 完了条件

- safety action が session 中に使える
- camera は default OFF + consent 明示
- offline で最小 protocol が使える
- mobile 移植しやすい境界ができる

## 実装順序

### Phase 1

- docs audit
- rename
- auth env 化
- API cleanup
- migration scaffold

### Phase 2

- protocol registry
- session engine refactor
- old mode mapping
- minimum protocol set

### Phase 3

- onboarding
- pre/post checks
- recommendation engine
- insights overhaul

### Phase 4

- safety UI
- camera consent cleanup
- PWA/mobile polish
- docs/tests finish

## リスク

### 1. session refactor が front に強く食い込む

対策:
- protocol registry を先に作る
- first pass では legacy mode を adapter でぶら下げる

### 2. recommendation engine が data model 変更に依存する

対策:
- migration を P0 で先に入れる
- first release は null-safe fallback を許す

### 3. auth env 化で deploy が壊れやすい

対策:
- env validation を server/frontend で追加
- `.env.example` を先に拡張

### 4. safety copy が過剰になる

対策:
- crisis wording は分岐時のみ強める
- 平時は permission based の静かな文言に保つ

## 直近の実装着手順

1. `Ma -> komorebi` rename
2. auth env 化
3. `api.ts` fetch wrapper
4. migration scaffold
5. protocol registry 初版
