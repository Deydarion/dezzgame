import { useEffect, useState } from 'react'
import './WinnerPopup.css'

interface WinnerPopupProps {
  winner: string | null
  isMe: boolean
  onClose: () => void
}

function WinnerPopup({ winner, isMe, onClose }: WinnerPopupProps) {
  const [confetti, setConfetti] = useState<Array<{ id: number; x: number; delay: number; color: string }>>([])

  useEffect(() => {
    // Generate confetti pieces
    const pieces = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'][Math.floor(Math.random() * 6)]
    }))
    setConfetti(pieces)
  }, [])

  if (!winner) return null

  return (
    <div className="winner-popup-overlay" onClick={onClose}>
      <div className="winner-popup" onClick={(e) => e.stopPropagation()}>
        <div className="confetti-container">
          {confetti.map((piece) => (
            <div
              key={piece.id}
              className="confetti-piece"
              style={{
                left: `${piece.x}%`,
                animationDelay: `${piece.delay}s`,
                backgroundColor: piece.color
              }}
            />
          ))}
        </div>
        
        <div className="winner-content">
          <h1 className="winner-title">
            {isMe ? '🎉 ПОБЕДА! 🎉' : `Игрок ${winner} победил!`}
          </h1>
          <p className="winner-message">
            {isMe 
              ? 'Поздравляем! Вы завершили все 4 фигуры!' 
              : `В следующий раз повезет!`
            }
          </p>
          <button className="winner-close-button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

export default WinnerPopup

