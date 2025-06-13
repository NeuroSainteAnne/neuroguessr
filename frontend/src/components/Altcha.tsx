import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'

interface AltchaProps {
  onStateChange?: (ev: Event | CustomEvent) => void
}

const Altcha = forwardRef<{ value: string | null }, AltchaProps>(({ onStateChange }, ref) => {
  const widgetRef = useRef<any>(null)
  const [value, setValue] = useState<string | null>(null)

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
  }, [onStateChange])

  if (typeof window === 'undefined') {
    return <div className="altcha-placeholder">Loading CAPTCHA...</div>
  }

  return (
    <altcha-widget
      ref={widgetRef}
      style={{
        '--altcha-max-width': '100%',
      }}
      challengeurl="/api/altcha/challenge"
    ></altcha-widget>
  )
})

export default Altcha