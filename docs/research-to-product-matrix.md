# Research to Product Matrix

更新日: 2026-04-16

## 方針

この文書は、`komorebi` の機能設計がどの研究知見に依拠しているかを整理するためのものです。重要なのは次の 3 点です。

1. 研究で支持される範囲だけを言う
2. 研究でまだ弱い部分は product 上も控えめに扱う
3. 「よさそうだから入れる」ではなく、「何を根拠にどこまで言えるか」を明確にする

## エビデンスの読み方

- `比較的強い`: メタ分析または複数 RCT による支持がある
- `中程度`: 個別 RCT や限定的メタ分析はあるが、対象や実装差が大きい
- `探索的`: 理論的整合性はあるが、直接エビデンスは弱い

## マトリクス

| Product area | 依拠する研究知見 | 何が言えるか | まだ言えないこと | Product implication |
| --- | --- | --- | --- | --- |
| 短時間の mindfulness practice | brief / self-administered mindfulness exercise は stress を下げうるが、効果量は modest で文脈依存 [2][3] | 2-10 分の短時間 practice は再入場を下げず、軽い stress reduction の入口になりうる | 短時間 practice だけで持続的・臨床的改善を断言できない | 2 / 3 / 5 / 10 分帯を first-class にし、再入場導線を最優先にする |
| mindfulness app | mindfulness app のメタ分析では depression / anxiety / negative emotion に小-中程度の改善が示される一方、研究数と質の制約がある [1] | app delivered mindfulness は「役に立つ可能性がある」 | 医療的有効性や全ユーザーへの一貫した大きな効果 | copy は「支えになることがある」水準に留める |
| breath foundation | 呼吸を anchor にする focused attention は mindfulness 系 protocol の中心構成要素 [6] | 呼吸 anchor は短時間 re-entry に向く | 呼吸がすべての人に安全・快適とは言えない | breath が合わない人向けに sound / contact / feet anchor を常備する |
| 3-minute breathing space | MBCT の定番 short structured pause として広く使われ、FA と OM を橋渡しする構造を持つ [6] | 切替用の短い structured pause として妥当 | 単独の 3-minute breathing space だけの効果量を強く一般化できない | 2 分版 / 3-4 分版を protocol 化し、work transition に出しやすくする |
| body scan | body scan 単独メタ分析では mindfulness への小さな改善はあるが、健康アウトカムへの単独効果は限定的 [5] | body scan は「感じる練習」の入口として使える | body scan 単独で広範な健康改善を約束できない | 長尺中心にせず、3 分の surface-contact 版と長尺版を分ける |
| open awareness / open monitoring | OM と FA はどちらも affective disturbance 改善に寄与しうるが、初心者や高覚醒時には扱いが難しい [6] | OM は慣れてきた人の practice variation として妥当 | agitated state で常に向いているとは言えない | overwhelm / agitation が高いときは推奨度を下げる |
| emotion labeling | affect labeling と距離化は情動調整の一部として整合的だが、この repo での現行 emotion mapping は研究由来の構造が薄い | 感情名 + 身体部位 + 強度 + 変化方向で軽く観察するのは妥当 | 深掘りすればするほど良いとは言えない | distress 高時は short label-only に留める |
| loving-kindness | LKI/LKM メタ分析では positive affect, compassion, negative affect などに改善が見られるが、active control 比較では差が弱まる [7][10] | loving-kindness は self-kindness や positive affect を支える option になりうる | 他の有効介入より常に優れる、誰にでも easy である | self -> loved one -> neutral を標準にし、difficult person は opt-in にする |
| self-compassion break | self-compassion interventions は self-criticism, depression, anxiety, stress の低下に一定の支持がある [8][9] | shame / self-criticism が高い人に短時間 self-compassion practice を出すのは整合的 | single-shot で十分、あるいは誰にでも刺さるとは言えない | grounding 後に 1-3 分の self-compassion break を出せるようにする |
| walking mindfulness / movement | mindful walking の個別試験は mixed で、効果が出る研究も null の研究もある [11][12] | 眠気・座り疲れ・仕事の合間向けの concrete option としては有望 | walking mindfulness が静坐 practice より優れている、誰にでも効く | energy low / sleepiness high に限定して提案し、過大主張しない |
| sleep winddown | MBIs は sleep disturbance 改善に比較的強い支持がある [13] | 眠前の body / breath / softness practice は妥当 | 不眠症治療の代替、医学的介入の代わり | bedtime context では sleep winddown を優先する |
| home practice / dose | MBCT/MBSR の home practice メタ分析では practice 量と outcome に小さいが有意な関連がある [4] | 続けることは大事だが、practice の価値をゼロにはできない | 厳密な最適分数や「長くやるほど必ずよい」を一般化して提示できない | streak pressure を避け、短い継続と low-burden re-entry を重視する |
| engagement / retention | mindfulness app の効果はある程度示されるが、研究でも adherence と attrition は課題 [1][4] | friction reduction と relevance 改善は重要 | guilt や streak 圧で健全に retention できるとは言えない | welcome back copy と short re-entry recommendation を優先する |
| pre/post measurement | 軽量 self-report は digital mental health の評価・適応に実務上有用 | brief ordinal pre/post check はプロダクト上妥当 | 長い尺度を毎回入れる必要はない | 0-4 の軽量 pre/post check を session に追加する |
| ecological momentary / JIT personalization | JITAI / EMI メタ分析では小さいが有意な効果があり、timely tailored support に将来性がある [14] | time / context / recent state に応じた lightweight personalization は妥当 | sensor-heavy personalization が必ず大きく効く、長期効果が十分確立した | まず rule-based recommendation を採用し、traceable な decision rules を持つ |
| safety / adverse events | meditation-related adverse effects は無視できず、anxiety, traumatic re-experiencing, emotional sensitivity が報告される [15] | 一部ユーザーには practice がしんどさを増やしうる | mindfulness は本質的に無害とは言えない | stop / shorter close / grounding escape / crisis copy を組み込む |
| trauma / high overwhelm | trauma-related symptom への mindfulness 系介入には一定の支持があるが、対象差が大きく慎重設計が必要 [16] | trauma-like signals では深掘りより grounding を優先するのが妥当 | app が trauma treatment を代替できる | difficult-person compassion や deep introspection を high-overwhelm 時に抑制する |
| privacy / data minimization | GDPR data minimisation と NIST privacy engineering は、必要最小限のデータ取得と privacy risk management を求める [17][18] | watch/camera は opt-in, session-limited, purpose-specific であるべき | 「将来使うかも」で広く集めてよい | camera は default OFF、送信理由と削除導線を UI に出す |

## 研究から見た設計上の含意

### 1. `komorebi` は「短時間でも戻れる」ことを product の中心に置く

短時間 practice は「軽い支え」としては十分意味がある一方、それだけで臨床的成果を約束する段階ではない。だからこそ `komorebi` は、重たいプログラムの代替を名乗るのではなく、2-10 分の再入場と継続しやすさを本丸に置く。

### 2. recommendation は novelty より personal fit を優先する

JITAI/EMI の文脈では「その瞬間に合った支援」が価値になる。最初から ML に飛ばず、`available time`, `agitation`, `sleepiness`, `overwhelm`, `context` を使った説明可能な rule engine が妥当。

### 3. compassion 系は良いが、押し付けると逆効果になりうる

loving-kindness や self-compassion には支持があるが、difficult person や深い自己受容をいきなり求めるのは product として雑。段階化と opt-in が必須。

### 4. safety は「最後に注意書きを足す」話ではない

adverse effect の存在を前提に、protocol selection, cue wording, stop actions, shorter close, grounding fallback を session engine に組み込む必要がある。

### 5. camera は personalization の補助信号であって真実判定器ではない

研究・実務の両面から、観察可能な事実だけを扱い、内面状態の断定はしない。privacy by default と visible-facts-only を同時に守る。

## 実装に落とすルール

1. 効果 claims は「support / may help / can be useful」の範囲に留める
2. protocol metadata に `canonical_lineage`, `target_states`, `caution_states` を持たせる
3. recommendation は rationale を deterministic に返す
4. distress high では introspection より grounding を選ぶ
5. user-facing copy で診断・断定をしない

## Sources

1. Effects of Mindfulness Exercise Guided by a Smartphone App on Negative Emotions and Stress in Non-Clinical Populations: A Systematic Review and Meta-Analysis. PubMed. https://pubmed.ncbi.nlm.nih.gov/35155341/
2. Self-administered mindfulness interventions reduce stress in a large, randomized controlled multi-site study. PubMed. https://pubmed.ncbi.nlm.nih.gov/38862815/
3. App-based mindfulness meditation reduces perceived stress and improves self-regulation in working university students: A randomised controlled trial. PubMed. https://pubmed.ncbi.nlm.nih.gov/34962055/
4. Home practice in Mindfulness-Based Cognitive Therapy and Mindfulness-Based Stress Reduction: A systematic review and meta-analysis of participants' mindfulness practice and its association with outcomes. PubMed. https://pubmed.ncbi.nlm.nih.gov/28527330/
5. The effects of body scan meditation: A systematic review and meta-analysis. PubMed. https://pubmed.ncbi.nlm.nih.gov/35538557/
6. The contributions of focused attention and open monitoring in mindfulness-based cognitive therapy for affective disturbances: A 3-armed randomized dismantling trial. PubMed. https://pubmed.ncbi.nlm.nih.gov/33434227/
7. The effects of loving-kindness interventions on positive and negative mental health outcomes: A systematic review and meta-analysis. PubMed. https://pubmed.ncbi.nlm.nih.gov/38652973/
8. Effectiveness of self-compassion-related interventions for reducing self-criticism: A systematic review and meta-analysis. PubMed. https://pubmed.ncbi.nlm.nih.gov/33749936/
9. Effects of Self-Compassion Interventions on Reducing Depressive Symptoms, Anxiety, and Stress: A Meta-Analysis. PubMed. https://pubmed.ncbi.nlm.nih.gov/37362192/
10. The effect of loving-kindness meditation on positive emotions: a meta-analytic review. PubMed. https://pubmed.ncbi.nlm.nih.gov/26579061/
11. Mindful walking in psychologically distressed individuals: a randomized controlled trial. PubMed. https://pubmed.ncbi.nlm.nih.gov/23983786/
12. Mindful Walking in Patients with Chronic Low Back Pain: A Randomized Controlled Trial. PubMed. https://pubmed.ncbi.nlm.nih.gov/35363058/
13. Mindfulness-Based Interventions Targeting Modifiable Lifestyle Behaviors Associated With Brain Health: A Systematic Review and Meta-Analysis. PubMed. https://pubmed.ncbi.nlm.nih.gov/39554975/
14. Effectiveness of just-in-time adaptive interventions for improving mental health and psychological well-being: a systematic review and meta-analysis. Frontiers in Digital Health. https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2025.1460167/pdf
15. Prevalence of meditation-related adverse effects in a population-based sample in the United States. PubMed. https://pubmed.ncbi.nlm.nih.gov/34074221/
16. Effects of mindfulness-based interventions on symptoms and interoception in trauma-related disorders and exposure to traumatic events: Systematic review and meta-analysis. PubMed. https://pubmed.ncbi.nlm.nih.gov/38636333/
17. European Commission. How much data can be collected? https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/principles-gdpr/how-much-data-can-be-collected_en
18. NIST. Privacy engineering. https://www.nist.gov/privacy-engineering
