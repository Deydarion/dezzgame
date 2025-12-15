import { useEffect } from 'react'
import './ToastNotification.css'

interface ToastNotificationProps {
  message: string
  type?: 'info' | 'warning' | 'error' | 'success'
  duration?: number
  onClose: () => void
}

function ToastNotification({ 
  message, 
  type = 'info', 
  duration = 2000, 
  onClose 
}: ToastNotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={`toast-notification toast-${type}`}>
      <div className="toast-content">
        {message}
      </div>
    </div>
  )
}

export default ToastNotification

