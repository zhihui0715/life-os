import { CheckCircle2, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

import { play } from '../../lib/sound'
import { cn } from './cn'

type Tone = 'success' | 'error'
interface ToastItem {
  id: number
  message: string
  tone: Tone
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})

/** Small confirmation messages after actions. Announced to screen readers via aria-live. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random()
    if (tone === 'error') play('error')
    setItems((prev) => [...prev.slice(-2), { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), tone === 'error' ? 6000 : 3000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              // An inverted capsule, like iOS system banners
              'toast-enter bg-fg text-bg shadow-float flex max-w-md items-center gap-2.5 rounded-full py-2.5 pr-5 pl-3.5 text-[14px] font-medium',
              item.tone === 'error' && 'bg-danger text-white',
            )}
          >
            {item.tone === 'error' ? (
              <XCircle size={18} className="shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 size={18} className="text-success-fill shrink-0" aria-hidden />
            )}
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
