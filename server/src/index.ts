import express from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import cors from 'cors'
import { MatchService } from './services/MatchService'
import { GameEngine } from './services/GameEngine'
import { BotService } from './services/BotService'
import { BotDifficulty, Move } from './types/game'

const PORT = process.env.PORT || 3001

const app = express()
const httpServer = createServer(app)

// CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['*']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
})

app.use(cors())
app.use(express.json())

// Initialize match service
const matchService = new MatchService()

// Health check endpoint
app.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.json({ status: 'ok', timestamp: new Date().toISOString(), port: PORT })
})

// Broadcast stats to all connected clients
const broadcastStats = () => {
  const stats = matchService.getStats()
  io.emit('stats', stats)
}

// Handle server-level errors
io.engine.on('connection_error', (err) => {
  console.error(`[${new Date().toISOString()}] Connection error:`, err)
})

// Socket.IO connection handling
io.on('connection', (socket: Socket) => {
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`)
  
  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Socket error for ${socket.id}:`, error)
  })

  try {
    // Default registration
    matchService.registerPlayer(socket.id)
    broadcastStats()
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error registering player on connection:`, error)
  }
  
  // Handle reconnection or join by sessionId
  socket.on('reconnectToMatch', (data: { sessionId: string; playerId?: string }) => {
    try {
      // First try to reconnect (if player was already in match)
      let match = matchService.reconnectPlayer(socket.id, data.sessionId)
      
      if (match) {
        const reconnectedMatch = match
        socket.emit('matchReconnected', { sessionId: reconnectedMatch.sessionId })
        // Notify other players
        reconnectedMatch.players.forEach(playerId => {
          if (playerId !== socket.id) {
            io.to(playerId).emit('playerReconnected', { sessionId: reconnectedMatch.sessionId })
          }
        })
        return
      }
      
      // If reconnect failed, try to join as new player (if match exists and has space)
      const existingMatch = matchService.getMatch(data.sessionId)
      match = existingMatch || null
      if (match && match.code && !match.isBotGame) {
        // Try to join by code
        const joinedMatch = matchService.joinMatch(socket.id, match.code)
        if (joinedMatch) {
          socket.emit('matchJoined', { sessionId: joinedMatch.sessionId })
          // Notify other players
          joinedMatch.players.forEach(playerId => {
            if (playerId !== socket.id) {
              io.to(playerId).emit('playerJoined', { sessionId: joinedMatch.sessionId })
            }
          })
          
          // If match is ready, notify all players that game started
          if (joinedMatch.status === 'in_progress' && joinedMatch.gameState) {
            joinedMatch.players.forEach(playerId => {
              io.to(playerId).emit('gameStarted', {
                sessionId: joinedMatch.sessionId,
                gameState: joinedMatch.gameState
              })
            })
          }
          
          broadcastStats()
          return
        }
      }
      
      // If both failed, match doesn't exist or is full
      socket.emit('reconnectError', { message: 'Match not found, full, or invalid' })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in reconnectToMatch:`, error)
      socket.emit('reconnectError', { message: 'Internal server error' })
    }
  })

  // Register player (with optional playerId for reconnection)
  socket.on('registerPlayer', (data?: { playerId?: string }) => {
    try {
      matchService.registerPlayer(socket.id, data?.playerId)
      broadcastStats()
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in registerPlayer:`, error)
    }
  })

  // Get stats
  socket.on('getStats', () => {
    const stats = matchService.getStats()
    socket.emit('stats', stats)
  })

  // Get current match
  socket.on('getCurrentMatch', () => {
    const match = matchService.getPlayerMatch(socket.id)
    if (match) {
      socket.emit('currentMatch', {
        sessionId: match.sessionId,
        code: match.code,
        status: match.status,
        players: match.players.length,
        maxPlayers: match.maxPlayers
      })
    } else {
      socket.emit('noMatch', {})
    }
  })

  // Create match
  socket.on('createMatch', () => {
    const match = matchService.createMatch(socket.id)
    socket.emit('matchCreated', {
      sessionId: match.sessionId,
      code: match.code
    })
    broadcastStats()
  })

  // Start bot game
  socket.on('startBotGame', (data: { difficulty: BotDifficulty }) => {
    const match = matchService.createMatch(socket.id, true, data.difficulty)
    socket.emit('matchCreated', {
      sessionId: match.sessionId,
      code: match.code
    })
    
    // Send game started event with initial state
    if (match.gameState) {
      socket.emit('gameStarted', {
        sessionId: match.sessionId,
        gameState: match.gameState
      })
      
      // Check if it's bot's turn and make bot move
      const engine = matchService.getGameEngine(match.sessionId)
      if (engine) {
        const state = engine.getState()
        const currentPlayer = engine.getCurrentPlayer()
        const botPlayer = state.players.find(p => p.id.startsWith('bot_'))
        
        console.log(`[${new Date().toISOString()}] Bot game started. Current player: ${currentPlayer.id}, Bot player: ${botPlayer?.id}`)
        
        // If it's bot's turn, make bot move
        if (botPlayer && currentPlayer.id === botPlayer.id) {
          console.log(`[${new Date().toISOString()}] Bot's turn, making move...`)
          setTimeout(() => {
            makeBotMove(match.sessionId, data.difficulty)
          }, 500)
        }
      }
    }
    
    broadcastStats()
  })

  // Join match by code
  socket.on('joinMatch', (data: { code: string }) => {
    const match = matchService.joinMatch(socket.id, data.code)
    
    if (match) {
      socket.emit('matchJoined', { sessionId: match.sessionId })
      
      // Notify other players in the match
      match.players.forEach(playerId => {
        if (playerId !== socket.id) {
          io.to(playerId).emit('playerJoined', { sessionId: match.sessionId })
        }
      })
      
      // If match is ready, notify all players that game started
      if (match.status === 'in_progress' && match.gameState) {
        match.players.forEach(playerId => {
          io.to(playerId).emit('gameStarted', {
            sessionId: match.sessionId,
            gameState: match.gameState
          })
        })
      }
    } else {
      socket.emit('matchError', { message: 'Match not found or full' })
    }
    
    broadcastStats()
  })

  // Join match by sessionId (for direct URL access)
  socket.on('joinMatchById', (data: { sessionId: string }) => {
    const match = matchService.getMatch(data.sessionId)
    
    if (!match) {
      socket.emit('matchError', { message: 'Match not found' })
      return
    }

    if (match.code) {
      const result = matchService.joinMatch(socket.id, match.code)
      if (result) {
        socket.emit('matchJoined', { sessionId: result.sessionId })
        match.players.forEach(playerId => {
          if (playerId !== socket.id) {
            io.to(playerId).emit('playerJoined', { sessionId: result.sessionId })
          }
        })
      } else {
        socket.emit('matchError', { message: 'Match is full' })
      }
    } else {
      socket.emit('matchError', { message: 'Cannot join bot match' })
    }
    
    broadcastStats()
  })

  // Find random match
  socket.on('findRandomMatch', () => {
    const match = matchService.findRandomMatch(socket.id)
    
    if (match) {
      socket.emit('matchJoined', { sessionId: match.sessionId })
      
      // Notify other players in the match
      match.players.forEach(playerId => {
        if (playerId !== socket.id && !playerId.startsWith('bot_')) {
          io.to(playerId).emit('playerJoined', { sessionId: match.sessionId })
        }
      })
      
      // If match is ready, notify all players that game started
      if (match.status === 'in_progress' && match.gameState) {
        match.players.forEach(playerId => {
          if (!playerId.startsWith('bot_')) {
            io.to(playerId).emit('gameStarted', {
              sessionId: match.sessionId,
              gameState: match.gameState
            })
          }
        })
      }
    } else {
      socket.emit('matchQueued', { message: 'Waiting for opponent...' })
    }
    
    broadcastStats()
  })

  // Game logic handlers
  socket.on('rollDice', (data: { sessionId: string }) => {
    try {
      const engine = matchService.getGameEngine(data.sessionId)
      if (!engine) {
        socket.emit('gameError', { message: 'Game not found or not started' })
        return
      }

      const currentPlayer = engine.getCurrentPlayer()
      if (currentPlayer.id !== socket.id) {
        socket.emit('gameError', { message: 'Not your turn' })
        return
      }

      const roll = engine.rollDice()
      let state = engine.getState()
      matchService.updateGameState(data.sessionId, state)

      // Check if there are any legal moves
      const legalMoves = engine.getLegalMoves(socket.id)
      console.log(`[${new Date().toISOString()}] Player ${socket.id} rolled ${roll}, legal moves: ${legalMoves.length}, phase: ${state.phase}`)
      
      // Broadcast dice roll to all players FIRST
      const match = matchService.getMatch(data.sessionId)
      if (match) {
        match.players.forEach(playerId => {
          if (playerId && !playerId.startsWith('bot_')) {
            io.to(playerId).emit('diceRolled', {
              roll,
              playerId: socket.id,
              gameState: state,
              hasLegalMoves: legalMoves.length > 0
            })
          }
        })
      }
      
      // If no legal moves, automatically end turn
      if (legalMoves.length === 0 && state.phase !== 'roll') {
        console.log(`[${new Date().toISOString()}] No legal moves after roll, ending turn`)
        engine.endTurn()
        state = engine.getState()
        matchService.updateGameState(data.sessionId, state)
        
        // Broadcast turn ended
        if (match) {
          match.players.forEach(playerId => {
            if (playerId && !playerId.startsWith('bot_')) {
              io.to(playerId).emit('turnEnded', { gameState: state })
            }
          })
          
          // If bot game, trigger bot move with delay so player can see their roll result
          if (match.isBotGame && match.botDifficulty) {
            setTimeout(() => {
              const checkEngine = matchService.getGameEngine(data.sessionId)
              if (checkEngine) {
                const checkState = checkEngine.getState()
                const checkBotPlayer = checkState.players.find(p => p.id.startsWith('bot_'))
                const checkCurrentPlayer = checkEngine.getCurrentPlayer()
                console.log(`[${new Date().toISOString()}] After player roll end: currentPlayer=${checkCurrentPlayer.id}, botPlayer=${checkBotPlayer?.id}`)
                if (checkBotPlayer && checkCurrentPlayer.id === checkBotPlayer.id) {
                  console.log(`[${new Date().toISOString()}] Bot's turn after player roll, calling makeBotMove`)
                  makeBotMove(data.sessionId, match.botDifficulty!)
                }
              }
            }, 1500) // Longer delay so player can see what they rolled
          }
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in rollDice:`, error)
      socket.emit('gameError', { message: 'Failed to roll dice' })
    }
  })

  socket.on('getLegalMoves', (data: { sessionId: string }) => {
    try {
      const engine = matchService.getGameEngine(data.sessionId)
      if (!engine) {
        socket.emit('gameError', { message: 'Game not found or not started' })
        return
      }

      // Only return legal moves if it's this player's turn
      const currentPlayer = engine.getCurrentPlayer()
      if (currentPlayer.id !== socket.id) {
        // Not this player's turn, return empty moves
        socket.emit('legalMoves', { moves: [], gameState: engine.getState() })
        return
      }

      const moves = engine.getLegalMoves(socket.id)
      socket.emit('legalMoves', { moves, gameState: engine.getState() })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in getLegalMoves:`, error)
      socket.emit('gameError', { message: 'Failed to get legal moves' })
    }
  })

  socket.on('applyMove', (data: { sessionId: string; move: Move }) => {
    try {
      const engine = matchService.getGameEngine(data.sessionId)
      if (!engine) {
        socket.emit('gameError', { message: 'Game not found or not started' })
        return
      }

      // Check if it's this player's turn
      const currentPlayer = engine.getCurrentPlayer()
      if (currentPlayer.id !== socket.id) {
        socket.emit('gameError', { message: 'Not your turn' })
        return
      }

      const success = engine.applyMove(socket.id, data.move)
      if (!success) {
        socket.emit('gameError', { message: 'Invalid move' })
        return
      }

      // Resolve captures
      const captured = engine.resolveCaptures()
      
      // Check for win
      const winner = engine.checkWin()
      
      const state = engine.getState()
      matchService.updateGameState(data.sessionId, state)

      // Broadcast to all players
      const match = matchService.getMatch(data.sessionId)
      if (match) {
        match.players.forEach(playerId => {
          io.to(playerId).emit('moveApplied', {
            move: data.move,
            playerId: socket.id,
            captured,
            winner,
            gameState: state
          })
        })
      }

      // End turn if not won
      if (!winner) {
        engine.endTurn()
        const newState = engine.getState()
        matchService.updateGameState(data.sessionId, newState)
        
        if (match) {
          match.players.forEach(playerId => {
            // Only emit to real players, not bot
            if (playerId && !playerId.startsWith('bot_')) {
              io.to(playerId).emit('turnEnded', { gameState: newState })
            }
          })
        }

        // If bot game, make bot move
        if (match?.isBotGame && match.botDifficulty) {
          console.log(`[${new Date().toISOString()}] Player move ended, checking if bot should move...`)
          setTimeout(() => {
            const checkEngine = matchService.getGameEngine(data.sessionId)
            if (checkEngine) {
              const checkState = checkEngine.getState()
              const checkBotPlayer = checkState.players.find(p => p.id.startsWith('bot_'))
              const checkCurrentPlayer = checkEngine.getCurrentPlayer()
              console.log(`[${new Date().toISOString()}] After player move: currentPlayer=${checkCurrentPlayer.id}, botPlayer=${checkBotPlayer?.id}`)
              if (checkBotPlayer && checkCurrentPlayer.id === checkBotPlayer.id) {
                console.log(`[${new Date().toISOString()}] Bot's turn, calling makeBotMove`)
                makeBotMove(data.sessionId, match.botDifficulty!)
              }
            }
          }, 500) // Wait 0.5 second before bot moves
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in applyMove:`, error)
      socket.emit('gameError', { message: 'Failed to apply move' })
    }
  })

  socket.on('getGameState', (data: { sessionId: string }) => {
    try {
      const engine = matchService.getGameEngine(data.sessionId)
      if (!engine) {
        socket.emit('gameError', { message: 'Game not found or not started' })
        return
      }

      socket.emit('gameState', { gameState: engine.getState() })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in getGameState:`, error)
      socket.emit('gameError', { message: 'Failed to get game state' })
    }
  })

  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`)
    matchService.removePlayer(socket.id)
    broadcastStats()
  })
})

// Bot move function
function makeBotMove(sessionId: string, difficulty: BotDifficulty) {
  try {
    const match = matchService.getMatch(sessionId)
    if (!match || !match.isBotGame) {
      return
    }

    const engine = matchService.getGameEngine(sessionId)
    if (!engine) {
      return
    }

    const state = engine.getState()
    // Find bot player by ID (bot ID starts with 'bot_')
    const botPlayer = state.players.find(p => p.id.startsWith('bot_'))
    if (!botPlayer) {
      return
    }

    // Check if it's bot's turn
    const currentPlayer = engine.getCurrentPlayer()
    console.log(`[${new Date().toISOString()}] makeBotMove: currentPlayer=${currentPlayer.id}, botPlayer=${botPlayer.id}, phase=${state.phase}`)
    
    if (currentPlayer.id !== botPlayer.id) {
      console.log(`[${new Date().toISOString()}] Not bot's turn, returning`)
      return
    }

    // Roll dice for bot
    if (state.phase === 'roll') {
      console.log(`[${new Date().toISOString()}] Bot rolling dice...`)
      const roll = engine.rollDice()
      const newState = engine.getState()
      console.log(`[${new Date().toISOString()}] Bot rolled: ${roll}, new phase: ${newState.phase}`)
      matchService.updateGameState(sessionId, newState)

      match.players.forEach(playerId => {
        // Only emit to real players, not bot
        if (playerId && !playerId.startsWith('bot_')) {
          io.to(playerId).emit('diceRolled', {
            roll,
            playerId: botPlayer.id,
            gameState: newState,
            hasLegalMoves: true
          })
        }
      })

      // Wait a bit, then get legal moves and make move
      setTimeout(() => {
        console.log(`[${new Date().toISOString()}] Bot setTimeout triggered after roll`)
        // Recreate engine to get latest state
        const updatedEngine = matchService.getGameEngine(sessionId)
        if (!updatedEngine) {
          console.log(`[${new Date().toISOString()}] Failed to get updated engine`)
          return
        }
        const updatedState = updatedEngine.getState()
        console.log(`[${new Date().toISOString()}] Updated state phase: ${updatedState.phase}, currentPlayerIndex: ${updatedState.currentPlayerIndex}`)
        const legalMoves = updatedEngine.getLegalMoves(botPlayer.id)
        console.log(`[${new Date().toISOString()}] Bot legal moves after roll:`, legalMoves.length, legalMoves)
        
        if (legalMoves.length === 0) {
          // No moves, end turn
          console.log(`[${new Date().toISOString()}] Bot has no legal moves, ending turn`)
          updatedEngine.endTurn()
          const endState = updatedEngine.getState()
          matchService.updateGameState(sessionId, endState)
          match.players.forEach(playerId => {
            // Only emit to real players, not bot
            if (playerId && !playerId.startsWith('bot_')) {
              io.to(playerId).emit('turnEnded', { gameState: endState })
            }
          })
          return
        }

        const botService = new BotService(difficulty)
        const botMove = botService.makeMove(updatedEngine, botPlayer.id)
        console.log(`[${new Date().toISOString()}] Bot chose move:`, botMove)
        
        if (botMove) {
          // Apply bot move using updated engine
          console.log(`[${new Date().toISOString()}] Applying bot move...`)
          const success = updatedEngine.applyMove(botPlayer.id, botMove)
          console.log(`[${new Date().toISOString()}] Bot move success: ${success}`)
          if (success) {
            const captured = updatedEngine.resolveCaptures()
            const winner = updatedEngine.checkWin()
            const moveState = updatedEngine.getState()
            matchService.updateGameState(sessionId, moveState)

            console.log(`[${new Date().toISOString()}] Sending moveApplied to players:`, match.players)
            match.players.forEach(playerId => {
              // Only emit to real players, not bot
              if (playerId && !playerId.startsWith('bot_')) {
                console.log(`[${new Date().toISOString()}] Emitting moveApplied to ${playerId}`)
                io.to(playerId).emit('moveApplied', {
                  move: botMove,
                  playerId: botPlayer.id,
                  captured,
                  winner,
                  gameState: moveState
                })
              }
            })

            if (!winner) {
              updatedEngine.endTurn()
              const endState = updatedEngine.getState()
              matchService.updateGameState(sessionId, endState)
              console.log(`[${new Date().toISOString()}] Bot turn ended, sending turnEnded to players`)
              match.players.forEach(playerId => {
                // Only emit to real players, not bot
                if (playerId && !playerId.startsWith('bot_')) {
                  console.log(`[${new Date().toISOString()}] Emitting turnEnded to ${playerId}`)
                  io.to(playerId).emit('turnEnded', { gameState: endState })
                }
              })
            }
          }
        }
      }, 700) // Wait for dice animation
    } else if (state.phase === 'move' || state.phase === 'decision') {
      // Bot needs to make a move
      console.log(`[${new Date().toISOString()}] Bot in move/decision phase, getting legal moves...`)
      const legalMoves = engine.getLegalMoves(botPlayer.id)
      console.log(`[${new Date().toISOString()}] Bot legal moves in move/decision phase:`, legalMoves.length, legalMoves)
      
      if (legalMoves.length === 0) {
        console.log(`[${new Date().toISOString()}] Bot has no legal moves in move/decision phase, ending turn`)
        engine.endTurn()
        const endState = engine.getState()
        matchService.updateGameState(sessionId, endState)
        match.players.forEach(playerId => {
          // Only emit to real players, not bot
          if (playerId && !playerId.startsWith('bot_')) {
            io.to(playerId).emit('turnEnded', { gameState: endState })
          }
        })
        return
      }

      const botService = new BotService(difficulty)
      const botMove = botService.makeMove(engine, botPlayer.id)
      console.log(`[${new Date().toISOString()}] Bot chose move in move/decision phase:`, botMove)
      
      if (botMove) {
        const success = engine.applyMove(botPlayer.id, botMove)
        console.log(`[${new Date().toISOString()}] Bot move success: ${success}`)
        if (success) {
          const captured = engine.resolveCaptures()
          const winner = engine.checkWin()
          const moveState = engine.getState()
          matchService.updateGameState(sessionId, moveState)

          match.players.forEach(playerId => {
            if (playerId && !playerId.startsWith('bot_')) {
              io.to(playerId).emit('moveApplied', {
                move: botMove,
                playerId: botPlayer.id,
                captured,
                winner,
                gameState: moveState
              })
            }
          })

          if (!winner) {
            engine.endTurn()
            const endState = engine.getState()
            matchService.updateGameState(sessionId, endState)
            match.players.forEach(playerId => {
              // Only emit to real players, not bot
              if (playerId && !playerId.startsWith('bot_')) {
                io.to(playerId).emit('turnEnded', { gameState: endState })
              }
            })
          }
        } else {
          console.log(`[${new Date().toISOString()}] Bot move failed, ending turn`)
          engine.endTurn()
          const endState = engine.getState()
          matchService.updateGameState(sessionId, endState)
          match.players.forEach(playerId => {
            if (playerId && !playerId.startsWith('bot_')) {
              io.to(playerId).emit('turnEnded', { gameState: endState })
            }
          })
        }
      } else {
        console.log(`[${new Date().toISOString()}] Bot has no move, ending turn`)
        engine.endTurn()
        const endState = engine.getState()
        matchService.updateGameState(sessionId, endState)
        match.players.forEach(playerId => {
          if (playerId && !playerId.startsWith('bot_')) {
            io.to(playerId).emit('turnEnded', { gameState: endState })
          }
        })
      }
    } else {
      // Unknown phase
      console.log(`[${new Date().toISOString()}] Bot in unknown phase: ${state.phase}`)
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in makeBotMove:`, error)
  }
}

// Cleanup old matches every minute
setInterval(() => {
  matchService.cleanupOldMatches()
}, 60 * 1000)

// Broadcast stats every 5 seconds
setInterval(broadcastStats, 5000)

httpServer.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`)
  console.log(`[${new Date().toISOString()}] Socket.IO server ready`)
  console.log(`[${new Date().toISOString()}] Health check available at http://localhost:${PORT}/health`)
})

// Handle server errors
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[${new Date().toISOString()}] Port ${PORT} is already in use`)
  } else {
    console.error(`[${new Date().toISOString()}] Server error:`, error)
  }
  process.exit(1)
})

