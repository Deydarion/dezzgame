import {
  GameState,
  GamePlayer,
  Piece,
  PlayerSide,
  LegalMove,
  Move,
  PieceState
} from '../types/game'

/**
 * SIMPLIFIED Game Engine with linear path system
 * 
 * Path System:
 * - pathIndex 0-27: main circle (28 cells)
 * - pathIndex 28-31: diagonal (4 cells)
 * - Total: 32 positions (0-31)
 * 
 * Rules:
 * - Spawn at pathIndex 0
 * - Move forward: newPathIndex = oldPathIndex + roll
 * - Reflection: if newPathIndex > 31, reflect back: finalPathIndex = 62 - newPathIndex
 * - Fixation: piece becomes 'finished' when it lands exactly on target diagonal cell
 * - Win: all 4 diagonal cells filled with player's pieces
 */
export class GameEngine {
  private state: GameState
  private lastMovePathIndices: number[] = [] // Track path indices traversed in last move

  constructor(playerIds: string[], sides: PlayerSide[] = ['A', 'B'], initialState?: GameState) {
    if (initialState) {
      this.state = { ...initialState }
    } else {
      this.state = {
        players: playerIds.map((id, index) => ({
          id,
          side: sides[index],
          direction: sides[index] === 'A' ? 'clockwise' : 'counterclockwise',
          pieces: []
        })),
        currentPlayerIndex: 0,
        phase: 'roll',
        lastDiceRoll: null,
        path: this.generateBoardMapping('A'),
        finishPath: this.getDiagonalMapping('A'),
        pathLength: 32,
        winner: null,
        playerDiceRolls: {}
      }
    }
  }

  /**
   * Generate mapping: pathIndex -> boardIndex for UI display
   * This maps the linear path (0-31) to actual board positions (0-63)
   */
  private generateBoardMapping(side: PlayerSide): number[] {
    const mapping: number[] = []
    
    if (side === 'A') {
      // Player A (bottom-left, blue)
      // Start: 56 (bottom-left corner)
      // Main circle (28 cells): clockwise around the board
      const mainPath = [
        56, 57, 58, 59, 60, 61, 62, 63, // Bottom row (left to right)
        55, 47, 39, 31, 23, 15, 7,      // Right column (bottom to top)
        6, 5, 4, 3, 2, 1, 0,             // Top row (right to left)
        8, 16, 24, 32, 40, 48            // Left column (top to bottom, before start)
      ]
      mapping.push(...mainPath)
      
      // Diagonal (4 cells): 56 -> 49 -> 42 -> 35
      mapping.push(56, 49, 42, 35)
    } else {
      // Player B (top-right, red)
      // Start: 7 (top-right corner)
      // Main circle (28 cells): counterclockwise around the board
      const mainPath = [
        7, 6, 5, 4, 3, 2, 1, 0,          // Top row (right to left)
        8, 16, 24, 32, 40, 48, 56,       // Left column (top to bottom)
        57, 58, 59, 60, 61, 62, 63,      // Bottom row (left to right)
        55, 47, 39, 31, 23, 15           // Right column (bottom to top, before start)
      ]
      mapping.push(...mainPath)
      
      // Diagonal (4 cells): 7 -> 14 -> 21 -> 28
      mapping.push(7, 14, 21, 28)
    }
    
    return mapping
  }

  private getDiagonalMapping(side: PlayerSide): number[] {
    if (side === 'A') {
      return [56, 49, 42, 35]
    } else {
      return [7, 14, 21, 28]
    }
  }

  /**
   * Convert pathIndex to boardIndex for display
   */
  // Made public for BotService
  public pathToBoardIndex(pathIndex: number, side: PlayerSide): number {
    const mapping = this.generateBoardMapping(side)
    return mapping[pathIndex]
  }

  getState(): GameState {
    return { ...this.state }
  }

  getCurrentPlayer(): GamePlayer {
    return this.state.players[this.state.currentPlayerIndex]
  }

  rollDice(): number {
    if (this.state.phase !== 'roll') {
      throw new Error('Can only roll dice in roll phase')
    }

    const roll = Math.floor(Math.random() * 6) + 1
    const currentPlayer = this.getCurrentPlayer()
    
    this.state.lastDiceRoll = roll
    if (!this.state.playerDiceRolls) {
      this.state.playerDiceRolls = {}
    }
    this.state.playerDiceRolls[currentPlayer.id] = roll
    
    // If player has no active pieces and didn't roll 6, turn ends
    const activePieces = currentPlayer.pieces.filter(p => p.state === 'active')
    if (activePieces.length === 0 && roll !== 6) {
      this.state.phase = 'end_turn'
      return roll
    }
    
    this.state.phase = roll === 6 ? 'decision' : 'move'
    
    console.log(`[rollDice] Player ${currentPlayer.side} rolled ${roll}, phase: ${this.state.phase}`)
    
    return roll
  }

  getLegalMoves(playerId: string): LegalMove[] {
    const player = this.state.players.find(p => p.id === playerId)
    if (!player) {
      console.log(`[getLegalMoves] Player ${playerId} not found`)
      return []
    }

    if (this.state.phase === 'roll' || this.state.phase === 'resolve' || this.state.phase === 'end_turn') {
      return []
    }

    const roll = this.state.lastDiceRoll!
    let moves: LegalMove[] = []
    const activePieces = player.pieces.filter(p => p.state === 'active')
    
    console.log(`[getLegalMoves] Player ${player.side}: roll=${roll}, active=${activePieces.length}, total=${player.pieces.length}`)

    // If rolled 6, can spawn new piece
    if (roll === 6) {
      const activePiecesCount = player.pieces.filter(p => p.state === 'active').length
      console.log(`[getLegalMoves] Rolled 6: activePieces=${activePiecesCount}, canSpawn=${activePiecesCount < 2}`)
      
      if (activePiecesCount < 2) {
        const startBoardIndex = this.pathToBoardIndex(0, player.side)
        
        // Check if start is occupied by OWN ACTIVE piece
        // (finished pieces are always in diagonal 28-31, never at start 0)
        let occupiedByOwn = false
        for (const piece of player.pieces) {
          if (piece.state === 'active' && piece.pathIndex !== null) {
            const pieceBoardIndex = this.pathToBoardIndex(piece.pathIndex, player.side)
            if (pieceBoardIndex === startBoardIndex) {
              occupiedByOwn = true
              console.log(`[getLegalMoves] Start blocked by own piece ${piece.id} at pathIndex ${piece.pathIndex}`)
              break
            }
          }
        }
        
        // Can spawn if: not occupied by own piece OR can capture enemy
        const canCaptureEnemy = this.canCapture(startBoardIndex, player.side)
        
        if (!occupiedByOwn || canCaptureEnemy) {
          console.log(`[getLegalMoves] Can spawn: occupiedByOwn=${occupiedByOwn}, canCapture=${canCaptureEnemy}`)
          moves.push({
            pieceId: 'new',
            type: 'enter',
            targetIndex: startBoardIndex,
            description: 'Spawn new piece'
          })
        } else {
          console.log(`[getLegalMoves] Cannot spawn: start position ${startBoardIndex} is occupied by own piece`)
        }
      } else {
        console.log(`[getLegalMoves] Cannot spawn: already have ${activePiecesCount} active pieces (max 2)`)
      }
    }

    // Get moves for each active piece
    for (const piece of activePieces) {
      const pieceMoves = this.getPieceMoves(piece, player, roll)
      moves.push(...pieceMoves)
    }

    // Apply priority blocking rules
    moves = this.applyPriorityRules(moves, activePieces, player, roll)

    console.log(`[getLegalMoves] Total moves: ${moves.length}`)
    return moves
  }

  /**
   * Get next priority for a new piece
   * Priority 1 if no active pieces with priority 1 or 2
   * Priority 2 if there's already a piece with priority 1
   */
  private getNextPriority(player: GamePlayer): number {
    const activePieces = player.pieces.filter(p => p.state === 'active' && p.priority < 3)
    
    // If no active pieces with priority 1 or 2, new piece gets priority 1
    if (activePieces.length === 0) {
      return 1
    }
    
    // If there's a piece with priority 1, new piece gets priority 2
    const hasPriority1 = activePieces.some(p => p.priority === 1)
    return hasPriority1 ? 2 : 1
  }

  /**
   * Reassign priorities after a piece is removed (captured or finished)
   * If priority 1 piece is gone, promote priority 2 to priority 1
   */
  private reassignPriorities(player: GamePlayer): void {
    const activePieces = player.pieces.filter(p => p.state === 'active')
    const hasPriority1 = activePieces.some(p => p.priority === 1)
    
    if (!hasPriority1) {
      // Find priority 2 piece and promote it to priority 1
      const priority2Piece = activePieces.find(p => p.priority === 2)
      if (priority2Piece) {
        priority2Piece.priority = 1
        console.log(`[reassignPriorities] Promoted piece ${priority2Piece.id} from priority 2 to 1`)
      }
    }
  }

  /**
   * Apply priority blocking rules:
   * - Priority 2 piece can't move to same cell or further than priority 1 piece
   * - If priority 2 would overtake priority 1, only allow priority 1 moves
   * - Priority 3 pieces don't block anything
   */
  private applyPriorityRules(moves: LegalMove[], activePieces: Piece[], player: GamePlayer, roll: number): LegalMove[] {
    const priority1Piece = activePieces.find(p => p.priority === 1)
    const priority2Piece = activePieces.find(p => p.priority === 2)
    
    // If no priority 1 or 2, or only one active piece, no blocking
    if (!priority1Piece || !priority2Piece) {
      return moves
    }
    
    // Get possible moves for both pieces
    const priority1Moves = this.getPieceMoves(priority1Piece, player, roll)
    const priority2Moves = this.getPieceMoves(priority2Piece, player, roll)
    
    if (priority1Moves.length === 0) {
      // Priority 1 can't move, allow priority 2 to move
      return moves
    }
    
    // Check if priority 2 would overtake or block priority 1
    let priority2WouldBlock = false
    
    for (const move2 of priority2Moves) {
      const move2PathIndex = this.boardToPathIndex(move2.targetIndex!, player.side)
      
      for (const move1 of priority1Moves) {
        const move1PathIndex = this.boardToPathIndex(move1.targetIndex!, player.side)
        
        // If priority 2 can reach same position or further, it's blocking
        if (move2PathIndex >= move1PathIndex) {
          priority2WouldBlock = true
          break
        }
      }
      
      if (priority2WouldBlock) break
    }
    
    if (priority2WouldBlock) {
      // Only allow priority 1 moves
      console.log(`[applyPriorityRules] Priority 2 would block priority 1, only allowing priority 1 moves`)
      return moves.filter(m => m.pieceId === priority1Piece.id || m.type === 'enter')
    }
    
    return moves
  }

  /**
   * Convert boardIndex back to pathIndex for a specific player
   */
  private boardToPathIndex(boardIndex: number, side: PlayerSide): number {
    const mapping = this.generateBoardMapping(side)
    return mapping.indexOf(boardIndex)
  }

  private getPieceMoves(piece: Piece, player: GamePlayer, roll: number): LegalMove[] {
    const moves: LegalMove[] = []
    if (piece.pathIndex === null) return moves

    const oldPathIndex = piece.pathIndex
    let newPathIndex = oldPathIndex + roll

    // Get the current boundary for this player's diagonal (based on finished pieces)
    const targetDiagonalIndex = this.getTargetDiagonalIndex(player)
    
    // Calculate reflection if exceeding the current boundary
    if (newPathIndex > targetDiagonalIndex) {
      // Calculate overflow distance beyond the boundary
      const overflow = newPathIndex - targetDiagonalIndex
      // Reflect back: go to boundary, then bounce back
      newPathIndex = targetDiagonalIndex - overflow
      console.log(`[getPieceMoves] Piece ${piece.id}: boundary=${targetDiagonalIndex}, ${oldPathIndex}+${roll}=${oldPathIndex + roll} -> overflow=${overflow} -> ${newPathIndex}`)
    }

    // Check if move is valid (allow staying in place if it's result of reflection)
    if (newPathIndex < 0 || newPathIndex > 31) return moves

    // Check if trying to enter or pass through diagonal from main circle
    const isEnteringDiagonal = oldPathIndex < 28 && newPathIndex >= 28
    
    if (isEnteringDiagonal) {
      // When entering diagonal, check if entrance (pathIndex 28) is blocked by OWN ACTIVE pieces
      // Finished pieces don't block
      const diagonalEntranceBoardIndex = this.pathToBoardIndex(28, player.side)
      
      // Check if entrance is blocked by own ACTIVE piece
      let entranceBlocked = false
      for (const p of player.pieces) {
        if (p.id === piece.id) continue
        if (p.state === 'active' && p.pathIndex !== null) {
          const pBoardIndex = this.pathToBoardIndex(p.pathIndex, player.side)
          if (pBoardIndex === diagonalEntranceBoardIndex) {
            entranceBlocked = true
            break
          }
        }
      }
      
      if (entranceBlocked) {
        console.log(`[getPieceMoves] Piece ${piece.id}: cannot enter diagonal - entrance blocked at pathIndex 28 by own active piece`)
        return moves // Can't enter diagonal if entrance is blocked by own active piece
      }
    }

    const newBoardIndex = this.pathToBoardIndex(newPathIndex, player.side)
    
    // Check if cell is free or can capture
    const isSamePosition = newPathIndex === oldPathIndex
    
    // Check if occupied by OWN ACTIVE piece
    let occupiedByOwn = false
    for (const p of player.pieces) {
      if (p.id === piece.id) continue // Skip current piece
      if (p.state === 'active' && p.pathIndex !== null) {
        const pBoardIndex = this.pathToBoardIndex(p.pathIndex, player.side)
        if (pBoardIndex === newBoardIndex) {
          occupiedByOwn = true
          break
        }
      }
    }
    
    // Check if cell is completely free (no pieces at all)
    const cellFree = this.isCellFree(newBoardIndex)
    
    // Check if occupied by ENEMY ACTIVE piece (can capture)
    const canCaptureEnemy = this.canCapture(newBoardIndex, player.side)
    
    // Can move if: staying in place, not occupied by own AND (cell free OR can capture enemy)
    if (isSamePosition || (!occupiedByOwn && (cellFree || canCaptureEnemy))) {
      const moveType = newPathIndex >= 28 ? 'finish' : 'move'
      const description = isSamePosition 
        ? `Stay at pathIndex ${newPathIndex} (reflected)`
        : `Move to pathIndex ${newPathIndex} (board ${newBoardIndex})`
      
      moves.push({
        pieceId: piece.id,
        type: moveType,
        targetIndex: newBoardIndex,
        description
      })
    }

    console.log(`[getPieceMoves] Piece ${piece.id} (priority ${piece.priority}): ${oldPathIndex} -> ${newPathIndex}, moves: ${moves.length}`)
    return moves
  }

  private isCellFree(boardIndex: number, excludeSide?: PlayerSide): boolean {
    for (const player of this.state.players) {
      // If excludeSide is specified, skip that player (checking enemies only)
      // Otherwise check all players
      if (excludeSide && player.side === excludeSide) continue
      
      for (const piece of player.pieces) {
        // Check both active AND finished pieces - they ALL block the cell
        if (piece.state === 'active' || piece.state === 'finished') {
          const pieceBoardIndex = piece.pathIndex !== null ? this.pathToBoardIndex(piece.pathIndex, player.side) : null
          if (pieceBoardIndex === boardIndex) {
            console.log(`[isCellFree] Cell ${boardIndex} occupied by ${piece.state} piece of player ${player.side}`)
            return false
          }
        }
      }
    }
    return true
  }

  private canCapture(boardIndex: number, attackerSide: PlayerSide): boolean {
    for (const player of this.state.players) {
      if (player.side === attackerSide) continue // Can't capture own pieces
      
      for (const piece of player.pieces) {
        if (piece.state === 'active') {
          const pieceBoardIndex = piece.pathIndex !== null ? this.pathToBoardIndex(piece.pathIndex, player.side) : null
          if (pieceBoardIndex === boardIndex) {
            return true
          }
        }
      }
    }
    return false
  }

  applyMove(playerId: string, move: Move): boolean {
    const player = this.state.players.find(p => p.id === playerId)
    if (!player) return false

    const currentPlayer = this.getCurrentPlayer()
    if (currentPlayer.id !== playerId) return false

    if (this.state.phase !== 'move' && this.state.phase !== 'decision') return false

    const legalMoves = this.getLegalMoves(playerId)
    const isValid = move.type === 'enter' 
      ? legalMoves.some(lm => lm.type === 'enter')
      : legalMoves.some(lm => lm.pieceId === move.pieceId && lm.targetIndex === move.targetIndex)

    if (!isValid) {
      console.log(`[applyMove] Invalid move`)
      return false
    }

    if (move.type === 'enter') {
      // Spawn new piece
      const newPiece: Piece = {
        id: `piece_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        ownerId: playerId,
        state: 'active',
        pathIndex: 0,
        priority: this.getNextPriority(player)
      }
      player.pieces.push(newPiece)
      console.log(`[applyMove] Spawned piece ${newPiece.id} at pathIndex 0 with priority ${newPiece.priority}`)
    } else {
      // Move existing piece
      const piece = player.pieces.find(p => p.id === move.pieceId)
      if (!piece || piece.pathIndex === null) return false

      const oldPathIndex = piece.pathIndex
      const roll = this.state.lastDiceRoll!
      let newPathIndex = oldPathIndex + roll

      // Reflect if over 31
      if (newPathIndex > 31) {
        newPathIndex = 62 - newPathIndex
      }

      piece.pathIndex = newPathIndex

      // Calculate and store all pathIndices passed through during this move
      this.lastMovePathIndices = this.calculateMovementPath(oldPathIndex, newPathIndex, roll)
      console.log(`[applyMove] Moved piece ${piece.id} (priority ${piece.priority}): ${oldPathIndex} -> ${newPathIndex}, path: [${this.lastMovePathIndices.join(', ')}]`)

      // Update priority if entering diagonal (pathIndex >= 28)
      if (newPathIndex >= 28 && piece.priority !== 3) {
        piece.priority = 3
        console.log(`[applyMove] Piece ${piece.id} entered diagonal, priority updated to 3`)
      }

      // Check if piece should be fixed
      if (newPathIndex >= 28 && newPathIndex <= 31) {
        const targetIndex = this.getTargetDiagonalIndex(player)
        if (newPathIndex === targetIndex) {
          piece.state = 'finished'
          console.log(`[applyMove] Piece ${piece.id} finished at pathIndex ${newPathIndex}`)
          
          // Reassign priorities since this piece is now finished
          this.reassignPriorities(player)
        }
      }

      console.log(`[applyMove] Moved piece ${piece.id}: ${oldPathIndex} -> ${newPathIndex}`)
    }

    this.state.phase = 'resolve'
    return true
  }

  /**
   * Calculate all pathIndices passed through during movement
   * Handles both forward movement and reflection
   */
  private calculateMovementPath(oldPathIndex: number, newPathIndex: number, roll: number): number[] {
    const path: number[] = []
    
    // Simple forward movement (no reflection)
    if (oldPathIndex + roll <= 31) {
      for (let i = oldPathIndex + 1; i <= newPathIndex; i++) {
        path.push(i)
      }
    } else {
      // Reflection: move forward to 31, then backward
      // Forward to end
      for (let i = oldPathIndex + 1; i <= 31; i++) {
        path.push(i)
      }
      // Backward from 31
      for (let i = 30; i >= newPathIndex; i--) {
        path.push(i)
      }
    }
    
    return path
  }

  private getTargetDiagonalIndex(player: GamePlayer): number {
    const finishedCount = player.pieces.filter(p => p.state === 'finished').length
    return 31 - finishedCount // 31, 30, 29, 28
  }

  resolveCaptures(): string[] {
    const captured: string[] = []
    
    // Find the player who just moved (currentPlayer before endTurn)
    const currentPlayer = this.getCurrentPlayer()
    
    // Check for captures along the movement path
    for (const attackerPiece of currentPlayer.pieces) {
      if (attackerPiece.state !== 'active' || attackerPiece.pathIndex === null) continue
      
      const attackerBoardIndex = this.pathToBoardIndex(attackerPiece.pathIndex, currentPlayer.side)
      
      // Check all pathIndices that were traversed + final position
      const pathIndicesToCheck = [...this.lastMovePathIndices, attackerPiece.pathIndex]
      
      for (const pathIndexToCheck of pathIndicesToCheck) {
        const boardIndexToCheck = this.pathToBoardIndex(pathIndexToCheck, currentPlayer.side)
        
        // Check if any enemy piece is on this board cell
        for (const defender of this.state.players) {
          if (defender.side === currentPlayer.side) continue // Can't capture own pieces
          
          for (const defenderPiece of defender.pieces) {
            if (defenderPiece.state !== 'active' || defenderPiece.pathIndex === null) continue
            if (captured.includes(defenderPiece.id)) continue // Already captured
            
            const defenderBoardIndex = this.pathToBoardIndex(defenderPiece.pathIndex, defender.side)
            
            // If attacker passed through or landed on defender's position, capture defender
            if (boardIndexToCheck === defenderBoardIndex) {
              defenderPiece.state = 'inactive'
              defenderPiece.pathIndex = null
              captured.push(defenderPiece.id)
              console.log(`[resolveCaptures] Attacker ${attackerPiece.id} captured defender ${defenderPiece.id} at board ${defenderBoardIndex} (pathIndex ${pathIndexToCheck})`)
              
              // Reassign priorities for defender's team
              this.reassignPriorities(defender)
            }
          }
        }
      }
    }

    this.state.phase = 'end_turn'
    return captured
  }

  checkFinish(): void {
    // Already handled in applyMove
  }

  checkWin(): PlayerSide | null {
    for (const player of this.state.players) {
      const finishedPieces = player.pieces.filter(p => p.state === 'finished')
      if (finishedPieces.length === 4) {
        this.state.winner = player.side
        console.log(`[checkWin] Player ${player.side} wins!`)
        return player.side
      }
    }
    return null
  }

  endTurn(): void {
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length
    this.state.phase = 'roll'
    this.state.lastDiceRoll = null
    console.log(`[endTurn] Next player: ${this.getCurrentPlayer().side}`)
  }
}
