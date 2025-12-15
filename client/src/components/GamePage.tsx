import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Socket } from 'socket.io-client'
import GameBoard from './GameBoard'
import { GameState } from '../types/game'
import './GamePage.css'

interface GamePageProps {
  socket: Socket | null
}

function GamePage({ socket }: GamePageProps) {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [matchStatus, setMatchStatus] = useState<'loading' | 'connected' | 'error'>('loading')
  const [matchInfo, setMatchInfo] = useState<{
    sessionId: string
    code?: string
    status: string
    players: number
    maxPlayers: number
  } | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  const copyMatchCode = () => {
    if (matchInfo?.code) {
      navigator.clipboard.writeText(matchInfo.code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  const copyMatchLink = () => {
    const link = `${window.location.origin}/game/${sessionId}`
    navigator.clipboard.writeText(link)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  useEffect(() => {
    if (!socket || !sessionId) {
      setMatchStatus('error')
      return
    }

    const handleMatchReconnected = (data: { sessionId: string }) => {
      console.log('Match reconnected:', data)
      setMatchStatus('connected')
      socket.emit('getCurrentMatch')
    }

    const handleMatchJoined = (data: { sessionId: string }) => {
      console.log('Match joined via link:', data)
      setMatchStatus('connected')
      socket.emit('getCurrentMatch')
    }

    const handleReconnectError = (error: { message: string }) => {
      console.error('Reconnect error:', error.message)
      // Try to join as new player if reconnect failed
      if (sessionId) {
        console.log('Trying to join match by ID...')
        socket.emit('joinMatchById', { sessionId })
      } else {
        setMatchStatus('error')
      }
    }

    const handleCurrentMatch = (data: {
      sessionId: string
      code?: string
      status: string
      players: number
      maxPlayers: number
    }) => {
      setMatchInfo(data)
      setMatchStatus('connected')
      
      // Request game state if match is ready
      if (data.players === data.maxPlayers && socket) {
        socket.emit('getGameState', { sessionId: data.sessionId })
      }
    }

    const handleNoMatch = () => {
      setMatchStatus('error')
    }

    const handlePlayerJoined = (data: { sessionId: string }) => {
      console.log('Player joined:', data)
      socket.emit('getCurrentMatch')
    }

    const handleGameStarted = (data: { sessionId: string; gameState: GameState }) => {
      console.log('Game started:', data)
      setGameState(data.gameState)
      setMatchStatus('connected')
    }

    const handleDiceRolled = (data: { roll: number; playerId: string; gameState: GameState }) => {
      console.log('Dice rolled:', data)
      setGameState(data.gameState)
    }

    const handleMoveApplied = (data: { move: any; playerId: string; captured: string[]; winner: string | null; gameState: GameState }) => {
      console.log('Move applied:', data)
      setGameState(data.gameState)
      if (data.winner) {
        console.log('Winner:', data.winner)
      }
    }

    const handleTurnEnded = (data: { gameState: GameState }) => {
      console.log('Turn ended:', data)
      setGameState(data.gameState)
    }

    const handleGameState = (data: { gameState: GameState }) => {
      setGameState(data.gameState)
    }

    const handleGameError = (error: { message: string }) => {
      console.error('Game error:', error.message)
    }

    socket.on('matchReconnected', handleMatchReconnected)
    socket.on('matchJoined', handleMatchJoined)
    socket.on('reconnectError', handleReconnectError)
    socket.on('matchError', (error: { message: string }) => {
      console.error('Match error:', error.message)
      setMatchStatus('error')
    })
    socket.on('currentMatch', handleCurrentMatch)
    socket.on('noMatch', handleNoMatch)
    socket.on('playerJoined', handlePlayerJoined)
    socket.on('gameStarted', handleGameStarted)
    socket.on('diceRolled', handleDiceRolled)
    socket.on('moveApplied', handleMoveApplied)
    socket.on('turnEnded', handleTurnEnded)
    socket.on('gameState', handleGameState)
    socket.on('gameError', handleGameError)

    // Wait for socket to be connected before trying to join
    if (socket.connected) {
      // Try to get current match first
      socket.emit('getCurrentMatch')
      
      // Then try to reconnect or join
      if (sessionId) {
        const playerId = localStorage.getItem('playerId')
        socket.emit('reconnectToMatch', { sessionId, playerId })
        // Request game state
        socket.emit('getGameState', { sessionId })
      }
    } else {
      // Wait for connection
      socket.once('connect', () => {
        socket.emit('getCurrentMatch')
        if (sessionId) {
          const playerId = localStorage.getItem('playerId')
          socket.emit('reconnectToMatch', { sessionId, playerId })
          // Request game state
          socket.emit('getGameState', { sessionId })
        }
      })
    }

    return () => {
      socket.off('matchReconnected', handleMatchReconnected)
      socket.off('matchJoined', handleMatchJoined)
      socket.off('reconnectError', handleReconnectError)
      socket.off('matchError')
      socket.off('currentMatch', handleCurrentMatch)
      socket.off('noMatch', handleNoMatch)
      socket.off('playerJoined', handlePlayerJoined)
      socket.off('gameStarted', handleGameStarted)
      socket.off('diceRolled', handleDiceRolled)
      socket.off('moveApplied', handleMoveApplied)
      socket.off('turnEnded', handleTurnEnded)
      socket.off('gameState', handleGameState)
      socket.off('gameError', handleGameError)
    }
  }, [socket, sessionId])

  if (matchStatus === 'loading') {
    return (
      <div className="game-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Connecting to match...</p>
        </div>
      </div>
    )
  }

  if (matchStatus === 'error') {
    return (
      <div className="game-page">
        <div className="error-container">
          <h2>Match Not Found</h2>
          <p>The match you're looking for doesn't exist or has ended.</p>
          <button className="back-button" onClick={() => navigate('/')}>
            Back to Menu
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back
        </button>
        {matchInfo?.code && (
          <div className="match-code-container">
            <div className="match-code">
              Code: <span>{matchInfo.code}</span>
              <button 
                className="copy-button" 
                onClick={copyMatchCode}
                title="Copy code"
              >
                {codeCopied ? '✓' : '📋'}
              </button>
            </div>
            <button 
              className="copy-link-button"
              onClick={copyMatchLink}
            >
              {codeCopied ? 'Link Copied!' : 'Copy Link'}
            </button>
          </div>
        )}
      </div>

      <div className="game-container">
        <div className="game-info">
          <p>Match ID: {sessionId}</p>
          <p>Status: {matchInfo?.status || 'unknown'}</p>
          <p>Players: {matchInfo?.players || 0}/{matchInfo?.maxPlayers || 2}</p>
        </div>

        <div className="game-board-container">
          {matchInfo?.players === matchInfo?.maxPlayers ? (
            <GameBoard 
              socket={socket}
              sessionId={sessionId || ''}
              gameState={gameState}
              playerId={socket?.id || null}
            />
          ) : (
            <div className="waiting-container">
              <p>Waiting for players: {matchInfo?.players || 0}/{matchInfo?.maxPlayers || 2}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GamePage

