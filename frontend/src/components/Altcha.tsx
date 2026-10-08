import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { useApp } from '../context/AppContext'
import "altcha"
import type {} from 'altcha/types/react' // Import types for altcha-react

interface AltchaProps {
  onStateChange?: (ev: Event | CustomEvent) => void
}

const Altcha = forwardRef<{ value: string | null }, AltchaProps>(({ onStateChange }, ref) => {
  const widgetRef = useRef<any>(null)
  const [value, setValue] = useState<string | null>(null)
  const { currentLanguage } = useApp()

  useImperativeHandle(ref, () => ({
    get value() {
      return value
    }
  }), [value])

  useEffect(() => {    
    const handleStateChange = (ev: Event) => {
      if ('detail' in ev) {
        setValue((ev as CustomEvent).detail.payload || null)
        onStateChange?.(ev)
      }
    }

    const { current } = widgetRef

    if (current) {
      current.addEventListener('statechange', handleStateChange)
      return () => current.removeEventListener('statechange', handleStateChange)
    }
    return undefined;
  }, [onStateChange])

  if (typeof window === 'undefined') {
    return <div className="altcha-placeholder">Loading CAPTCHA...</div>
  }

  return (
    <altcha-widget
      ref={widgetRef}
      language={currentLanguage}
      style={{
        '--altcha-max-width': '100%',
      }}
      challenge="/api/altcha/challenge"
    />
  )
})

export default Altcha