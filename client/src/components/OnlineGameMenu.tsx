import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Socket } from 'socket.io-client'
import { OnlineMode } from '../types/game'
import './OnlineGameMenu.css'

interface OnlineGameMenuProps {
  socket: Socket | null
  onBack: () => void
}

function OnlineGameMenu({ socket, onBack }: OnlineGameMenuProps) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<OnlineMode | null>(null)
  const [matchCode, setMatchCode] = useState('')
  const [isQueued, setIsQueued] = useState(false)

  useEffect(() => {
    if (!socket) return

    const handleMatchCreated = (data: { sessionId: string; code?: string }) => {
      console.log('Match created:', data)
      navigate(`/game/${data.sessionId}`)
    }

    const handleMatchJoined = (data: { sessionId: string }) => {
      console.log('Match joined:', data)
      navigate(`/game/${data.sessionId}`)
    }

    const handleMatchQueued = (data: { message: string }) => {
      console.log('Match queued:', data.message)
      setIsQueued(true)
    }

    const handleMatchError = (error: { message: string }) => {
      console.error('Match error:', error.message)
      alert(error.message)
      setIsQueued(false)
    }

    socket.on('matchCreated', handleMatchCreated)
    socket.on('matchJoined', handleMatchJoined)
    socket.on('matchQueued', handleMatchQueued)
    socket.on('matchError', handleMatchError)

    return () => {
      socket.off('matchCreated', handleMatchCreated)
      socket.off('matchJoined', handleMatchJoined)
      socket.off('matchQueued', handleMatchQueued)
      socket.off('matchError', handleMatchError)
    }
  }, [socket, navigate])

  const handleCreateMatch = () => {
    if (socket) {
      console.log('Creating new match')
      setIsQueued(false)
      socket.emit('createMatch')
    }
  }

  const handleJoinByCode = () => {
    if (socket && matchCode.trim()) {
      console.log('Joining match by code:', matchCode)
      socket.emit('joinMatch', { code: matchCode.trim().toUpperCase() })
    }
  }

  const handleRandomMatch = () => {
    if (socket) {
      console.log('Finding random match')
      setIsQueued(true)
      socket.emit('findRandomMatch')
    }
  }

  const handleCancelQueue = () => {
    setIsQueued(false)
    // Note: Server will handle removing from queue on disconnect or new action
  }

  if (mode === 'join') {
    return (
      <div className="online-game-menu">
        <button className="back-button" onClick={() => setMode(null)}>
          ← Back
        </button>

        <div className="menu-content">
          <h2 className="menu-subtitle">Enter Match Code</h2>
          
          <div className="code-input-container">
            <input
              type="text"
              className="code-input"
              placeholder="Enter code"
              value={matchCode}
              onChange={(e) => setMatchCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoFocus
            />
          </div>

          <button
            className="start-button"
            onClick={handleJoinByCode}
            disabled={!matchCode.trim() || !socket}
          >
            Join Match
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="online-game-menu">
      <button className="back-button" onClick={onBack}>
        ← Back
      </button>

      <div className="menu-content">
        <h2 className="menu-subtitle">Online Game</h2>
        
        {isQueued ? (
          <div className="queue-status">
            <p>Waiting for opponent...</p>
            <button
              className="online-button"
              onClick={handleCancelQueue}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="online-buttons">
            <button
              className="online-button"
              onClick={handleCreateMatch}
              disabled={!socket}
            >
              Create Match
            </button>

            <button
              className="online-button"
              onClick={() => setMode('join')}
            >
              Join by Code
            </button>

            <button
              className="online-button"
              onClick={handleRandomMatch}
              disabled={!socket}
            >
              Random Match
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default OnlineGameMenu

