export type BotDifficulty = 'easy' | 'medium' | 'hard'
export type PlayerSide = 'A' | 'B'
export type MatchStatus = 'waiting' | 'ready' | 'in_progress' | 'finished'
export type PieceState = 'inactive' | 'active' | 'finished'
export type GamePhase = 'roll' | 'decision' | 'move' | 'resolve' | 'end_turn'
export type MoveType = 'enter' | 'move' | 'finish'

export interface GameStats {
  playersOnline: number
  playersInQueue: number
  activeMatches: number
}

export interface Match {
  sessionId: string
  code?: string
  players: string[] // socket IDs
  maxPlayers: number
  isBotGame: boolean
  botDifficulty?: BotDifficulty
  createdAt: Date
  status: MatchStatus
  lastActivity: Date
  queueTimeout?: NodeJS.Timeout
  matchTimeout?: NodeJS.Timeout
  gameState?: GameState
}

export interface Player {
  socketId: string
  side?: PlayerSide
  inQueue: boolean
  currentMatchId?: string
  playerId?: string // Persistent player ID for reconnection
}

// Game Logic Types
export interface GamePlayer {
  id: string // socket ID
  side: PlayerSide
  direction: 'clockwise' | 'counterclockwise'
  pieces: Piece[]
}

export interface Piece {
  id: string
  ownerId: string
  state: PieceState
  pathIndex: number | null // Linear path index (0-31): 0-27 main circle, 28-31 diagonal
  priority: number // 1, 2, or 3 (3 = in diagonal, not blocking)
}

export interface LegalMove {
  pieceId: string
  type: MoveType
  targetIndex: number | null // null for enter move
  description: string
  isBlocked?: boolean // If true, move is blocked (for UI display)
}

export interface GameState {
  players: GamePlayer[]
  currentPlayerIndex: number
  phase: GamePhase
  lastDiceRoll: number | null
  path: number[] // linear path indices (64 cells for 8x8 board)
  finishPath: number[] // finish diagonal (4 cells)
  pathLength: number
  winner: PlayerSide | null
  playerDiceRolls?: { [playerId: string]: number } // Last dice roll for each player
}

export interface Move {
  pieceId: string
  type: MoveType
  targetIndex?: number
}

