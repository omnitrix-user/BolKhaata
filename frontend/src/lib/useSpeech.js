import { useCallback, useEffect, useRef, useState } from 'react'

// Browser-native speech recognition (Web Speech API) — free, no server, works
// great on Android Chrome. Falls back gracefully where unsupported (e.g. some
// desktop Firefox) via the `supported` flag so the UI can show the type box.
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export function useSpeech({ lang = 'hi-IN', onResult, onError }) {
  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef(null)
  const finalRef = useRef('')
  const gotResultRef = useRef(false)

  const stop = useCallback(() => {
    try { recRef.current?.stop() } catch { /* noop */ }
  }, [])

  const start = useCallback(() => {
    if (!SR) { onError?.('micUnsupported'); return }
    const rec = new SR()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    finalRef.current = ''
    gotResultRef.current = false
    setInterim('')

    rec.onresult = (e) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i]
        if (tr.isFinal) { finalRef.current += tr[0].transcript; gotResultRef.current = true }
        else interimText += tr[0].transcript
      }
      setInterim(interimText)
    }
    rec.onerror = (e) => {
      setRecording(false)
      const err = e.error
      if (err === 'not-allowed') onError?.('micDenied')
      else if (err === 'no-speech') onError?.('noAudio')
      // Brave & some browsers disable the Google speech backend -> network /
      // service-not-allowed / audio-capture. Treat as "voice unavailable here".
      else if (err === 'network' || err === 'service-not-allowed' || err === 'audio-capture') onError?.('micUnsupported')
      else onError?.('notUnderstood')
    }
    rec.onend = () => {
      setRecording(false)
      setInterim('')
      const text = finalRef.current.trim()
      if (text) onResult?.(text)
      else if (!gotResultRef.current) onError?.('notUnderstood')
    }

    recRef.current = rec
    try {
      rec.start()
      setRecording(true)
    } catch {
      setRecording(false)
      onError?.('notUnderstood')
    }
  }, [lang, onResult, onError])

  useEffect(() => () => { try { recRef.current?.abort() } catch { /* noop */ } }, [])

  return { supported: !!SR, recording, interim, start, stop }
}
