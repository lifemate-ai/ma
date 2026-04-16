# Recommendation Engine

更新日: 2026-04-16

## 方針

`komorebi` の recommendation は、最初から機械学習にしない。  
説明可能性を優先し、`rule-based + score-based` の deterministic engine で始める。

## 入力

- `user_goals`
- `user_preferences`
- recent sessions
- recent pre/post deltas
- lapse length
- time of day
- available time
- context tag
- completion history
- early stop history
- burden
- repeat intent
- recommendation adoption

## 出力

top 3 recommendation:

- `protocol_id`
- `duration`
- `rationale`
- `confidence`
- `caution_note` (optional)

## 基本ルール

### 1. lapse が長い

- low-burden な short re-entry を最優先
- `breath_foundation`, `breathing_space`, `stress_reset`, `checkin` を上げる
- 長尺の `body_scan` や introspective な protocol は下げる

### 2. agitation / overwhelm が高い

- grounding / body / eyes-open / concrete cue を優先
- `breath_foundation` は breath aversion がなければ候補
- `body_scan` は short contact-first 版のみ
- `open_awareness` は下げる
- `loving_kindness` の difficult-person 相当は出さない

### 3. energy low / sleepiness high

- `walking_mindfulness`
- `stress_reset`
- concrete sensory cue
- short duration

bedtime 文脈なら `sleep_winddown` を優先する。

### 4. self-criticism 高

- まず grounding
- 次に `self_compassion_break`
- `loving_kindness` は self / loved one までを優先

### 5. work context

- `breathing_space`
- `stress_reset`
- `breath_foundation`
- 2-3 分を優先

### 6. bedtime context

- `sleep_winddown`
- short `body_scan`
- sparse cue

### 7. repeated early stop

- 同 protocol の priority を一時的に下げる
- 隣接 practice を探索する

### 8. recent benefit high

- recent `calm_delta`, `presence_delta`, `self_kindness_delta`, `repeat_intent` が高い protocol を上げる
- ただし 100% 固定化せず、近接カテゴリを混ぜる

## スコア構造

## `scoreRecommendation(input, protocol)`

合成スコアの初期案:

- goal fit
- state fit
- time fit
- context fit
- recent benefit
- burden penalty
- early stop penalty
- novelty bonus
- safety penalty

### 疑似式

```text
score =
  goal_fit * w_goal +
  state_fit * w_state +
  time_fit * w_time +
  context_fit * w_context +
  recent_benefit * w_benefit +
  novelty_bonus * w_novelty -
  burden_penalty * w_burden -
  early_stop_penalty * w_early_stop -
  safety_penalty * w_safety
```

## rationale 生成

rationale は template-based にする。

例:

- `最近少し間が空いているので、まずは負担の軽い 2 分から戻れるものを選びました。`
- `いまは仕事の切り替えに近い文脈なので、短く区切れる breathing space を上に置いています。`
- `きょうは self-criticism が高めなので、まず落ち着きを作ってから self-compassion 系へつなげます。`

## confidence

confidence は「強いモデル確信」ではなく、入力データの十分さを示す。

上げる要因:

- recent sessions が多い
- pre/post data がある
- repeat_intent や burden が一貫している

下げる要因:

- 新規ユーザー
- data sparse
- conflicting signals

## trace log

dev 向けに次を残す:

- candidate protocols
- per-feature contribution
- selected duration
- selected rationale template

個人情報や free text は最小限にし、mask 可能にする。

## 実装ステップ

1. pure function の scoring module を作る
2. legacy mode を protocol id に map する
3. `/api/recommendations` を追加する
4. home UI に top 3 と quick-start を出す
