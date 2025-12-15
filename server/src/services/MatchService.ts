import { Match, Player, BotDifficulty, MatchStatus } from '../types/game'
import { GameEngine } from './GameEngine'

// Constants
const MATCH_TIMEOUT = 5 * 60 * 1000 // 5 minutes for empty matches
const QUEUE_TIMEOUT = 2 * 60 * 1000 // 2 minutes in queue
const MATCH_WAITING_TIMEOUT = 10 * 60 * 1000 // 10 minutes waiting for second player

export class MatchService {
  private matches: Map<string, Match> = new Map()
  private players: Map<string, Player> = new Map()
  private queue: string[] = [] // socket IDs waiting for random match
  private queueTimers: Map<string, NodeJS.Timeout> = new Map()
  private matchmakingLock = false // Simple lock to prevent race conditions

  generateSessionId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  generateMatchCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    // Ensure code is unique
    const existingCodes = Array.from(this.matches.values())
      .map(m => m.code)
      .filter(Boolean)
    if (existingCodes.includes(code)) {
      return this.generateMatchCode() // Recursive until unique
    }
    return code
  }

  createMatch(socketId: string, isBotGame: boolean = false, botDifficulty?: BotDifficulty): Match {
    const sessionId = this.generateSessionId()
    const code = isBotGame ? undefined : this.generateMatchCode()
    
    // For bot games, create a virtual bot player
    const botPlayerId = isBotGame ? `bot_${sessionId}` : undefined
    
    const match: Match = {
      sessionId,
      code,
      players: isBotGame ? [socketId, botPlayerId!] : [socketId],
      maxPlayers: 2,
      isBotGame,
      botDifficulty,
      createdAt: new Date(),
      status: isBotGame ? 'ready' : 'waiting',
      lastActivity: new Date()
    }

    this.matches.set(sessionId, match)
    
    const player = this.players.get(socketId)
    if (player) {
      player.inQueue = false
      player.currentMatchId = sessionId
    }

    // For bot games, initialize game immediately
    if (isBotGame && botPlayerId) {
      const gameEngine = new GameEngine([socketId, botPlayerId], ['A', 'B'])
      match.gameState = gameEngine.getState()
      match.status = 'in_progress'
    }

    // Set timeout for waiting matches
    if (!isBotGame) {
      match.matchTimeout = setTimeout(() => {
        this.cleanupMatch(sessionId, 'Match timeout - no players joined')
      }, MATCH_WAITING_TIMEOUT)
    }

    return match
  }

  joinMatch(socketId: string, code: string): Match | null {
    const match = Array.from(this.matches.values()).find(m => m.code === code)
    
    if (!match) {
      return null
    }

    if (match.status !== 'waiting' && match.status !== 'ready') {
      return null
    }

    if (match.players.length >= match.maxPlayers) {
      return null
    }

    if (match.players.includes(socketId)) {
      return match
    }

    // Clear match timeout if exists
    if (match.matchTimeout) {
      clearTimeout(match.matchTimeout)
      match.matchTimeout = undefined
    }

    match.players.push(socketId)
    match.lastActivity = new Date()
    
    // Update status if match is full
    if (match.players.length >= match.maxPlayers) {
      match.status = 'ready'
      
      // Initialize game engine if not already initialized
      if (!match.gameState) {
        const gameEngine = new GameEngine(match.players, ['A', 'B'])
        match.gameState = gameEngine.getState()
        match.status = 'in_progress'
      }
    }
    
    this.matches.set(match.sessionId, match)

    const player = this.players.get(socketId)
    if (player) {
      player.inQueue = false
      player.currentMatchId = match.sessionId
    }

    return match
  }

  findRandomMatch(socketId: string): Match | null {
    // Prevent race conditions
    if (this.matchmakingLock) {
      return null
    }

    this.matchmakingLock = true

    try {
      // Remove from queue if already there
      this.removeFromQueue(socketId)

      // Find available match (only waiting matches)
      const availableMatch = Array.from(this.matches.values()).find(
        m => !m.isBotGame && 
             m.status === 'waiting' && 
             m.players.length < m.maxPlayers &&
             !m.players.includes(socketId)
      )

      if (availableMatch) {
        const result = this.joinMatch(socketId, availableMatch.code!)
        return result
      }

      // Add to queue with timeout
      if (!this.queue.includes(socketId)) {
        this.queue.push(socketId)
        
        const queueTimer = setTimeout(() => {
          this.removeFromQueue(socketId)
          this.queueTimers.delete(socketId)
        }, QUEUE_TIMEOUT)
        
        this.queueTimers.set(socketId, queueTimer)
      }

      // Try to match with another player in queue (atomic operation)
      if (this.queue.length >= 2) {
        const player1 = this.queue.shift()!
        const player2 = this.queue.shift()!

        // Clear timers
        const timer1 = this.queueTimers.get(player1)
        const timer2 = this.queueTimers.get(player2)
        if (timer1) {
          clearTimeout(timer1)
          this.queueTimers.delete(player1)
        }
        if (timer2) {
          clearTimeout(timer2)
          this.queueTimers.delete(player2)
        }

        const match = this.createMatch(player1)
        const result = this.joinMatch(player2, match.code!)

        return result || this.matches.get(match.sessionId) || null
      }

      return null
    } finally {
      this.matchmakingLock = false
    }
  }

  addToQueue(socketId: string) {
    if (!this.queue.includes(socketId)) {
      this.queue.push(socketId)
    }
  }

  removeFromQueue(socketId: string) {
    const index = this.queue.indexOf(socketId)
    if (index > -1) {
      this.queue.splice(index, 1)
    }
    
    // Clear timeout if exists
    const timer = this.queueTimers.get(socketId)
    if (timer) {
      clearTimeout(timer)
      this.queueTimers.delete(socketId)
    }
  }

  registerPlayer(socketId: string, playerId?: string) {
    let player = this.players.get(socketId)
    
    if (!player) {
      player = {
        socketId,
        inQueue: false,
        playerId: playerId || this.generatePlayerId()
      }
      this.players.set(socketId, player)
    } else {
      // Update socket ID but keep player data
      player.socketId = socketId
      if (playerId) {
        player.playerId = playerId
      }
    }
  }

  removePlayer(socketId: string) {
    const player = this.players.get(socketId)
    this.removeFromQueue(socketId)
    
    // Remove from matches
    for (const [sessionId, match] of this.matches.entries()) {
      const index = match.players.indexOf(socketId)
      if (index > -1) {
        match.players.splice(index, 1)
        
        // Clean up empty matches or mark as finished
        if (match.players.length === 0) {
          this.cleanupMatch(sessionId, 'All players left')
        } else {
          // Notify remaining players
          match.status = 'waiting'
          match.lastActivity = new Date()
        }
      }
    }
    
    // Remove player entry
    this.players.delete(socketId)
  }

  generatePlayerId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  reconnectPlayer(socketId: string, sessionId: string): Match | null {
    const match = this.getMatch(sessionId)
    if (!match) {
      return null
    }

    // Check if player was in this match (by playerId)
    const player = this.players.get(socketId)
    if (!player) {
      return null
    }

    // Find player by checking all players in match
    const existingPlayerIndex = match.players.findIndex(p => {
      const pData = Array.from(this.players.values()).find(pl => pl.socketId === p)
      return pData?.playerId === player.playerId
    })

    if (existingPlayerIndex >= 0) {
      // Update socket ID
      match.players[existingPlayerIndex] = socketId
      match.lastActivity = new Date()
      player.currentMatchId = sessionId
      this.matches.set(sessionId, match)
      return match
    }

    return null
  }

  cleanupMatch(sessionId: string, reason: string) {
    const match = this.matches.get(sessionId)
    if (!match) {
      return
    }

    // Clear all timeouts
    if (match.matchTimeout) {
      clearTimeout(match.matchTimeout)
    }
    if (match.queueTimeout) {
      clearTimeout(match.queueTimeout)
    }

    // Remove match
    this.matches.delete(sessionId)
    
    // Clean up player references
    match.players.forEach(playerId => {
      const player = this.players.get(playerId)
      if (player) {
        player.currentMatchId = undefined
      }
    })

    console.log(`[MatchService] Cleaned up match ${sessionId}: ${reason}`)
  }

  // Cleanup old empty matches periodically
  cleanupOldMatches() {
    const now = Date.now()
    for (const [sessionId, match] of this.matches.entries()) {
      const age = now - match.lastActivity.getTime()
      
      // Clean up empty matches older than timeout
      if (match.players.length === 0 && age > MATCH_TIMEOUT) {
        this.cleanupMatch(sessionId, 'Match expired (empty)')
      }
    }
  }

  getMatch(sessionId: string): Match | undefined {
    return this.matches.get(sessionId)
  }

  getMatchByCode(code: string): Match | undefined {
    return Array.from(this.matches.values()).find(m => m.code === code)
  }

  getPlayerMatch(socketId: string): Match | undefined {
    const player = this.players.get(socketId)
    if (player?.currentMatchId) {
      return this.getMatch(player.currentMatchId)
    }
    return undefined
  }

  getGameEngine(sessionId: string): GameEngine | null {
    const match = this.getMatch(sessionId)
    if (!match) {
      return null
    }
    
    // Recreate engine and restore state if exists
    if (match.gameState) {
      return new GameEngine(match.players, ['A', 'B'], match.gameState)
    }
    
    // If match is ready but no game state, initialize it
    if (match.status === 'ready' && match.players.length >= match.maxPlayers) {
      const engine = new GameEngine(match.players, ['A', 'B'])
      match.gameState = engine.getState()
      this.matches.set(sessionId, match)
      return engine
    }
    
    return null
  }

  updateGameState(sessionId: string, gameState: any): boolean {
    const match = this.getMatch(sessionId)
    if (!match) {
      return false
    }
    
    match.gameState = gameState
    match.lastActivity = new Date()
    this.matches.set(sessionId, match)
    return true
  }

  getStats() {
    const playersOnline = this.players.size
    const playersInQueue = this.queue.length
    const activeMatches = Array.from(this.matches.values()).filter(
      m => m.players.length > 0 && m.status !== 'finished'
    ).length

    return {
      playersOnline,
      playersInQueue,
      activeMatches
    }
  }
}

