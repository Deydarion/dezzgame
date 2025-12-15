import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Socket } from 'socket.io-client'
import { BotDifficulty } from '../types/game'
import './BotGameMenu.css'

interface BotGameMenuProps {
  socket: Socket | null
  onBack: () => void
}

function BotGameMenu({ socket, onBack }: BotGameMenuProps) {
  const navigate = useNavigate()
  const [selectedDifficulty, setSelectedDifficulty] = useState<BotDifficulty | null>(null)

  const difficulties: { value: BotDifficulty; label: string }[] = [
    { value: 'easy', label: 'Легко' },
    { value: 'medium', label: 'Средне' },
    { value: 'hard', label: 'Сложно' }
  ]

  useEffect(() => {
    if (!socket) return

    const handleMatchCreated = (data: { sessionId: string; code?: string }) => {
      console.log('Bot game created:', data)
      navigate(`/game/${data.sessionId}`)
    }

    socket.on('matchCreated', handleMatchCreated)

    return () => {
      socket.off('matchCreated', handleMatchCreated)
    }
  }, [socket, navigate])

  const handleStart = () => {
    if (selectedDifficulty && socket) {
      console.log('Starting bot game with difficulty:', selectedDifficulty)
      socket.emit('startBotGame', { difficulty: selectedDifficulty })
    }
  }

  return (
    <div className="bot-game-menu">
      <button className="back-button" onClick={onBack}>
        ← Назад
      </button>

      <div className="menu-content">
        <h2 className="menu-subtitle">Выберите сложность</h2>
        
        <div className="difficulty-buttons">
          {difficulties.map((diff) => (
            <button
              key={diff.value}
              className={`difficulty-button ${
                selectedDifficulty === diff.value ? 'selected' : ''
              }`}
              onClick={() => setSelectedDifficulty(diff.value)}
            >
              {diff.label}
            </button>
          ))}
        </div>

        <button
          className="start-button"
          onClick={handleStart}
          disabled={!selectedDifficulty || !socket}
        >
          Начать игру
        </button>
      </div>
    </div>
  )
}

export default BotGameMenu

