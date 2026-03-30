let ctx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let currentMediaAudio: HTMLAudioElement | null = null
let currentMediaResolve: (() => void) | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** 再生中の音声（TTS/ストリーム）を即座に停止 */
export function stopCurrentAudio() {
  if (currentSource) {
    try { currentSource.stop() } catch {}
    currentSource = null
  }
  if (currentMediaAudio) {
    const audio = currentMediaAudio
    currentMediaAudio = null
    const resolve = currentMediaResolve
    currentMediaResolve = null
    audio.pause()
    audio.src = ''
    audio.load()
    resolve?.()
  }
}

/** おりんのベル音をWebAudioで生成（MP3ファイル不要） */
export function playBell(type: 'mid' | 'end' = 'end') {
  stopCurrentAudio()
  const ac = getCtx()
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain)
  gain.connect(ac.destination)

  osc.frequency.value = type === 'end' ? 432 : 528
  osc.type = 'sine'

  const now = ac.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.4, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 3.5)

  osc.start(now)
  osc.stop(now + 3.5)
}

/** ElevenLabsから受け取ったMP3を再生（前の音声は止める）
 *  isCancelled を渡すと decodeAudioData 完了後に再チェックし、キャンセルなら再生しない */
export async function playAudioBuffer(buffer: ArrayBuffer, isCancelled?: () => boolean): Promise<void> {
  stopCurrentAudio()
  const ac = getCtx()
  const decoded = await ac.decodeAudioData(buffer)
  if (isCancelled?.()) return // decode中にキャンセルされた
  const source = ac.createBufferSource()
  source.buffer = decoded
  source.connect(ac.destination)
  currentSource = source
  source.start()
  return new Promise(resolve => {
    source.onended = () => {
      if (currentSource === source) currentSource = null
      resolve()
    }
  })
}

/**
 * ストリーミングTTSをMediaSource APIで再生。
 * fetchFn はリクエストを送る関数を受け取り、到着したチャンクから即再生開始する。
 * MediaSource非対応（Firefox等）は通常バッファ再生にフォールバック。
 */
export async function playAudioStream(fetchFn: () => Promise<Response>): Promise<void> {
  stopCurrentAudio()

  const canStream = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')
  if (!canStream) {
    // フォールバック: 全バイト受け取ってから再生
    const res = await fetchFn().catch(() => null)
    if (!res || !res.ok) return
    const buf = await res.arrayBuffer().catch(() => null)
    if (buf) await playAudioBuffer(buf)
    return
  }

  return new Promise<void>((resolve) => {
    const ms = new MediaSource()
    const audio = new Audio()
    const objUrl = URL.createObjectURL(ms)
    audio.src = objUrl
    currentMediaAudio = audio

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      cleanup()
      resolve()
    }

    const cleanup = () => {
      URL.revokeObjectURL(objUrl)
      if (currentMediaAudio === audio) currentMediaAudio = null
      if (currentMediaResolve && currentMediaAudio !== audio) currentMediaResolve = null
    }

    currentMediaResolve = finish

    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('error', finish, { once: true })

    ms.addEventListener('sourceopen', async () => {
      let sb: SourceBuffer
      try {
        sb = ms.addSourceBuffer('audio/mpeg')
      } catch {
        finish()
        return
      }

      const appendChunk = (chunk: Uint8Array): Promise<void> =>
        new Promise(r => {
          sb.addEventListener('updateend', () => r(), { once: true })
          sb.appendBuffer(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
        })

      try {
        const res = await fetchFn()
        if (!res.ok || !res.body) {
          try { ms.endOfStream('network') } catch {}
          finish()
          return
        }

        const reader = res.body.getReader()
        let playStarted = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (currentMediaAudio !== audio) { reader.cancel(); break }
          await appendChunk(value)
          if (!playStarted) {
            playStarted = true
            audio.play().catch(() => {})
          }
        }

        if (ms.readyState === 'open') {
          try { ms.endOfStream() } catch {}
        }
      } catch {
        try { ms.endOfStream('network') } catch {}
        finish()
      }
    }, { once: true })
  })
}

/** ArrayBufferをデコードしてAudioBufferに（複数回再生可能な形式） */
export async function decodeBuffer(buf: ArrayBuffer): Promise<AudioBuffer | null> {
  return getCtx().decodeAudioData(buf).catch(() => null)
}

/** デコード済みAudioBufferを再生（fire-and-forget）前の音声は止める */
export function playDecoded(buf: AudioBuffer): void {
  stopCurrentAudio()
  const ac = getCtx()
  const source = ac.createBufferSource()
  source.buffer = buf
  source.connect(ac.destination)
  currentSource = source
  source.start()
  source.onended = () => { if (currentSource === source) currentSource = null }
}

/** AudioContextのsuspend解除（ユーザージェスチャー後に呼ぶ） */
export function resumeAudio() {
  if (ctx?.state === 'suspended') ctx.resume()
}
