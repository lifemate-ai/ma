# Migration Notes

更新日: 2026-04-16

## Branding

- user-facing brand を `Ma` から `komorebi` へ変更した
- 更新対象:
  - `ma-web/index.html`
  - `ma-web/vite.config.ts`
  - `README.md`
  - `ma-server/src/companion/prompt.rs`

## Storage key migration

frontend では legacy key を新 key へ自動移行する。

- `ma_id_token` -> `komorebi_id_token`
- `ma_refresh_token` -> `komorebi_refresh_token`
- `ma:stats` -> `komorebi:stats`

## Auth configuration

hardcoded Cognito config をやめて env 化した。

server:

- `AUTH_MODE`
- `COGNITO_REGION`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `DEV_AUTH_SUB`
- `DEV_AUTH_EMAIL`

frontend:

- `VITE_AUTH_MODE`
- `VITE_COGNITO_DOMAIN`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_COGNITO_REDIRECT_URI`

## Data model scaffold

additive migration として次を追加した。

- `user_preferences`
- `user_goals`
- `session_precheck`
- `session_postcheck`
- `session_events`
- `recommendation_log`
- `safety_events`

既存の `sessions`, `journals`, `checkins` は保持したまま拡張する方針。
