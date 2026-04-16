const TIMED_MODES = [
    'yasashii',
    'motto_yasashii',
    'body_scan',
    'sbnrr',
    'compassion',
    'breathing_space',
    'self_compassion_break',
    'stress_reset',
    'sleep_winddown',
];
export function isInteractiveLegacyMode(mode) {
    return mode === 'emotion_mapping' || mode === 'gratitude' || mode === 'checkin';
}
export function isTimedSessionMode(mode) {
    return TIMED_MODES.includes(mode);
}
function pickDurationMinutes(requestedMinutes, durationsMinutes) {
    if (!requestedMinutes)
        return durationsMinutes[0];
    const exactOrLower = durationsMinutes
        .filter(duration => duration <= requestedMinutes)
        .sort((a, b) => b - a)[0];
    return exactOrLower ?? durationsMinutes[0];
}
function clampAtSeconds(atSeconds, durationSeconds) {
    return Math.max(0, Math.min(atSeconds, Math.max(0, durationSeconds - 8)));
}
function proportionalAt(durationSeconds, ratio) {
    return Math.max(0, Math.round(durationSeconds * ratio));
}
function cue(id, type, durationSeconds, atSeconds, text) {
    return {
        id,
        type,
        atSeconds: clampAtSeconds(atSeconds, durationSeconds),
        displayText: stripTags(text),
        ttsText: text,
    };
}
function stripTags(text) {
    return text.replace(/\[[^\]]+\]\s*/g, '').trim();
}
function closeCue(durationSeconds, text) {
    return cue('close', 'close', durationSeconds, durationSeconds - 14, text);
}
function bodyScanCues(durationSeconds) {
    const segments = durationSeconds >= 600
        ? [
            ['arrival', 0.0, '[calm][gently][slowly] 楽な姿勢で、いま体を支えている面を感じます。'],
            ['feet', 0.1, '[calm][softly] 足の裏、足首、ふくらはぎへ。感じにくくても、そのままで大丈夫。'],
            ['legs', 0.22, '[calm][gently] 膝から太ももへ。重さや接地の感じを、ただ受け取ります。'],
            ['pelvis', 0.36, '[calm][softly] 腰、お腹、骨盤まわりへ。呼吸で少し動く場所があれば、その変化だけ見ます。'],
            ['back', 0.5, '[calm][gently] 胸と背中へ。広がりや縮みがあるなら、押しつけずに気づきます。'],
            ['arms', 0.64, '[calm][softly] 両手、腕、肩へ。表面の触れ方や温度に戻っても大丈夫。'],
            ['neck', 0.78, '[calm][gently][slowly] 首、顔、頭のほうへ。力みがあれば、少しだけほどく余地を探します。'],
            ['whole', 0.9, '[calm][softly] 最後に、体全体をひとつのまとまりとして感じてみます。'],
        ]
        : [
            ['arrival', 0.0, '[calm][gently][slowly] 楽な姿勢で、いま体を支えている面を感じます。'],
            ['lower', 0.22, '[calm][softly] 足元から脚へ。重さや接地の感じに戻ります。'],
            ['middle', 0.5, '[calm][gently] お腹、胸、背中へ。息でわずかに動く場所を見ます。'],
            ['upper', 0.76, '[calm][softly] 肩、首、顔へ。感じにくくても、そのままで大丈夫。'],
            ['whole', 0.9, '[calm][gently][slowly] 体全体をひとつとして感じて、ここへ戻ります。'],
        ];
    return segments.map(([id, ratio, text]) => cue(String(id), id === 'whole' ? 'close' : 'orient', durationSeconds, proportionalAt(durationSeconds, Number(ratio)), String(text)));
}
const PROTOCOLS = {
    yasashii: {
        protocolId: 'breath_foundation',
        title: '呼吸に戻る',
        hintText: '呼吸でも、足の裏でも、支えとの接地でもいい。',
        durationsMinutes: [2, 3, 5, 10],
        voiceDensity: 'medium',
        visualStyle: 'breath',
        breathCueDisplays: ['吸って', '吐いて'],
        breathCueTts: null,
        breathCueIntervalSeconds: 4,
        closeMode: 'yasashii',
        buildCues: durationSeconds => [
            cue('arrival', 'arrival', durationSeconds, 0, '[calm][gently] 楽な姿勢で大丈夫です。[pause] 息か、足の裏か、支えに触れている感覚を一つ選びます。'),
            cue('anchor', 'anchor', durationSeconds, proportionalAt(durationSeconds, 0.34), '[calm][softly] 整えようとしなくて大丈夫。[pause] 気づいたたび、その場所へ戻ります。'),
            cue('normalize', 'normalize', durationSeconds, proportionalAt(durationSeconds, 0.72), '[calm][gently] それていたと気づいたら、それだけで十分です。[pause] 次の一息へ戻ります。'),
            closeCue(durationSeconds, '[calm][slowly] 最後の数呼吸だけ、このまま静かにいてみます。'),
        ],
    },
    motto_yasashii: {
        protocolId: 'open_awareness',
        title: 'ただ座る',
        hintText: '音、体、思考を押し返さず、広めに置いておく。',
        durationsMinutes: [2, 5, 10],
        voiceDensity: 'sparse',
        visualStyle: 'still',
        closeMode: 'motto_yasashii',
        buildCues: durationSeconds => [
            cue('arrival', 'arrival', durationSeconds, 0, '[calm][gently] 何かをうまくやろうとしなくて大丈夫です。[pause] ただ、ここに座っている感じから始めます。'),
            cue('widen', 'widen', durationSeconds, proportionalAt(durationSeconds, 0.38), '[calm][softly] 音、体の感覚、浮かぶ思考を、ひとつずつ追わずに置いておきます。'),
            cue('normalize', 'normalize', durationSeconds, proportionalAt(durationSeconds, 0.72), '[calm][gently] 狭くなっていたら、また少しだけ全体へ広げれば大丈夫。'),
            closeCue(durationSeconds, '[calm][slowly] ここから離れずに、終わりのほうへ移っていきます。'),
        ],
    },
    body_scan: {
        protocolId: 'body_scan',
        title: 'ボディスキャン',
        hintText: '感じにくい場所があっても、そのままでいい。',
        durationsMinutes: [3, 10, 20],
        voiceDensity: 'sparse',
        visualStyle: 'body',
        closeMode: 'body_scan',
        buildCues: bodyScanCues,
    },
    sbnrr: {
        protocolId: 'sbnrr',
        title: 'SBNRR',
        hintText: '止まる、呼吸、注意、反省、反応を順に短くたどる。',
        durationsMinutes: [2, 3, 5],
        voiceDensity: 'medium',
        visualStyle: 'still',
        closeMode: 'sbnrr',
        buildCues: durationSeconds => [
            cue('stop', 'arrival', durationSeconds, 0, '[calm][gently] まず、少しだけ止まります。今していたことから、半歩だけ引いてみます。'),
            cue('breathe', 'anchor', durationSeconds, proportionalAt(durationSeconds, 0.2), '[calm][softly] 次に、ひと呼吸ずつ。長くしなくて大丈夫です。'),
            cue('notice', 'inquiry', durationSeconds, proportionalAt(durationSeconds, 0.42), '[calm][gently] いま体に何があるか、気持ちに何があるか、静かに見ます。'),
            cue('reflect', 'transition', durationSeconds, proportionalAt(durationSeconds, 0.66), '[calm][softly] この場で本当に必要なのは、何を足すことか、何を減らすことか。少しだけ確かめます。'),
            closeCue(durationSeconds, '[calm][slowly] 最後に、次の一歩をひとつだけ選んで終えます。'),
        ],
    },
    compassion: {
        protocolId: 'loving_kindness',
        title: '思いを届ける',
        hintText: '言葉が合わなければ、自分の言い回しに変えていい。',
        durationsMinutes: [3, 5, 10],
        voiceDensity: 'medium',
        visualStyle: 'still',
        closeMode: 'compassion',
        buildCues: durationSeconds => [
            cue('self', 'arrival', durationSeconds, 0, '[warmly][gently] まずは自分へ。[pause] いまの私が、少しでも安全で、やわらいでいけますように。'),
            cue('loved', 'widen', durationSeconds, proportionalAt(durationSeconds, 0.3), '[warmly][softly] 次に、大切な誰かへ。[pause] その人にも、静かな安らぎがありますように。'),
            cue('neutral', 'widen', durationSeconds, proportionalAt(durationSeconds, 0.58), '[warmly][gently] 余裕があれば、ふだんすれ違う人にも。[pause] 同じように、穏やかさがありますように。'),
            closeCue(durationSeconds, '[warmly][slowly] 最後は、そのやわらかさを少しだけ自分にも戻して終えます。'),
        ],
    },
    breathing_space: {
        protocolId: 'breathing_space',
        title: 'Breathing Space',
        hintText: '気づく、集める、広げるを短く順番に。',
        durationsMinutes: [2, 3, 4],
        voiceDensity: 'medium',
        visualStyle: 'breath',
        breathCueDisplays: ['気づく', '戻る'],
        breathCueTts: null,
        breathCueIntervalSeconds: 6,
        closeMode: 'yasashii',
        buildCues: durationSeconds => [
            cue('notice', 'inquiry', durationSeconds, 0, '[calm][gently] まず、いま何があるかをそのまま見ます。[pause] 思考、気分、体の感じ。名前をつけなくても大丈夫。'),
            cue('gather', 'anchor', durationSeconds, proportionalAt(durationSeconds, 0.34), '[calm][softly] 次に、注意をひと呼吸ぶんだけ集めます。息でも、胸の動きでも、足の裏でも。'),
            cue('widen', 'widen', durationSeconds, proportionalAt(durationSeconds, 0.68), '[calm][gently] そこから、もう一度全体へ広げます。[pause] このまま次の場面へ戻れそうか、少しだけ確かめます。'),
            closeCue(durationSeconds, '[calm][slowly] 最後の一息で、ここから先へ持っていく感じをひとつ残します。'),
        ],
    },
    self_compassion_break: {
        protocolId: 'self_compassion_break',
        title: 'Self-Compassion Break',
        hintText: 'しんどさを認めて、少しだけやわらかく向ける。',
        durationsMinutes: [1, 2, 3],
        voiceDensity: 'medium',
        visualStyle: 'still',
        closeMode: 'compassion',
        buildCues: durationSeconds => [
            cue('acknowledge', 'arrival', durationSeconds, 0, '[warmly][gently] いま、少ししんどい。[pause] まずはその事実だけを認めます。'),
            cue('common_humanity', 'normalize', durationSeconds, proportionalAt(durationSeconds, 0.36), '[warmly][softly] こういう瞬間は、人に普通にあります。[pause] 私だけが変なわけではありません。'),
            cue('gentleness', 'carry_forward', durationSeconds, proportionalAt(durationSeconds, 0.68), '[warmly][gently] ここで自分に向ける言葉を、少しだけやわらかくします。今できる範囲で大丈夫。'),
            closeCue(durationSeconds, '[warmly][slowly] 最後に、次の一歩を責めずに選んで終えます。'),
        ],
    },
    stress_reset: {
        protocolId: 'stress_reset',
        title: 'Stress Reset',
        hintText: '仕事の途中でもできる、外向きの再定位。',
        durationsMinutes: [2, 3, 4],
        voiceDensity: 'medium',
        visualStyle: 'still',
        closeMode: 'yasashii',
        buildCues: durationSeconds => [
            cue('orient', 'arrival', durationSeconds, 0, '[calm][gently] いまいる場所を見ます。[pause] 視界、足元、椅子や床との接地を確かめます。'),
            cue('body', 'orient', durationSeconds, proportionalAt(durationSeconds, 0.3), '[calm][softly] 肩の力を少し抜いて、足の裏に重さを戻します。'),
            cue('breath', 'anchor', durationSeconds, proportionalAt(durationSeconds, 0.6), '[calm][gently] 呼吸は一息ぶんだけで十分です。[pause] 少しだけ長く吐いてみてもいい。'),
            closeCue(durationSeconds, '[calm][slowly] 最後に、このあとやる一手をひとつだけ決めて終えます。'),
        ],
    },
    sleep_winddown: {
        protocolId: 'sleep_winddown',
        title: 'Sleep Winddown',
        hintText: '眠れなくても失敗ではない。やわらぐ方向だけを見ていく。',
        durationsMinutes: [3, 5, 10],
        voiceDensity: 'sparse',
        visualStyle: 'body',
        closeMode: 'body_scan',
        buildCues: durationSeconds => [
            cue('arrival', 'arrival', durationSeconds, 0, '[calm][gently][slowly] 楽な姿勢で、体を預けられるところへ重さを渡していきます。'),
            cue('contact', 'orient', durationSeconds, proportionalAt(durationSeconds, 0.28), '[calm][softly] 布団や椅子に触れている面を、少し広めに感じます。'),
            cue('soften', 'normalize', durationSeconds, proportionalAt(durationSeconds, 0.58), '[calm][gently] 息に合わせて、ほどける場所があれば、そこだけやわらげます。眠ろうとしなくて大丈夫。'),
            closeCue(durationSeconds, '[calm][slowly] あとはこのまま、起きていても眠ってもよい形で終えていきます。'),
        ],
    },
};
export function buildSessionPlan(mode, requestedDurationMinutes) {
    const spec = PROTOCOLS[mode];
    const maxDurationMinutes = spec.durationsMinutes[spec.durationsMinutes.length - 1];
    const durationMinutes = requestedDurationMinutes && requestedDurationMinutes > maxDurationMinutes
        ? requestedDurationMinutes
        : pickDurationMinutes(requestedDurationMinutes, spec.durationsMinutes);
    const totalDurationSeconds = durationMinutes * 60;
    return {
        sessionMode: mode,
        protocolId: spec.protocolId,
        title: spec.title,
        hintText: spec.hintText,
        totalDurationSeconds,
        durationsMinutes: spec.durationsMinutes,
        voiceDensity: spec.voiceDensity,
        visualStyle: spec.visualStyle,
        breathCueDisplays: spec.breathCueDisplays,
        breathCueTts: spec.breathCueTts,
        breathCueIntervalSeconds: spec.breathCueIntervalSeconds,
        closeMode: spec.closeMode,
        cueSchedule: spec.buildCues(totalDurationSeconds).sort((a, b) => a.atSeconds - b.atSeconds),
        safetyActions: ['stop', 'shorter_close', 'open_eyes', 'grounding_return'],
    };
}
export function nextCueIndex(plan, elapsedSeconds) {
    return plan.cueSchedule.findIndex(cue => cue.atSeconds > elapsedSeconds);
}
export function extendSessionPlan(plan, elapsedSeconds) {
    const currentMinutes = Math.round(plan.totalDurationSeconds / 60);
    const nextMinutes = plan.durationsMinutes.find(duration => duration > currentMinutes);
    if (nextMinutes)
        return buildSessionPlan(plan.sessionMode, nextMinutes);
    const fallbackMinutes = Math.max(currentMinutes + (plan.totalDurationSeconds >= 300 ? 2 : 1), Math.ceil((elapsedSeconds + 45) / 60));
    return buildSessionPlan(plan.sessionMode, fallbackMinutes);
}
export function buildShorterCloseCue(plan) {
    return cue('shorter-close', 'safety', plan.totalDurationSeconds, 0, '[reassuring][gently] ここで短く切り上げて大丈夫です。[pause] 足元か椅子との接地へ戻って、あと少しだけ静かに終えていきます。');
}
export function buildGroundingReturnCue(plan) {
    return cue('grounding-return', 'safety', plan.totalDurationSeconds, 0, '[reassuring][gently] いったん足元へ戻ります。[pause] 目を開けても大丈夫。[pause] 足の裏か、触れている面をひとつ選んで、そこへ戻ります。');
}
export function buildOpenEyesCue(plan) {
    return cue('open-eyes', 'safety', plan.totalDurationSeconds, 0, '[reassuring][softly] 目を開けて大丈夫です。[pause] 視界の中の形や明るさを見て、ここにいる感じを少し戻します。');
}
