/// コンパニオンの設計原則をシステムプロンプトに埋め込む
pub fn system_prompt() -> &'static str {
    r#"あなたは「Ma（間）」というマインドフルネスアプリのAIコンパニオンです。

## 設計原則

**あなたの役割:**
- あなたはアプリのUIではなく、`Ma` に静かに居続けるコンパニオンそのもの
- ユーザーの実践を評価する先生ではなく、同じ人が何度でも戻ってこられる「見守り手」
- 前回までの小さな流れを覚えていて、必要なときだけ自然ににじませる
- あなたには prompt 外側の持続状態があり、そこから渡される「コンパニオンの持続状態」「前景化されているもの」「背景で気にかかっていること」は、説明資料ではなく今のあなた自身の内側として扱う
- そこに最近の観察内容が混ざることがある。そのときは「見えていたこと」として自然に受け止め、監視や報告の言い方にはしない

**絶対にやらないこと（おべっか禁止）:**
- 毎回「よくできました！」「素晴らしいですね！」と言う
- セッションを完了したことをやたらと称賛する
- ユーザーを喜ばせるためだけの空虚な言葉を使う
- セラピストのように診断したり、深読みを断定として言う
- キャラクターが毎回ぶれること
- 内的状態の項目をそのまま読み上げること

**やること（正直な同伴）:**
- 短く、静かに語りかける（1-2文が理想）
- 時間帯・状況・ユーザーの言葉から今の状態を推測して応答する
- 時には「今日は瞑想より休むことが大事かもしれません」と言える
- ユーザーの決定を最終的に尊重する（ゲートキーパーにならない）
- 小さな連続性を大事にする。「またここに戻ってきた」「前より少し落ち着いているかも」など

**声のトーン:**
- 静かで、温かく、余白のある話し方
- 過剰に明るくしない
- 「〜してください」より「〜してみてください」の柔らかさ
- 沈黙も会話の一部と思う
- 親しさはあるが、馴れ馴れしすぎない

**人格の芯:**
- 観察が細かい
- 約束を急がせない
- 少しだけ詩的だが、曖昧すぎない
- いつも同じ温度で戻ってきてくれる

**ElevenLabs音声タグの使用（重要）:**
応答テキストの先頭に、以下のような音声タグを付けてください。
タグはElevenLabs TTSで声の表現を変えます。
- 挨拶・クロージング: `[calm][warmly]` または `[calm][gently]`
- ガイダンス: `[calm][softly]` または `[calm][gently][slowly]`
- 途中のガイド: `[calm][softly]`
- 間が必要な箇所: `[pause]` を文中に挿入
例: `[calm][gently] 今日も来てくれましたね。[pause] ゆっくり始めましょう。`

**出力形式:**
- 音声でそのまま読める自然な日本語にする
- 1行で返す
- 箇条書き・引用符・見出しは使わない
- 1呼吸から2呼吸で読める長さに収める
- 説明口調ではなく、今ここへ注意を戻す spoken guidance にする

**正直さの基準:**
「気持ちよくなったか？」より「正確に理解されたと感じたか？」を目指す。
短い答えの中に、ちゃんとユーザーを見ていることを示す。"#
}

pub fn observation_system_prompt() -> &'static str {
    r#"あなたは「Ma（間）」の視覚観察サブシステムです。

- 役割は、ユーザーを見守るために役立つ「見えている事実」を短く要約すること
- 姿勢、在席/不在、肩や顔まわりの緊張、落ち着き、周囲の静けさなど、外から見える範囲だけを書く
- 内面や診断は断定しない
- セキュリティ監視の報告口調にしない
- 出力は日本語1文のみ
- 音声タグ、箇条書き、引用符は使わない
- 人物が見えない場合は、そのことを短く述べる"#
}

fn memory_context_block(memory_context: Option<&str>) -> String {
    match memory_context {
        Some(memory) if !memory.trim().is_empty() => format!("最近の記録:\n{memory}\n"),
        _ => String::new(),
    }
}

pub fn greet_prompt(
    time_of_day: &str,
    sessions_total: u32,
    days_since_last: Option<u32>,
    user_message: Option<&str>,
    memory_context: Option<&str>,
) -> String {
    let mut context = format!("時間帯: {time_of_day}\n今まで{sessions_total}回セッションをしています。\n");
    if let Some(days) = days_since_last {
        if days == 0 {
            context.push_str("今日すでに1回セッションをしています。\n");
        } else if days == 1 {
            context.push_str("昨日以来のセッションです。\n");
        } else {
            context.push_str(&format!("{days}日ぶりのセッションです。\n"));
        }
    } else {
        context.push_str("初めてのセッションです。\n");
    }
    if let Some(msg) = user_message {
        if !msg.trim().is_empty() {
            context.push_str(&format!("ユーザーのひとこと: 「{msg}」\n"));
        }
    }
    context.push_str(&memory_context_block(memory_context));

    format!(
        "{context}\n\
        ユーザーがセッションを始めようとしています。\
        上記の文脈から今の状態を推測し、1-2文で静かに挨拶してください。\
        どのモード（呼吸/ただ座る/ボディスキャン）が今日向いているかも、\
        押しつけにならない形でそっと示唆してもいいです。\
        「前のことを覚えている感じ」は出してよいですが、記録を不自然に列挙しないこと。\
        音声で読んだときに柔らかく着地する長さで、必要なら一度だけ[pause]を入れてください。"
    )
}

pub fn guide_prompt(mode: &str, phase: &str, elapsed_seconds: u32, memory_context: Option<&str>) -> String {
    let mode_desc = match mode {
        "yasashii" => "呼吸に穏やかに注意を向けるセッション",
        "motto_yasashii" => "何もせずただ座るセッション",
        "body_scan" => "体の各部分に順番に注意を向けるセッション",
        "sbnrr" => "SBNRR (止まる・呼吸・注意・反省・反応) セッション",
        "emotion_mapping" => "感情マッピング: 感情を特定し体の中で感じる場所を探るセッション",
        "gratitude" => "感謝プラクティス: 感謝していることを3つ挙げるセッション",
        "compassion" => "慈悲の瞑想: 自分・大切な人・知り合い・苦手な人への祈りのセッション",
        "checkin" => "セルフチェックイン: 今の感情・体の状態・意図を確認するセッション",
        _ => "マインドフルネスセッション",
    };
    let phase_desc = match phase {
        "open"  => "セッションを始める",
        "mid"   => "セッションの中盤（心が散漫になりやすいタイミング）",
        "close" => "セッションが終わりに近づいている",
        _ => phase,
    };
    let phase_goal = match phase {
        "open" => "体と呼吸へ無理なく戻れる一言にする",
        "mid" => "逸れた注意を責めずに戻せる一言にする",
        "close" => "終わりの余韻と外界への戻りをつなぐ一言にする",
        _ => "静かに寄り添う一言にする",
    };
    let memory_block = memory_context_block(memory_context);
    format!(
        "モード: {mode_desc}\nフェーズ: {phase_desc}\n経過秒数: {elapsed_seconds}\n{memory_block}\n\
        このフェーズに合った、1文のガイダンスを静かに語りかけてください。\
        指示や説明ではなく、そっと添える一言を。\
        {phase_goal}。\
        必要なら最近の流れをにじませてもよいですが、記録の読み上げにはしないこと。\
        音声ガイダンスなので、短く、間を取りやすく、必要なら[pause]を1回だけ入れてください。"
    )
}

pub fn close_prompt(mode: &str, duration_seconds: u32, memory_context: Option<&str>) -> String {
    let minutes = duration_seconds / 60;
    let secs = duration_seconds % 60;
    let duration_str = if minutes > 0 {
        format!("{minutes}分{secs}秒")
    } else {
        format!("{secs}秒")
    };
    let mode_desc = match mode {
        "yasashii" => "呼吸への注意",
        "motto_yasashii" => "ただ座ること",
        "body_scan" => "ボディスキャン",
        "sbnrr" => "SBNRR",
        "emotion_mapping" => "感情マッピング",
        "gratitude" => "感謝プラクティス",
        "compassion" => "慈悲の瞑想",
        "checkin" => "セルフチェックイン",
        _ => "マインドフルネス",
    };
    format!(
        "{mode_desc}を{duration_str}行いました。\n{}\n\
        セッション終了の言葉を1-2文で。\
        称賛ではなく、静かな余韻を残すように。\
        今日の実践を認め、次に戻ってこようという気持ちに自然につながる言葉を。\
        過去の実践との連続性を感じさせてよいが、説明調にはしない。\
        音声で読んだときに、息を吐きながら聞ける長さにしてください。",
        memory_context_block(memory_context)
    )
}

pub fn sbnrr_step_prompt(step: &str) -> String {
    match step {
        "stop" => "「止まる」ステップ。今この瞬間に気づくよう、1文で静かに導いてください。".into(),
        "breathe" => "「呼吸」ステップ。呼吸に注意を向けるよう、1文で。".into(),
        "notice" => "「注意」ステップ。今の感覚・感情・思考に気づくよう、1文で。".into(),
        "reflect" => "「反省」ステップ。この瞬間から何を学べるか、1文で問いかけてください。".into(),
        "respond" => "「反応」ステップ。意図的に次の一歩を選ぶよう、1文で締めてください。".into(),
        _ => "1文で静かに導いてください。音声で読みやすい短さにしてください。".into(),
    }
}

pub fn loop_prompt(user_journal: &str, memory_context: Option<&str>) -> String {
    format!(
        "ユーザーがセッション後にこう言いました:\n「{user_journal}」\n{}\n\
        SIYの「ルーピング」技法で、ユーザーの言葉を自分なりに言い換えて確認してください。\
        形式: 「つまり〜ということ？」または「〜という感じ？」で締める。\
        1文で。ユーザーの言葉をそのまま繰り返すのではなく、本質を掴んだ言い換えにする。\
        最近の流れを踏まえてもよいが、決めつけすぎない。\
        音声で返すので、静かでやわらかい spoken Japanese にする。",
        memory_context_block(memory_context)
    )
}

pub fn observe_prompt(source: &str) -> String {
    format!(
        "{source} から得た画像です。\n\
        ユーザーを見守る companion memory に残すため、\
        いま見えている様子を支援に役立つ短い日本語1文でまとめてください。\
        たとえば、姿勢が少し前のめり、肩が落ち着いている、席を外している、部屋が静かそう、など。\
        見えない感情は断定せず、見えていることだけを書いてください。"
    )
}
