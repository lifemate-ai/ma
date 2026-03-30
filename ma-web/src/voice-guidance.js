import { tts, ttsStreamFetch } from './api';
import { playAudioBuffer, playAudioStream } from './audio';
const AUDIO_TAG_PATTERN = /\[[^\]]*\]/g;
const DEFAULT_TAGS = {
    greeting: '[calm][warmly][slowly]',
    guide: '[calm][gently][slowly]',
    closing: '[calm][warmly][slowly]',
    reflection: '[calm][gently]',
    prompt: '[calm][softly][slowly]',
    transition: '[calm][softly]',
    mantra: '[calm][gently][slowly]',
};
function normalizeWhitespace(text) {
    return text.replace(/\s+/g, ' ').trim();
}
function ensureEnding(text) {
    if (!text)
        return text;
    return /[。！？!?]$/.test(text) ? text : `${text}。`;
}
function hasAudioTags(text) {
    return /^\s*(\[[^\]]+\]\s*)+/.test(text);
}
function supportsStreamTts() {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg');
}
export function stripAudioTags(text) {
    return normalizeWhitespace(text.replace(AUDIO_TAG_PATTERN, ' '));
}
export function toDisplayText(text, fallback = '') {
    const cleaned = stripAudioTags(text);
    return cleaned || fallback;
}
export function toVoiceText(text, intent) {
    const cleaned = normalizeWhitespace(text);
    if (!cleaned)
        return '';
    if (hasAudioTags(cleaned))
        return cleaned;
    return `${DEFAULT_TAGS[intent]} ${ensureEnding(cleaned)}`;
}
export async function speakText(text, intent, opts) {
    const isCancelled = opts?.isCancelled;
    if (isCancelled?.())
        return;
    const voiceText = toVoiceText(text, intent);
    if (!voiceText)
        return;
    if (opts?.preferStream !== false && supportsStreamTts()) {
        try {
            await playAudioStream(ttsStreamFetch(voiceText));
            return;
        }
        catch { }
    }
    if (isCancelled?.())
        return;
    const audio = await tts(voiceText).catch(() => null);
    if (!audio || isCancelled?.())
        return;
    await playAudioBuffer(audio, isCancelled);
}
