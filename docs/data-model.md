# Data Model

更新日: 2026-04-16

## 既存テーブル

- `sessions`
- `journals`
- `checkins`
- `companion_state`
- `companion_memories`
- `companion_observations`

## 追加した migration scaffold

`ma-server/src/journal.rs` の migration に、次の additive table を追加した。

### `user_preferences`

- `preferred_durations_json`
- `preferred_voice_density`
- `eyes_open_preference`
- `posture_preferences_json`
- `favorite_protocols_json`
- `watch_opt_in`
- `reminder_prefs_json`

### `user_goals`

- `stress`
- `focus`
- `sleep`
- `kindness`
- `emotional_regulation`
- `general_presence`

### `session_precheck`

- `session_id`
- `stress`
- `agitation`
- `energy`
- `sleepiness`
- `body_tension`
- `overwhelm`
- `self_criticism`
- `available_minutes`
- `context_tag`

### `session_postcheck`

- `session_id`
- `calm_delta_self_report`
- `presence_delta`
- `self_kindness_delta`
- `burden`
- `too_activated`
- `too_sleepy`
- `repeat_intent`

### `session_events`

- `event_type`
- `event_time_offset_ms`
- `payload_json`

### `recommendation_log`

- `recommended_protocol`
- `rationale`
- `input_snapshot_json`
- `accepted_bool`
- `session_id`
- `confidence`

### `safety_events`

- `event_type`
- `trigger_source`
- `action_taken`
- `resolved_bool`

## 設計意図

1. 既存 `sessions/journals/checkins` を壊さない
2. personalization に必要な最小テーブルを先に用意する
3. recommendation / insights / safety が同じ event 基盤を共有できるようにする

## 未実装

- CRUD handler
- typed API schema
- retention / deletion policy 連携
- event taxonomy の確定
