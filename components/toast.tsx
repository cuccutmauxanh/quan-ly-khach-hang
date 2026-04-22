'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

type Toast = {
  id: number
  type: ToastType
  message: string
}

type ToastContextType = {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counterRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id))

  const icons = {
    success: <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />,
    error:   <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />,
    info:    <Info className="w-4 h-4 text-blue-500 shrink-0" />,
  }
  const colors = {
    success: 'border-green-200 bg-green-50',
    error:   'border-red-200 bg-red-50',
    info:    'border-blue-200 bg-blue-50',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm text-gray-700 pointer-events-auto max-w-sm animate-in slide-in-from-bottom-2 ${colors[t.type]}`}>
            {icons[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="hover:opacity-70">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
