import { CheckCircle2, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

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
    setItems((prev) => [...prev.slice(-2), { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), tone === 'error' ? 6000 : 3000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'border-border bg-surface shadow-pop flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm',
              item.tone === 'error' && 'border-danger text-danger',
            )}
          >
            {item.tone === 'error' ? (
              <XCircle size={16} aria-hidden />
            ) : (
              <CheckCircle2 size={16} className="text-success" aria-hidden />
            )}
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
