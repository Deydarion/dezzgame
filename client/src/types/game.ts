export type GameMode = 'bot' | 'online'
export type BotDifficulty = 'easy' | 'medium' | 'hard'
export type OnlineMode = 'create' | 'join' | 'random'
export type PlayerSide = 'A' | 'B'
export type PieceState = 'inactive' | 'active' | 'finished'
export type GamePhase = 'roll' | 'decision' | 'move' | 'resolve' | 'end_turn'
export type MoveType = 'enter' | 'move' | 'finish'

export interface GameStats {
  playersOnline: number
  playersInQueue: number
  activeMatches: number
}

export interface MatchInfo {
  sessionId: string
  code?: string
  players: number
  maxPlayers: number
}

// Game Logic Types
export interface GamePlayer {
  id: string
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
  targetIndex: number | null
  description: string
  isBlocked?: boolean // If true, move is blocked (for UI display)
}

export interface GameState {
  players: GamePlayer[]
  currentPlayerIndex: number
  phase: GamePhase
  lastDiceRoll: number | null
  path: number[]
  finishPath: number[]
  pathLength: number
  winner: PlayerSide | null
  playerDiceRolls?: { [playerId: string]: number } // Last dice roll for each player
}

export interface Move {
  pieceId: string
  type: MoveType
  targetIndex?: number
}

