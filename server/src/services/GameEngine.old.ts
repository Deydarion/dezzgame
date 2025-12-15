import {
  GameState,
  GamePlayer,
  Piece,
  PlayerSide,
  LegalMove,
  Move,
  PieceState
} from '../types/game'

export class GameEngine {
  private state: GameState
  private lastMovePath: { pieceId: string; oldIndex: number; newIndex: number; path: number[] } | null = null

  constructor(playerIds: string[], sides: PlayerSide[] = ['A', 'B'], initialState?: GameState) {
    // Generate unified fullPath: main circle + diagonal (4 cells)
    const fullPathA = this.generateFullPath('A')
    const fullPathB = this.generateFullPath('B')

    if (initialState) {
      // Restore from existing state
      this.state = { ...initialState }
    } else {
      // Create new state
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
        path: fullPathA, // For Player A
        finishPath: this.getDiagonalPath('A'), // Keep for backward compatibility
        pathLength: fullPathA.length,
        winner: null,
        playerDiceRolls: {}
      }
    }
  }

  /**
   * Generate full path: main circle + diagonal (4 cells)
   * For Player A: circle clockwise + diagonal [56, 49, 42, 35]
   * For Player B: circle counterclockwise + diagonal [7, 14, 21, 28]
   */
  private generateFullPath(side: PlayerSide): number[] {
    const mainCircle = this.generateMainCircle(side)
    const diagonal = this.getDiagonalPath(side)
    
    // Full path = main circle + diagonal
    return [...mainCircle, ...diagonal]
  }

  /**
   * Generate main circle path (without diagonal)
   */
  private generateMainCircle(side: PlayerSide): number[] {
    const path: number[] = []
    
    if (side === 'A') {
      // Clockwise from bottom-left (56)
      // Bottom row (left to right) - indices 56-63
      for (let i = 56; i <= 63; i++) path.push(i)
      
      // Right column (bottom to top) - indices 55, 47, 39, 31, 23, 15, 7
      for (let i = 55; i >= 7; i -= 8) path.push(i)
      
      // Top row (right to left) - indices 6-0
      for (let i = 6; i >= 0; i--) path.push(i)
      
      // Left column (top to bottom) - indices 8, 16, 24, 32, 40, 48
      for (let i = 8; i <= 48; i += 8) path.push(i)
    } else {
      // Counterclockwise from top-right (7)
      // Top row (right to left) - indices 7-0
      for (let i = 7; i >= 0; i--) path.push(i)
      
      // Left column (top to bottom) - indices 8, 16, 24, 32, 40, 48, 56
      for (let i = 8; i <= 56; i += 8) path.push(i)
      
      // Bottom row (left to right) - indices 57-63
      for (let i = 57; i <= 63; i++) path.push(i)
      
      // Right column (bottom to top) - indices 55, 47, 39, 31, 23, 15
      for (let i = 55; i >= 15; i -= 8) path.push(i)
    }
    
    return path
  }

  /**
   * Get diagonal path (4 cells)
   * Player A: [56, 49, 42, 35] (up-right from bottom-left)
   * Player B: [7, 14, 21, 28] (down-left from top-right)
   */
  private getDiagonalPath(side: PlayerSide): number[] {
    if (side === 'A') {
      return [56, 49, 42, 35]
    } else {
      return [7, 14, 21, 28]
    }
  }

  /**
   * Get start index for player
   */
  private getStartIndex(side: PlayerSide): number {
    return side === 'A' ? 56 : 7
  }

  /**
   * Get diagonal start index in fullPath
   * This is where diagonal begins (first cell of diagonal)
   */
  private getDiagonalStartIndex(side: PlayerSide): number {
    const mainCircleLength = this.generateMainCircle(side).length
    return mainCircleLength // Diagonal starts after main circle
  }

  /**
   * Get full path for player (main circle + diagonal)
   */
  private getFullPath(side: PlayerSide): number[] {
    if (side === 'A') {
      return this.state.path // Player A uses state.path
    } else {
      // Player B needs reversed path
      const mainCircle = this.generateMainCircle('B')
      const diagonal = this.getDiagonalPath('B')
      return [...mainCircle, ...diagonal]
    }
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
    
    return roll
  }

  getLegalMoves(playerId: string): LegalMove[] {
    const player = this.state.players.find(p => p.id === playerId)
    if (!player) {
      console.log(`[getLegalMoves] Player ${playerId} not found`)
      return []
    }

    if (this.state.phase === 'roll' || this.state.phase === 'resolve' || this.state.phase === 'end_turn') {
      console.log(`[getLegalMoves] Wrong phase: ${this.state.phase}`)
      return []
    }

    let moves: LegalMove[] = []
    const roll = this.state.lastDiceRoll!
    
    console.log(`[getLegalMoves] Player ${player.side} (${playerId}): roll=${roll}, phase=${this.state.phase}`)

    const activePieces = player.pieces.filter(p => p.state === 'active')
    const inactivePieces = player.pieces.filter(p => p.state === 'inactive')
    
    console.log(`[getLegalMoves] Active pieces: ${activePieces.length}, Inactive pieces: ${inactivePieces.length}`)
    console.log(`[getLegalMoves] Pieces: ${JSON.stringify(player.pieces.map(p => ({id: p.id, pos: p.positionIndex, hasLap: p.hasCompletedLap, state: p.state})))}`)

    // If rolled 6, can enter new piece or move existing
    if (roll === 6) {
      // Can enter new piece if less than 2 pieces total (including finished and inactive)
      // Count only pieces that can be spawned (not finished pieces that are already on board)
      const activeAndInactivePieces = player.pieces.filter(p => p.state === 'active' || p.state === 'inactive')
      console.log(`[getLegalMoves] Roll 6: activeAndInactivePieces=${activeAndInactivePieces.length}`)
      
      if (activeAndInactivePieces.length < 2) {
        const startIndex = this.getStartIndex(player.side)
        // Check if cell is free OR can capture opponent's piece
        // But NOT if own piece is there
        const canEnter = this.isCellFree(startIndex) || this.canCapture(startIndex, player.side)
        console.log(`[getLegalMoves] Can enter at ${startIndex}: ${canEnter}`)
        
        if (canEnter) {
          moves.push({
            pieceId: 'new',
            type: 'enter',
            targetIndex: startIndex,
            description: 'Enter new piece'
          })
        }
      }

      // Can move any active piece
      activePieces.forEach(piece => {
        const pieceMoves = this.getPieceMoves(piece, player, roll)
        console.log(`[getLegalMoves] Piece ${piece.id} generated ${pieceMoves.length} moves`)
        moves.push(...pieceMoves)
      })
    } else {
      // Must move if possible
      if (activePieces.length === 0) {
        console.log(`[getLegalMoves] No active pieces, turn ends`)
        // No active pieces, turn ends
        return []
      }

      // Get moves for all active pieces
      activePieces.forEach(piece => {
        const pieceMoves = this.getPieceMoves(piece, player, roll)
        console.log(`[getLegalMoves] Piece ${piece.id} generated ${pieceMoves.length} moves`)
        moves.push(...pieceMoves)
      })

      // Apply mandatory move rules: if one piece blocks another, must move the blocking piece
      if (activePieces.length === 2) {
        const beforeMandatory = moves.length
        moves = this.applyMandatoryMoveRules(moves, activePieces, player, roll)
        console.log(`[getLegalMoves] After mandatory rules: ${beforeMandatory} -> ${moves.length} moves`)
      }

      // If only one move possible, it's mandatory
      if (moves.length === 1) {
        moves[0].description += ' (mandatory)'
      }
    }

    console.log(`[getLegalMoves] Total legal moves: ${moves.length}`)
    return moves
  }

  /**
   * Apply mandatory move rules: if one piece blocks another, must move the blocking piece
   * Rule: If second piece's move would lead to same cell or further than first piece,
   * player must move first piece
   */
  private applyMandatoryMoveRules(
    moves: LegalMove[], 
    activePieces: Piece[], 
    player: GamePlayer, 
    roll: number
  ): LegalMove[] {
    if (activePieces.length !== 2) {
      return moves
    }

    const [piece1, piece2] = activePieces
    const fullPath = this.getFullPath(player.side)
    
    // Get positions in path
    const pos1 = piece1.positionIndex!
    const pos2 = piece2.positionIndex!
    const pathIndex1 = fullPath.indexOf(pos1)
    const pathIndex2 = fullPath.indexOf(pos2)
    
    console.log(`[applyMandatoryMoveRules] Piece1 at pathIndex ${pathIndex1}, Piece2 at pathIndex ${pathIndex2}`)
    
    // Determine which piece is "first" (ahead on the path)
    // Piece is "first" if it's further along the path
    let firstPiece: Piece
    let secondPiece: Piece
    
    if (pathIndex1 > pathIndex2) {
      firstPiece = piece1
      secondPiece = piece2
      console.log(`[applyMandatoryMoveRules] Piece1 is ahead (first)`)
    } else if (pathIndex2 > pathIndex1) {
      firstPiece = piece2
      secondPiece = piece1
      console.log(`[applyMandatoryMoveRules] Piece2 is ahead (first)`)
    } else {
      // Both pieces at same position - no blocking
      console.log(`[applyMandatoryMoveRules] Both pieces at same position, no mandatory rules`)
      return moves
    }
    
    // Get all possible moves for both pieces
    const secondPieceMoves = this.getPieceMoves(secondPiece, player, roll)
    const firstPieceMoves = this.getPieceMoves(firstPiece, player, roll)
    
    console.log(`[applyMandatoryMoveRules] First piece moves: ${firstPieceMoves.length}, Second piece moves: ${secondPieceMoves.length}`)
    
    // If first piece has no moves, allow second piece moves
    if (firstPieceMoves.length === 0) {
      console.log(`[applyMandatoryMoveRules] First piece has no moves, allowing second piece`)
      return moves
    }
    
    // If second piece has no moves, allow first piece moves
    if (secondPieceMoves.length === 0) {
      console.log(`[applyMandatoryMoveRules] Second piece has no moves, allowing all moves`)
      return moves
    }
    
    // Get first piece's current and target positions
    const firstPieceCurrentPathIndex = fullPath.indexOf(firstPiece.positionIndex!)
    
    // Check if second piece can reach same cell or go further than first piece
    let secondPieceCanOvertake = false
    
    for (const secondMove of secondPieceMoves) {
      const secondPieceTargetPathIndex = fullPath.indexOf(secondMove.targetIndex!)
      
      // Check all possible moves of first piece
      for (const firstMove of firstPieceMoves) {
        const firstPieceTargetPathIndex = fullPath.indexOf(firstMove.targetIndex!)
        
        // If second piece can reach same cell or go further than first piece's target
        if (secondPieceTargetPathIndex >= firstPieceTargetPathIndex) {
          secondPieceCanOvertake = true
          console.log(`[applyMandatoryMoveRules] Second piece can overtake: ${secondPieceTargetPathIndex} >= ${firstPieceTargetPathIndex}`)
          break
        }
      }
      
      if (secondPieceCanOvertake) {
        break
      }
    }
    
    // If second piece can overtake, only allow moves of first piece
    if (secondPieceCanOvertake && firstPieceMoves.length > 0) {
      console.log(`[applyMandatoryMoveRules] Forcing first piece to move`)
      return moves.filter(m => m.pieceId === firstPiece.id)
    }
    
    console.log(`[applyMandatoryMoveRules] No mandatory rules applied`)
    return moves
  }

  /**
   * Get legal moves for a piece
   * Implements the new logic: unified path, forward/backward movement, reflection
   */
  private getPieceMoves(piece: Piece, player: GamePlayer, roll: number): LegalMove[] {
    const moves: LegalMove[] = []

    if (piece.state !== 'active' || piece.positionIndex === null) {
      return moves
    }

    const fullPath = this.getFullPath(player.side)
    const diagonalStartIndex = this.getDiagonalStartIndex(player.side)
    
    // Find current position in fullPath
    const currentPathIndex = fullPath.indexOf(piece.positionIndex)
    if (currentPathIndex === -1) {
      console.error(`[getPieceMoves] Piece ${piece.id} not found in path. Position: ${piece.positionIndex}`)
      return moves // Piece not in path (shouldn't happen)
    }

    // Check if piece can enter diagonal (has completed full lap)
    const canEnterDiagonal = piece.hasCompletedLap

    // If hasn't completed lap, can't enter diagonal
    if (!canEnterDiagonal && currentPathIndex >= diagonalStartIndex) {
      console.error(`[getPieceMoves] Piece ${piece.id} in diagonal without completing lap`)
      return moves // Can't be in diagonal without completing lap
    }

    // Calculate forward movement
    const forwardPathIndex = currentPathIndex + roll
    
    // Check if will reflect (over diagonal end)
    const diagonalEndIndex = fullPath.length - 1
    let finalPathIndex: number
    let willReflect = false
    
    console.log(`[getPieceMoves] Piece ${piece.id}: currentPathIndex=${currentPathIndex}, roll=${roll}, canEnterDiagonal=${canEnterDiagonal}, diagonalStartIndex=${diagonalStartIndex}, diagonalEndIndex=${diagonalEndIndex}`)
    
    // If piece is in or entering diagonal, calculate reflection properly
    if (canEnterDiagonal && currentPathIndex >= diagonalStartIndex) {
      // Piece is already in diagonal
      const stepsToEnd = diagonalEndIndex - currentPathIndex
      
      if (roll > stepsToEnd) {
        // Will reflect: move to end, then back
        willReflect = true
        const remainingSteps = roll - stepsToEnd
        finalPathIndex = diagonalEndIndex - remainingSteps
        
        console.log(`[getPieceMoves] Reflection in diagonal: stepsToEnd=${stepsToEnd}, remainingSteps=${remainingSteps}, finalPathIndex=${finalPathIndex}`)
        
        // If reflection takes piece before diagonal start, move against main path
        if (finalPathIndex < diagonalStartIndex) {
          const stepsIntoMainCircle = diagonalStartIndex - finalPathIndex
          const mainCircleEndIndex = diagonalStartIndex - 1
          const newPosition = this.moveAgainstMainPath(mainCircleEndIndex, stepsIntoMainCircle, player.side)
          console.log(`[getPieceMoves] Moving against main path: stepsIntoMainCircle=${stepsIntoMainCircle}, newPosition=${newPosition}`)
          finalPathIndex = fullPath.indexOf(newPosition)
        }
      } else {
        // Normal forward movement within diagonal
        finalPathIndex = currentPathIndex + roll
      }
    } else if (forwardPathIndex >= diagonalStartIndex && canEnterDiagonal) {
      // Will enter diagonal in this move
      const stepsIntoDiagonal = forwardPathIndex - diagonalStartIndex
      const stepsToEnd = diagonalEndIndex - diagonalStartIndex
      
      if (stepsIntoDiagonal > stepsToEnd) {
        // Will reflect after entering diagonal
        willReflect = true
        const remainingSteps = stepsIntoDiagonal - stepsToEnd
        finalPathIndex = diagonalEndIndex - remainingSteps
        
        console.log(`[getPieceMoves] Reflection when entering diagonal: stepsIntoDiagonal=${stepsIntoDiagonal}, stepsToEnd=${stepsToEnd}, remainingSteps=${remainingSteps}, finalPathIndex=${finalPathIndex}`)
        
        // If reflection takes piece before diagonal start, move against main path
        if (finalPathIndex < diagonalStartIndex) {
          const stepsIntoMainCircle = diagonalStartIndex - finalPathIndex
          const mainCircleEndIndex = diagonalStartIndex - 1
          const newPosition = this.moveAgainstMainPath(mainCircleEndIndex, stepsIntoMainCircle, player.side)
          console.log(`[getPieceMoves] Moving against main path: stepsIntoMainCircle=${stepsIntoMainCircle}, newPosition=${newPosition}`)
          finalPathIndex = fullPath.indexOf(newPosition)
        }
      } else {
        // Normal forward movement into diagonal
        finalPathIndex = forwardPathIndex
      }
    } else {
      // Normal forward movement in main circle
      finalPathIndex = forwardPathIndex
    }
    
    console.log(`[getPieceMoves] Final calculation: finalPathIndex=${finalPathIndex}, fullPath.length=${fullPath.length}`)

    // If piece has completed lap but not yet in diagonal, it must enter diagonal
    if (piece.hasCompletedLap && currentPathIndex < diagonalStartIndex) {
      // Piece has completed lap but is still on start position - must move into diagonal
      console.log(`[getPieceMoves] Piece completed lap, must enter diagonal. finalPathIndex=${finalPathIndex}`)
      
      if (finalPathIndex >= diagonalStartIndex && finalPathIndex < fullPath.length) {
        const targetBoardIndex = fullPath[finalPathIndex]
        
        if (this.isCellFree(targetBoardIndex) || this.canCapture(targetBoardIndex, player.side)) {
          const isPositionFree = !player.pieces.some(p => 
            p.id !== piece.id && 
            p.positionIndex === targetBoardIndex && 
            p.state === 'finished'
          )
          
          if (isPositionFree) {
            moves.push({
              pieceId: piece.id,
              type: 'finish',
              targetIndex: targetBoardIndex,
              description: `Move to diagonal cell ${targetBoardIndex}`
            })
            console.log(`[getPieceMoves] Added move to diagonal: ${targetBoardIndex}`)
          } else {
            console.log(`[getPieceMoves] Position ${targetBoardIndex} blocked by finished piece`)
          }
        } else {
          console.log(`[getPieceMoves] Position ${targetBoardIndex} not free or can't capture`)
        }
      } else {
        console.log(`[getPieceMoves] Cannot enter diagonal with roll ${roll} from position ${currentPathIndex}. finalPathIndex=${finalPathIndex}, diagonalStartIndex=${diagonalStartIndex}`)
        
        // If piece can't enter diagonal with current roll, allow movement in main circle
        // This prevents piece from getting stuck
        if (finalPathIndex >= 0 && finalPathIndex < diagonalStartIndex) {
          const targetBoardIndex = fullPath[finalPathIndex]
          
          if (this.isCellFree(targetBoardIndex) || this.canCapture(targetBoardIndex, player.side)) {
            const isPositionFree = !player.pieces.some(p => 
              p.id !== piece.id && 
              p.positionIndex === targetBoardIndex && 
              p.state === 'finished'
            )
            
            if (isPositionFree) {
              moves.push({
                pieceId: piece.id,
                type: 'move',
                targetIndex: targetBoardIndex,
                description: `Move in main circle to cell ${targetBoardIndex}`
              })
              console.log(`[getPieceMoves] Added main circle move: ${targetBoardIndex}`)
            }
          }
        }
      }
      // Return here - piece with completed lap has limited options
      return moves
    }

    // Normal piece movement (not just completed lap on start position)
    // Check if can move forward
    if (finalPathIndex >= 0 && finalPathIndex < fullPath.length) {
      // IMPORTANT: If piece hasn't completed lap, can't enter diagonal zone
      if (!canEnterDiagonal && finalPathIndex >= diagonalStartIndex) {
        console.log(`[getPieceMoves] Cannot enter diagonal without completing lap. finalPathIndex=${finalPathIndex}, diagonalStartIndex=${diagonalStartIndex}`)
        // No moves available - piece must complete lap first
        return moves
      }
      
      // Additional check: if in diagonal and trying to go before diagonal start, only allow if 1 piece left
      if (canEnterDiagonal && currentPathIndex >= diagonalStartIndex && finalPathIndex < diagonalStartIndex) {
        const activePiecesCount = player.pieces.filter(p => p.state === 'active' && p.hasCompletedLap).length
        if (activePiecesCount === 1) {
          // Allow backward movement to main circle
          const targetBoardIndex = fullPath[finalPathIndex]
          
          if (this.isCellFree(targetBoardIndex) || this.canCapture(targetBoardIndex, player.side)) {
            const isPositionFree = !player.pieces.some(p => 
              p.id !== piece.id && 
              p.positionIndex === targetBoardIndex && 
              p.state === 'finished'
            )
            
            if (isPositionFree) {
              moves.push({
                pieceId: piece.id,
                type: 'move',
                targetIndex: targetBoardIndex,
                description: `Move back to cell ${targetBoardIndex}`
              })
              console.log(`[getPieceMoves] Added backward move to main circle: ${targetBoardIndex}`)
            }
          }
        } else {
          console.log(`[getPieceMoves] Cannot move back from diagonal: activePiecesCount=${activePiecesCount}`)
        }
        // Otherwise, don't allow moving back from diagonal
      } else {
        // Normal forward movement (or backward within diagonal)
        const targetBoardIndex = fullPath[finalPathIndex]
        
        // Check if cell is free or can capture
        if (this.isCellFree(targetBoardIndex) || this.canCapture(targetBoardIndex, player.side)) {
          // Check if this position is not blocked by own finished piece
          const isPositionFree = !player.pieces.some(p => 
            p.id !== piece.id && 
            p.positionIndex === targetBoardIndex && 
            p.state === 'finished'
          )
          
          if (isPositionFree) {
            // Determine move type: finish if in diagonal, move otherwise
            const moveType = (canEnterDiagonal && finalPathIndex >= diagonalStartIndex) ? 'finish' : 'move'
            
            moves.push({
              pieceId: piece.id,
              type: moveType,
              targetIndex: targetBoardIndex,
              description: willReflect 
                ? `Move forward and reflect to cell ${targetBoardIndex}`
                : `Move to cell ${targetBoardIndex}`
            })
            console.log(`[getPieceMoves] Added ${moveType} move: ${targetBoardIndex}`)
          } else {
            console.log(`[getPieceMoves] Position ${targetBoardIndex} blocked by finished piece`)
          }
        } else {
          console.log(`[getPieceMoves] Position ${targetBoardIndex} not free or can't capture`)
        }
      }
    } else {
      console.log(`[getPieceMoves] finalPathIndex ${finalPathIndex} out of bounds [0, ${fullPath.length})`)
    }

    // Check if can move backward (if in diagonal or will reach diagonal)
    if (canEnterDiagonal && currentPathIndex >= diagonalStartIndex) {
      const backwardPathIndex = currentPathIndex - roll
      
      if (backwardPathIndex >= diagonalStartIndex) {
        // Can move backward within diagonal
        const targetBoardIndex = fullPath[backwardPathIndex]
        
        if (this.isCellFree(targetBoardIndex) || this.canCapture(targetBoardIndex, player.side)) {
          const isPositionFree = !player.pieces.some(p => 
            p.id !== piece.id && 
            p.positionIndex === targetBoardIndex && 
            p.state === 'finished'
          )
          
          if (isPositionFree) {
            moves.push({
              pieceId: piece.id,
              type: 'finish',
              targetIndex: targetBoardIndex,
              description: `Move back to cell ${targetBoardIndex}`
            })
          }
        }
      } else if (backwardPathIndex >= 0) {
        // Can move backward to main circle (only if 1 piece left)
        const activePiecesCount = player.pieces.filter(p => p.state === 'active' && p.hasCompletedLap).length
        if (activePiecesCount === 1) {
          const targetBoardIndex = fullPath[backwardPathIndex]
          
          if (this.isCellFree(targetBoardIndex) || this.canCapture(targetBoardIndex, player.side)) {
            moves.push({
              pieceId: piece.id,
              type: 'move',
              targetIndex: targetBoardIndex,
              description: `Move back to cell ${targetBoardIndex}`
            })
          }
        }
      }
    }

    return moves
  }

  /**
   * Move against main path direction in the main circle
   * Player A (clockwise) moves counterclockwise (backward in path array)
   * Player B (counterclockwise) moves clockwise (forward in path array)
   */
  private moveAgainstMainPath(startPathIndex: number, steps: number, side: PlayerSide): number {
    const mainCircle = this.generateMainCircle(side)
    const diagonalStartIndex = mainCircle.length
    
    // startPathIndex is in fullPath, convert to mainCircle index
    if (startPathIndex >= diagonalStartIndex) {
      return diagonalStartIndex // Already in diagonal
    }
    
    const mainCircleIndex = startPathIndex
    
    // Move against main direction
    // Player A (clockwise in main circle) -> move backward (counterclockwise)
    // Player B (counterclockwise in main circle) -> move forward (clockwise)
    let newMainCircleIndex: number
    if (side === 'A') {
      // Move backward in main circle (counterclockwise)
      newMainCircleIndex = mainCircleIndex - steps
      // Wrap around if negative
      if (newMainCircleIndex < 0) {
        newMainCircleIndex = mainCircle.length + (newMainCircleIndex % mainCircle.length)
        if (newMainCircleIndex < 0) {
          newMainCircleIndex = mainCircle.length + newMainCircleIndex
        }
      }
    } else {
      // Move forward in main circle (clockwise)
      newMainCircleIndex = (mainCircleIndex + steps) % mainCircle.length
    }
    
    // Return as fullPath index (same as mainCircle index since diagonal starts after)
    return newMainCircleIndex
  }

  /**
   * Get target cell index for a piece in diagonal
   * After first piece is fixed, next piece targets previous cell
   */
  private getTargetCellIndex(piece: Piece, player: GamePlayer): number | null {
    const fullPath = this.getFullPath(player.side)
    const diagonalStartIndex = this.getDiagonalStartIndex(player.side)
    const diagonalEndIndex = fullPath.length - 1
    
    // Count how many pieces are already fixed
    const fixedPieces = player.pieces.filter(p => p.state === 'finished')
    const targetIndex = diagonalEndIndex - fixedPieces.length
    
    if (targetIndex < diagonalStartIndex) {
      return null // All diagonal cells are taken
    }
    
    return targetIndex
  }

  private isCellFree(boardIndex: number): boolean {
    // Check if any piece is on this cell
    for (const player of this.state.players) {
      for (const piece of player.pieces) {
        if (piece.positionIndex === boardIndex && 
            (piece.state === 'active' || piece.state === 'finished')) {
          return false
        }
      }
    }
    return true
  }

  private canCapture(boardIndex: number, attackerSide: PlayerSide): boolean {
    // Check if opponent's piece is on this cell
    for (const player of this.state.players) {
      if (player.side === attackerSide) continue
      
      for (const piece of player.pieces) {
        if (piece.positionIndex === boardIndex && piece.state === 'active') {
          return true
        }
      }
    }
    return false
  }

  applyMove(playerId: string, move: Move): boolean {
    const player = this.state.players.find(p => p.id === playerId)
    if (!player) {
      return false
    }

    // Check if it's this player's turn
    const currentPlayer = this.getCurrentPlayer()
    if (currentPlayer.id !== playerId) {
      return false
    }

    if (this.state.phase !== 'move' && this.state.phase !== 'decision') {
      return false
    }

    // Validate move is legal
    const legalMoves = this.getLegalMoves(playerId)
    let isValid = false
    
    if (move.type === 'enter') {
      isValid = legalMoves.some(lm => lm.type === 'enter')
    } else {
      isValid = legalMoves.some(
        lm => lm.pieceId === move.pieceId && 
              lm.type === move.type &&
              lm.targetIndex === move.targetIndex
      )
    }

    if (!isValid) {
      return false
    }

    if (move.type === 'enter') {
      // Create new piece
      const startIndex = this.getStartIndex(player.side)
      const newPiece: Piece = {
        id: `piece_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        ownerId: playerId,
        state: 'active',
        positionIndex: startIndex,
        hasCompletedLap: false
      }
      player.pieces.push(newPiece)
    } else if (move.type === 'move' || move.type === 'finish') {
      // Move existing piece
      const piece = player.pieces.find(p => p.id === move.pieceId)
      if (!piece || piece.state !== 'active') {
        return false
      }

      const oldIndex = piece.positionIndex!
      const fullPath = this.getFullPath(player.side)
      const diagonalStartIndex = this.getDiagonalStartIndex(player.side)
      const oldPathIndex = fullPath.indexOf(oldIndex)
      const newPathIndex = fullPath.indexOf(move.targetIndex!)
      const roll = this.state.lastDiceRoll!
      
      // Check if will complete lap in this move
      // Lap is completed when piece reaches diagonal zone (pathIndex >= diagonalStartIndex)
      const startIndex = this.getStartIndex(player.side)
      const startPathIndex = fullPath.indexOf(startIndex)
      
      console.log(`[applyMove] Checking lap completion: piece=${piece.id}, boardPos=${piece.positionIndex}, oldPathIndex=${oldPathIndex}, newPathIndex=${newPathIndex}, diagonalStartIndex=${diagonalStartIndex}, hasCompletedLap=${piece.hasCompletedLap}`)
      
      // Set hasCompletedLap when piece reaches diagonal zone for the first time
      if (!piece.hasCompletedLap) {
        // Check if piece is entering diagonal zone (was before diagonal, now in/at diagonal)
        if (oldPathIndex < diagonalStartIndex && newPathIndex >= diagonalStartIndex) {
          piece.hasCompletedLap = true
          console.log(`[applyMove] ✓ Completed lap: reached diagonal zone at pathIndex ${newPathIndex}`)
        } else {
          console.log(`[applyMove] ✗ No lap completion: pathIndex ${oldPathIndex} → ${newPathIndex}, diagonalStart ${diagonalStartIndex}`)
        }
      }
      
      // Calculate movement path (all cells passed through)
      const movementPath = this.calculateMovementPath(oldPathIndex, move.targetIndex!, fullPath, roll)
      
      // Store path for capture resolution
      this.lastMovePath = {
        pieceId: piece.id,
        oldIndex: oldIndex,
        newIndex: move.targetIndex!,
        path: movementPath
      }
      
      piece.positionIndex = move.targetIndex!

      // Check if piece should be fixed (exact hit on target cell)
      if (move.type === 'finish' && piece.hasCompletedLap) {
        const targetIndex = this.getTargetCellIndex(piece, player)
        if (targetIndex !== null && newPathIndex === targetIndex) {
          piece.state = 'finished'
        }
      }
    }

    this.state.phase = 'resolve'
    return true
  }

  /**
   * Calculate all cells passed through during movement
   */
  private calculateMovementPath(oldPathIndex: number, newBoardIndex: number, fullPath: number[], roll: number): number[] {
    const path: number[] = []
    const newPathIndex = fullPath.indexOf(newBoardIndex)
    const diagonalEndIndex = fullPath.length - 1
    
    // Check if will reflect
    const forwardPathIndex = oldPathIndex + roll
    const willReflect = forwardPathIndex > diagonalEndIndex
    
    if (willReflect) {
      // Forward to end, then backward
      // Step 1: Forward from old position to end of diagonal
      for (let i = oldPathIndex + 1; i <= diagonalEndIndex; i++) {
        path.push(fullPath[i])
      }
      // Step 2: Backward from end (reflection)
      const overshoot = forwardPathIndex - diagonalEndIndex
      for (let i = diagonalEndIndex - 1; i >= newPathIndex; i--) {
        path.push(fullPath[i])
      }
    } else {
      // Simple forward movement (including diagonal if applicable)
      for (let i = oldPathIndex + 1; i <= newPathIndex; i++) {
        path.push(fullPath[i])
      }
    }
    
    return path
  }

  /**
   * Resolve captures: pieces that are stepped on or passed through are captured
   */
  resolveCaptures(): string[] {
    const capturedPieces: string[] = []
    const capturedPieceIds = new Set<string>()

    // If we have last move path, check all cells on that path
    if (this.lastMovePath) {
      const { path: movementPath } = this.lastMovePath
      
      // Check all cells on movement path for pieces
      for (const cellIndex of movementPath) {
        for (let i = 0; i < this.state.players.length; i++) {
          const attacker = this.state.players[i]
          
          for (const attackerPiece of attacker.pieces) {
            if (attackerPiece.id !== this.lastMovePath.pieceId) continue
            if (attackerPiece.state !== 'active' || attackerPiece.positionIndex === null) {
              continue
            }

            // Check all other players (NOT own pieces - can't capture own)
            for (let j = 0; j < this.state.players.length; j++) {
              if (i === j) continue // Skip own player
              
              const defender = this.state.players[j]
              
              for (const defenderPiece of defender.pieces) {
                // Skip if same piece or already captured
                if (attackerPiece.id === defenderPiece.id || capturedPieceIds.has(defenderPiece.id)) {
                  continue
                }
                
                if (defenderPiece.state !== 'active' || defenderPiece.positionIndex === null) {
                  continue
                }

                // Check if defender piece is on this cell (passed through)
                if (defenderPiece.positionIndex === cellIndex) {
                  // Capture! Return piece to inactive
                  defenderPiece.state = 'inactive'
                  defenderPiece.positionIndex = null
                  defenderPiece.hasCompletedLap = false
                  capturedPieces.push(defenderPiece.id)
                  capturedPieceIds.add(defenderPiece.id)
                }
              }
            }
          }
        }
      }
      
      // Clear last move path
      this.lastMovePath = null
    }

    // Also check for pieces on same final cell (stepped on)
    for (let i = 0; i < this.state.players.length; i++) {
      const attacker = this.state.players[i]
      
      for (const attackerPiece of attacker.pieces) {
        if (attackerPiece.state !== 'active' || attackerPiece.positionIndex === null) {
          continue
        }

        // Check all other players (NOT own pieces - can't capture own)
        for (let j = 0; j < this.state.players.length; j++) {
          if (i === j) continue // Skip own player
          
          const defender = this.state.players[j]
          
          for (const defenderPiece of defender.pieces) {
            // Skip if same piece or already captured
            if (attackerPiece.id === defenderPiece.id || capturedPieceIds.has(defenderPiece.id)) {
              continue
            }
            
            if (defenderPiece.state !== 'active' || defenderPiece.positionIndex === null) {
              continue
            }

            // Check if on same cell (stepped on)
            if (attackerPiece.positionIndex === defenderPiece.positionIndex) {
              // Capture! Return piece to inactive
              defenderPiece.state = 'inactive'
              defenderPiece.positionIndex = null
              defenderPiece.hasCompletedLap = false
              capturedPieces.push(defenderPiece.id)
              capturedPieceIds.add(defenderPiece.id)
            }
          }
        }
      }
    }

    this.state.phase = 'end_turn'
    return capturedPieces
  }

  checkFinish(): void {
    // Check if any piece finished
    for (const player of this.state.players) {
      for (const piece of player.pieces) {
        if (piece.state === 'finished') {
          // Piece is fixed in diagonal
        }
      }
    }
  }

  checkWin(): PlayerSide | null {
    // Win condition: all 4 diagonal cells are filled with pieces (hasCompletedLap = true)
    for (const player of this.state.players) {
      const fullPath = this.getFullPath(player.side)
      const diagonalStartIndex = this.getDiagonalStartIndex(player.side)
      const diagonalEndIndex = fullPath.length - 1
      
      // Get all pieces in diagonal with hasCompletedLap
      const piecesInDiagonal = player.pieces.filter(p => {
        if (!p.hasCompletedLap || p.positionIndex === null) return false
        const pathIndex = fullPath.indexOf(p.positionIndex!)
        return pathIndex >= diagonalStartIndex && pathIndex <= diagonalEndIndex
      })
      
      // Check if all 4 diagonal positions are occupied
      const occupiedPositions = new Set<number>()
      for (const piece of piecesInDiagonal) {
        const pathIndex = fullPath.indexOf(piece.positionIndex!)
        if (pathIndex >= diagonalStartIndex && pathIndex <= diagonalEndIndex) {
          occupiedPositions.add(pathIndex)
        }
      }
      
      // Win if all 4 diagonal positions are filled
      if (occupiedPositions.size === 4) {
        this.state.winner = player.side
        this.state.phase = 'end_turn'
        return player.side
      }
    }
    return null
  }

  endTurn(): void {
    // Move to next player
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length
    this.state.phase = 'roll'
    this.state.lastDiceRoll = null
  }
}
