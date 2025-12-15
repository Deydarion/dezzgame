import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import MainMenu from './components/MainMenu'
import GamePage from './components/GamePage'
import { GameStats } from './types/game'
import './App.css'

function AppRouter() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [stats, setStats] = useState<GameStats>({
    playersOnline: 0,
    playersInQueue: 0,
    activeMatches: 0
  })

  useEffect(() => {
    // Get or create player ID from localStorage
    let playerId = localStorage.getItem('playerId')
    if (!playerId) {
      playerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
      localStorage.setItem('playerId', playerId)
    }

    // Connect to server
    const serverUrl = process.env.NODE_ENV === 'production'
      ? 'https://deezgame.ru'
      : 'http://localhost:3001'
    
    const newSocket = io(serverUrl, {
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity, // Бесконечные попытки переподключения
      reconnectionDelayMax: 5000, // Максимальная задержка между попытками
      timeout: 20000, // 20 seconds timeout
      forceNew: false,
      autoConnect: true
    })

    newSocket.on('connect', () => {
      console.log('Connected to server')
      setConnected(true)
      setConnectionError(null)
      
      // Register with player ID for reconnection
      newSocket.emit('registerPlayer', { playerId })
      
      // Request initial stats
      newSocket.emit('getStats')
      
      // Check if we have a match in URL
      const path = window.location.pathname
      const match = path.match(/\/game\/([^/]+)/)
      if (match) {
        const sessionId = match[1]
        newSocket.emit('reconnectToMatch', { sessionId, playerId })
      }
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      setConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error.message)
      console.error('Error details:', error)
      
      // Не показываем ошибки "Session ID unknown" - это нормально при переподключении
      if (error.message.includes('Session ID unknown') || error.message.includes('xhr poll error')) {
        console.log('Reconnecting... (Session ID unknown is normal after server restart)')
        setConnectionError(null) // Не показываем эту ошибку пользователю
        return
      }
      
      setConnected(false)
      
      // Показываем ошибку только для серьезных проблем
      if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED') || error.message.includes('Failed to fetch')) {
        if (process.env.NODE_ENV === 'production') {
          setConnectionError('⚠️ Подключение к серверу... Пожалуйста, подождите.')
        } else {
          setConnectionError('⚠️ Server is not running. Open a terminal and run: cd server && npm run dev')
        }
      } else if (!error.message.includes('Session ID unknown')) {
        // Показываем другие ошибки только если это не переподключение
        console.error('Connection error (will retry):', error.message)
      }
    })

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}...`)
      if (attemptNumber === 1) {
        setConnectionError('🔄 Переподключение к серверу...')
      }
    })

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected to server after ${attemptNumber} attempts`)
      setConnected(true)
      setConnectionError(null) // Убираем ошибку при успешном переподключении
      
      const playerId = localStorage.getItem('playerId')
      if (playerId) {
        newSocket.emit('registerPlayer', { playerId })
      }
      
      // Try to reconnect to match
      const path = window.location.pathname
      const match = path.match(/\/game\/([^/]+)/)
      if (match) {
        const sessionId = match[1]
        newSocket.emit('reconnectToMatch', { sessionId, playerId })
      }
    })

    newSocket.on('reconnect_failed', () => {
      console.error('Failed to reconnect after all attempts')
      setConnectionError('⚠️ Не удалось подключиться к серверу. Пожалуйста, обновите страницу.')
    })

    newSocket.on('stats', (newStats: GameStats) => {
      setStats(newStats)
    })

    setSocket(newSocket)

    // Request stats periodically
    const statsInterval = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('getStats')
      }
    }, 5000)

    return () => {
      clearInterval(statsInterval)
      newSocket.close()
    }
  }, [])

  return (
    <BrowserRouter>
      {connectionError && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#ef4444',
          color: 'white',
          padding: '1rem',
          textAlign: 'center',
          zIndex: 1000
        }}>
          {connectionError}
        </div>
      )}
      <Routes>
        <Route 
          path="/" 
          element={<MainMenu socket={socket} stats={stats} connected={connected} />} 
        />
        <Route 
          path="/game/:sessionId" 
          element={<GamePage socket={socket} />} 
        />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    <div className="app">
      <AppRouter />
    </div>
  )
}

export default App
