import { useEffect, useRef, type ReactNode } from 'react'

interface OperationDialogProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  icon?: ReactNode
}

/**
 * Shared dialog wrapper that handles modal overlay, title bar,
 * close button, escape key, and click-outside to close.
 * Uses the same "import-overlay" CSS classes as the existing dialogs.
 */
export function OperationDialog({ title, subtitle, onClose, children, icon }: OperationDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="import-overlay" onClick={handleOverlayClick} ref={overlayRef} style={{ cursor: 'default' }}>
      <div className="row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
        </div>
        <button className="secondary" onClick={onClose}>Cancel</button>
      </div>
      {children}
    </div>
  )
}
