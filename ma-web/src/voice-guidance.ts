import { tts, ttsStreamFetch } from './api'
import { playAudioBuffer, playAudioStream } from './audio'

export type VoiceIntent =
  | 'greeting'
  | 'guide'
  | 'closing'
  | 'reflection'
  | 'prompt'
  | 'transition'
  | 'mantra'

const AUDIO_TAG_PATTERN = /\[[^\]]*\]/g

const DEFAULT_TAGS: Record<VoiceIntent, string> = {
  greeting: '[calm][warmly][slowly]',
  guide: '[calm][gently][slowly]',
  closing: '[calm][warmly][slowly]',
  reflection: '[calm][gently]',
  prompt: '[calm][softly][slowly]',
  transition: '[calm][softly]',
  mantra: '[calm][gently][slowly]',
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function ensureEnding(text: string): string {
  if (!text) return text
  return /[。！？!?]$/.test(text) ? text : `${text}。`
}

function hasAudioTags(text: string): boolean {
  return /^\s*(\[[^\]]+\]\s*)+/.test(text)
}

function supportsStreamTts(): boolean {
  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')
}

export function stripAudioTags(text: string): string {
  return normalizeWhitespace(text.replace(AUDIO_TAG_PATTERN, ' '))
}

export function toDisplayText(text: string, fallback = ''): string {
  const cleaned = stripAudioTags(text)
  return cleaned || fallback
}

export function toVoiceText(text: string, intent: VoiceIntent): string {
  const cleaned = normalizeWhitespace(text)
  if (!cleaned) return ''
  if (hasAudioTags(cleaned)) return cleaned
  return `${DEFAULT_TAGS[intent]} ${ensureEnding(cleaned)}`
}

export async function speakText(
  text: string,
  intent: VoiceIntent,
  opts?: { isCancelled?: () => boolean; preferStream?: boolean },
): Promise<void> {
  const isCancelled = opts?.isCancelled
  if (isCancelled?.()) return

  const voiceText = toVoiceText(text, intent)
  if (!voiceText) return

  if (opts?.preferStream !== false && supportsStreamTts()) {
    try {
      await playAudioStream(ttsStreamFetch(voiceText))
      return
    } catch {}
  }

  if (isCancelled?.()) return
  const audio = await tts(voiceText).catch(() => null)
  if (!audio || isCancelled?.()) return
  await playAudioBuffer(audio, isCancelled)
}
