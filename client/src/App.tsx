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
    const newSocket = io('http://localhost:3001', {
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
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
      setConnected(false)
      
      if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED') || error.message.includes('Failed to fetch') || error.message.includes('server error')) {
        setConnectionError('⚠️ Server is not running. Open a terminal and run: cd server && npm run dev')
      } else {
        setConnectionError(`Connection error: ${error.message}`)
      }
      
      // Try to check if server is reachable
      fetch('http://localhost:3001/health')
        .then(async res => {
          const contentType = res.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json()
            console.log('Server health check:', data)
            setConnectionError(null) // Server is reachable, connection issue might be temporary
          } else {
            // Server returned HTML instead of JSON - probably wrong port or proxy issue
            console.error('Server returned HTML instead of JSON. Check if server is running on port 3001')
          }
        })
        .catch(err => {
          console.error('Server is not reachable. Make sure server is running on port 3001:', err.message)
        })
    })

    newSocket.on('reconnect', () => {
      console.log('Reconnected to server')
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
