# Privacy and Safety

更新日: 2026-04-16

## 基本原則

### Privacy by default

- camera watch は default OFF
- opt-in 時に何を送るかを説明する
- session 中だけ使う
- purpose は companion support に限定する
- visible facts only を守る

### Safety by design

- いつでも止められる
- つらくなったら短く切り上げられる
- high agitation / overwhelm では grounding を優先する
- crisis support の代替を名乗らない

## 研究・実務上の根拠

- meditation-related adverse effects は無視できないため、安全退避導線が必要
- GDPR data minimisation は必要最小限の取得を求める
- NIST privacy engineering は privacy risk management を設計段階から扱うことを求める

詳細な source は [`docs/research-to-product-matrix.md`](./research-to-product-matrix.md) を参照。

## 現状の実装

### できていること

- camera watch は明示操作で有効化
- observation prompt は visible facts only を採用
- companion memory に continuity を持たせている

### まだ足りないこと

- consent copy の明文化
- watch history / delete policy UI
- session 中の stop / shorter close / grounding action 常設
- safety event logging
- crisis wording の分岐

## 直近でやること

1. session UI に stop / shorter close / grounding action を常設
2. camera opt-in copy と policy link を追加
3. safety event を DB へ記録
4. recommendation で high-overwhelm 時の protocol 抑制を入れる
