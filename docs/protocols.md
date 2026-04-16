# Protocols

更新日: 2026-04-16

## 目的

`komorebi` の practice は、画面実装に埋まった mode ではなく、共有可能な protocol definition として持つ。

初期 registry は [`shared/protocols/registry.json`](../shared/protocols/registry.json) に置く。将来は web / server / mobile から同じ definition を参照できる形へ寄せる。

## 現在の protocol registry

初版で定義した protocol:

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
- `sbnrr`

## 各 protocol の最低メタデータ

- `id`
- `display_name`
- `category`
- `description`
- `canonical_lineage`
- `target_states`
- `caution_states`
- `default_durations`
- `cue_density`
- `voice_style_hints`
- `timeline_template`
- `preconditions`
- `post_session_prompts`
- `metrics_hooks`

## Legacy mode mapping

既存 mode 名は [`shared/protocols/legacy-mode-map.json`](../shared/protocols/legacy-mode-map.json) で新 protocol id へ対応づける。

初期対応:

- `yasashii` -> `breath_foundation`
- `motto_yasashii` -> `open_awareness`
- `body_scan` -> `body_scan`
- `sbnrr` -> `sbnrr`
- `emotion_mapping` -> `emotion_labeling`
- `gratitude` -> `loving_kindness`
- `compassion` -> `loving_kindness`
- `checkin` -> `checkin`

`gratitude` は独立 protocol として残す選択肢もあるが、現フェーズでは compassion family と再編する前提で仮マップしている。

## 次の実装ステップ

1. `ProtocolDefinition` と `SessionPlan` の runtime schema を front に追加
2. registry から duration variant を選ぶ planner を入れる
3. current `session.ts` の fixed 2-min flow を registry-driven cue schedule へ置換する
