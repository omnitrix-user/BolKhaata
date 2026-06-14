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
  const settledRef = useRef(false) // exactly one of onResult/onError per session
  const abortingRef = useRef(false) // true when WE stop on purpose (close/unmount)

  const stop = useCallback(() => {
    try { recRef.current?.stop() } catch { /* noop */ }
  }, [])

  // Fully release any previous recognition before a new one. Chrome allows only
  // ONE live SpeechRecognition holding the mic per page; an orphaned instance
  // keeps the audio device and makes the next start() fail instantly with
  // "no audio". We detach its handlers (so its onend/onerror can't settle the
  // NEW session) and abort it.
  const teardown = () => {
    const old = recRef.current
    if (!old) return
    old.onresult = null
    old.onerror = null
    old.onend = null
    try { old.abort() } catch { /* noop */ }
    recRef.current = null
  }

  const startWithLang = useCallback((useLang, isFallback = false) => {
    if (!SR) { onError?.('micUnsupported'); return }
    teardown()
    const rec = new SR()
    rec.lang = useLang
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    finalRef.current = ''
    gotResultRef.current = false
    settledRef.current = false
    abortingRef.current = false
    setInterim('')

    // Settle this recognition session exactly once. Prevents the classic bug
    // where a successful command is followed by a spurious "didn't catch that"
    // when onend/onerror fire after we've already delivered the result.
    const settle = (fn, arg) => {
      if (settledRef.current) return
      settledRef.current = true
      fn?.(arg)
    }

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
      // Deliberate stop (component closing) OR a result already arrived ->
      // never surface an error. 'aborted' is fired by our own abort().
      if (err === 'aborted' || abortingRef.current || gotResultRef.current) return
      if (err === 'not-allowed') settle(onError, 'micDenied')
      else if (err === 'no-speech') settle(onError, 'noAudio')
      // Mac/Chrome: Google speech service temporarily unavailable for the chosen
      // locale. Retry once with en-IN before giving up.
      else if (err === 'language-not-supported' && !isFallback) {
        startWithLang('en-IN', true)
      }
      // Brave & some browsers disable the Google speech backend -> network /
      // service-not-allowed / audio-capture. Treat as "voice unavailable here".
      else if (err === 'network' || err === 'service-not-allowed' || err === 'audio-capture' || err === 'language-not-supported') settle(onError, 'micUnsupported')
      else settle(onError, 'notUnderstood')
    }
    rec.onend = () => {
      setRecording(false)
      setInterim('')
      const text = finalRef.current.trim()
      if (text) settle(onResult, text)
      // Only complain when nothing was heard AND we didn't stop on purpose.
      else if (!gotResultRef.current && !abortingRef.current) settle(onError, 'noAudio')
    }

    recRef.current = rec
    try {
      rec.start()
      setRecording(true)
    } catch {
      setRecording(false)
      settle(onError, 'noAudio')
    }
  }, [lang, onResult, onError]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => startWithLang(lang), [lang, startWithLang])

  useEffect(() => () => {
    abortingRef.current = true
    teardown()
  }, [])

  return { supported: !!SR, recording, interim, start, stop }
}
