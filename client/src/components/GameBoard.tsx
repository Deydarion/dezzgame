import { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import { GameState, LegalMove, Piece, PlayerSide } from '../types/game'
import DiceAnimation from './DiceAnimation'
import Particles from './Particles'
import WinnerPopup from './WinnerPopup'
import './GameBoard.css'

interface GameBoardProps {
  socket: Socket | null
  sessionId: string
  gameState: GameState | null
  playerId: string | null
}

function GameBoard({ socket, sessionId, gameState: propGameState, playerId }: GameBoardProps) {
  const [localGameState, setLocalGameState] = useState<GameState | null>(propGameState)
  const [legalMoves, setLegalMoves] = useState<LegalMove[]>([])
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null)
  const [highlightedCells, setHighlightedCells] = useState<Set<number>>(new Set())
  const [showEnterChoice, setShowEnterChoice] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<{ text: string; id: number } | null>(null)
  const [diceRollValue, setDiceRollValue] = useState<number | null>(null)
  const [showDiceAnimation, setShowDiceAnimation] = useState(false)
  const [pieceTrail, setPieceTrail] = useState<number[]>([]) // Board indices for green trail
  const [animatingPieceId, setAnimatingPieceId] = useState<string | null>(null)
  const [animatingPiecePath, setAnimatingPiecePath] = useState<number[]>([]) // Full path of board indices
  const [animatingPieceStep, setAnimatingPieceStep] = useState<number>(0) // Current step in path
  const [captureParticles, setCaptureParticles] = useState<Array<{ id: string; x: number; y: number; color: 'blue' | 'red' }>>([])
  const [showWinner, setShowWinner] = useState<{ winner: string; isMe: boolean } | null>(null)

  // Local game state reference
  const gameState = localGameState

  // Sync local state with prop
  useEffect(() => {
    if (propGameState) {
      setLocalGameState(propGameState)
    }
  }, [propGameState])

  // Show toast notifications based on game state
  useEffect(() => {
    if (!gameState || !playerId) return
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    const isMyTurn = currentPlayer?.id === playerId
    
    if (!isMyTurn) return
    
    // Show toast when it's time to roll
    if (gameState.phase === 'roll') {
      showToast('🎲 Ваш ход! Бросьте кубик', 2000)
    }
    
    // Show toast when it's time to move (but not during decision phase)
    if (gameState.phase === 'move' && legalMoves.length > 0 && !selectedPiece) {
      showToast('👆 Нажмите на фигуру, затем на подсвеченную клетку', 3000)
    }
    
    // Show "Клетка Занята" if rolled 6 but can't spawn (and have less than 2 pieces)
    if (gameState.phase === 'decision' && gameState.lastDiceRoll === 6 && !legalMoves.some(m => m.type === 'enter')) {
      const myPlayer = gameState.players.find(p => p.id === playerId)
      const activePieces = myPlayer?.pieces.filter(p => p.state !== 'finished').length || 0
      if (activePieces < 2) {
        showToast('⚠️ Клетка Занята - выберите фигуру для хода', 3000)
      }
    }
  }, [gameState?.phase, gameState?.currentPlayerIndex, gameState?.lastDiceRoll, legalMoves.length, selectedPiece])

  // Function to show toast notification
  const showToast = (text: string, duration: number = 3000) => {
    const id = Date.now()
    setToastMessage({ text, id })
    setTimeout(() => {
      setToastMessage(prev => prev?.id === id ? null : prev)
    }, duration)
  }

  // Create 8x8 grid (64 cells)
  const cells = Array.from({ length: 64 }, (_, i) => i)
  
  // Starting positions
  const playerAStart = 56
  const playerBStart = 7

  useEffect(() => {
    if (!socket || !gameState || !playerId) return

    const handleLegalMoves = (data: { moves: LegalMove[]; gameState: GameState }) => {
      console.log('Received legal moves:', data.moves.length, data.moves)
      console.log('Game state phase:', data.gameState.phase)
      console.log('Current player index:', data.gameState.currentPlayerIndex)
      console.log('Current player ID:', data.gameState.players[data.gameState.currentPlayerIndex]?.id)
      console.log('My player ID:', playerId)
      
      setLegalMoves(data.moves)
      
      // If no moves available, clear highlights
      if (data.moves.length === 0) {
        setHighlightedCells(new Set())
        setShowEnterChoice(false)
        setSelectedPiece(null)
        return
      }
      
      // Check if we need to show enter choice - ONLY if it's my turn
      const currentPlayer = data.gameState.players[data.gameState.currentPlayerIndex]
      const isMyTurn = currentPlayer.id === playerId
      
      const hasEnterMove = data.moves.some(m => m.type === 'enter')
      const hasMoveMoves = data.moves.some(m => m.type !== 'enter')
      
      console.log('isMyTurn:', isMyTurn, 'hasEnterMove:', hasEnterMove, 'hasMoveMoves:', hasMoveMoves, 'phase:', data.gameState.phase)
      
      // Only show choice if BOTH options are available AND it's my turn
      if (isMyTurn && data.gameState.phase === 'decision' && hasEnterMove && hasMoveMoves) {
        console.log('Showing enter choice UI - both options available')
        setShowEnterChoice(true)
        setHighlightedCells(new Set()) // Don't highlight until choice is made
      } else if (isMyTurn && data.gameState.phase === 'decision' && hasEnterMove && !hasMoveMoves) {
        // Only enter move available - highlight the spawn cell
        console.log('Only enter move available - highlighting spawn cell')
        setShowEnterChoice(false)
        const targets = new Set<number>()
        data.moves.forEach(move => {
          if (move.type === 'enter' && move.targetIndex !== null) {
            targets.add(move.targetIndex)
          }
        })
        setHighlightedCells(targets)
      } else {
        console.log('Not showing enter choice UI')
        setShowEnterChoice(false)
        // Highlight target cells only if it's my turn
        if (isMyTurn) {
          const targets = new Set<number>()
          data.moves.forEach(move => {
            if (move.targetIndex !== null) {
              targets.add(move.targetIndex)
            }
          })
          setHighlightedCells(targets)
        } else {
          setHighlightedCells(new Set())
        }
      }
    }

    const handleDiceRolled = (data: { roll: number; playerId: string; gameState: GameState; hasLegalMoves?: boolean }) => {
      console.log('Dice rolled, new phase:', data.gameState.phase, 'hasLegalMoves:', data.hasLegalMoves, 'playerId:', data.playerId, 'myId:', playerId)
      
      // Show dice animation (will stay until next roll)
      setDiceRollValue(data.roll)
      setShowDiceAnimation(true)
      
      // Update game state
      setLocalGameState(data.gameState)
      
      // Clear trail when dice is rolled
      setPieceTrail([])
      
      // Only request legal moves if it's MY turn (the player who rolled is me)
      const isMyRoll = data.playerId === playerId
      
      if (isMyRoll && (data.gameState.phase === 'move' || data.gameState.phase === 'decision') && data.hasLegalMoves !== false) {
        console.log('Requesting legal moves after my dice roll')
        // Use setTimeout to ensure state is updated first
        setTimeout(() => {
          socket.emit('getLegalMoves', { sessionId })
        }, 200)
      } else if (isMyRoll && data.hasLegalMoves === false) {
        console.log('No legal moves available, turn should end automatically')
      } else if (!isMyRoll) {
        // Clear my UI if it's not my turn
        setShowEnterChoice(false)
        setHighlightedCells(new Set())
        setSelectedPiece(null)
      }
    }

    const handleGameState = (data: { gameState: GameState }) => {
      setLocalGameState(data.gameState)
      // Update legal moves when game state changes - ONLY if it's my turn
      const currentPlayer = data.gameState.players[data.gameState.currentPlayerIndex]
      const isMyTurn = currentPlayer.id === playerId
      
      if (isMyTurn && (data.gameState.phase === 'move' || data.gameState.phase === 'decision')) {
        socket.emit('getLegalMoves', { sessionId })
      } else {
        // Clear UI if it's not my turn
        setShowEnterChoice(false)
        setHighlightedCells(new Set())
        setSelectedPiece(null)
      }
    }
    
    const handleTurnEnded = (data: { gameState: GameState }) => {
      console.log('Turn ended event, clearing UI state')
      console.log('New game state:', data.gameState)
      console.log('Current player index:', data.gameState.currentPlayerIndex)
      console.log('Current player ID:', data.gameState.players[data.gameState.currentPlayerIndex]?.id)
      console.log('My player ID:', playerId)
      console.log('Phase:', data.gameState.phase)
      
      setLocalGameState(data.gameState)
      // Clear all UI state (but NOT animations - they clear themselves)
      setLegalMoves([])
      setSelectedPiece(null)
      setHighlightedCells(new Set())
      setShowEnterChoice(false)
    }
    
    const handleMoveApplied = (data: { move: any; playerId: string; captured: string[]; gameState: GameState; winner?: string | null }) => {
      console.log('Move applied:', data)
      
      // Check for winner
      if (data.winner) {
        const isMe = data.winner === playerId || (gameState?.players.find(p => p.side === data.winner)?.id === playerId)
        setTimeout(() => {
          setShowWinner({ winner: data.winner!, isMe })
        }, 1000) // Show after animations complete
      }
      
      // Start animation for the moved piece
      const { move, gameState: newState, captured } = data
      
      if (move.pieceId !== 'new' && move.targetIndex !== null && move.targetIndex !== undefined) {
        // Find the piece that moved
        const piece = newState.players.flatMap(p => p.pieces).find(p => p.id === move.pieceId)
        if (piece && piece.pathIndex !== null) {
          const player = newState.players.find(p => p.id === piece.ownerId)
          if (player) {
            // Calculate previous position (current pathIndex in OLD state vs NEW state)
            const oldPiece = gameState?.players.flatMap(p => p.pieces).find(p => p.id === move.pieceId)
            if (oldPiece && oldPiece.pathIndex !== null) {
              const oldBoardIndex = pathToBoardIndex(oldPiece.pathIndex, player.side)
              const newPathIndex = piece.pathIndex
              
              // Calculate trail
              const trail = calculateTrailBoardIndices(oldPiece.pathIndex, newPathIndex, player.side)
              const fullPath = [oldBoardIndex, ...trail]
              
              // Start animation
              startPieceAnimation(move.pieceId, fullPath)
            }
          }
        }
      }
      
      // Show capture particles
      if (captured && captured.length > 0) {
        captured.forEach((capturedId) => {
          // Find captured piece position in old state
          const capturedPiece = gameState?.players.flatMap(p => p.pieces).find(p => p.id === capturedId)
          if (capturedPiece && capturedPiece.pathIndex !== null) {
            const capturedPlayer = gameState.players.find(p => p.id === capturedPiece.ownerId)
            if (capturedPlayer) {
              const boardIndex = pathToBoardIndex(capturedPiece.pathIndex, capturedPlayer.side)
              const x = boardIndex % 8
              const y = Math.floor(boardIndex / 8)
              const color = capturedPlayer.side === 'A' ? 'blue' : 'red'
              
              setCaptureParticles(prev => [...prev, { id: capturedId + Date.now(), x, y, color }])
            }
          }
        })
      }
      
      // Don't update game state here - turnEnded will handle it with correct state
      // Animations will still work because they use the data from moveApplied event
    }
    
    const startPieceAnimation = (pieceId: string, fullPath: number[]) => {
      setAnimatingPieceId(pieceId)
      setAnimatingPiecePath(fullPath)
      setAnimatingPieceStep(0)
      setPieceTrail([])
      
      // Animate step by step
      let currentStep = 0
      const stepInterval = setInterval(() => {
        if (currentStep < fullPath.length - 1) {
          currentStep++
          setAnimatingPieceStep(currentStep)
          
          // Add trail for previous position
          setPieceTrail(prev => {
            if (!prev.includes(fullPath[currentStep - 1])) {
              return [...prev, fullPath[currentStep - 1]]
            }
            return prev
          })
        } else {
          clearInterval(stepInterval)
          // Clear animation after short delay
          setTimeout(() => {
            setAnimatingPieceId(null)
            setAnimatingPiecePath([])
            setAnimatingPieceStep(0)
            setPieceTrail([])
          }, 300)
        }
      }, 80) // 80ms per step
    }

    const handleGameError = (error: { message: string }) => {
      console.error('Game error:', error.message)
      setErrorMessage(error.message)
      setTimeout(() => setErrorMessage(null), 5000) // Clear after 5 seconds
    }

    socket.on('legalMoves', handleLegalMoves)
    socket.on('gameState', handleGameState)
    socket.on('diceRolled', handleDiceRolled)
    socket.on('moveApplied', handleMoveApplied)
    socket.on('turnEnded', handleTurnEnded)
    socket.on('gameError', handleGameError)

    // Request legal moves if in move phase
    if (gameState.phase === 'move' || gameState.phase === 'decision') {
      socket.emit('getLegalMoves', { sessionId })
    }

    return () => {
      socket.off('legalMoves', handleLegalMoves)
      socket.off('gameState', handleGameState)
      socket.off('diceRolled', handleDiceRolled)
      socket.off('moveApplied', handleMoveApplied)
      socket.off('turnEnded', handleTurnEnded)
      socket.off('gameError', handleGameError)
    }
  }, [socket, sessionId, gameState, playerId])

  // Convert pathIndex to boardIndex for display
  const pathToBoardIndex = (pathIndex: number, side: PlayerSide): number => {
    const mappingA = [
      56, 57, 58, 59, 60, 61, 62, 63, // Bottom row
      55, 47, 39, 31, 23, 15, 7,      // Right column
      6, 5, 4, 3, 2, 1, 0,             // Top row
      8, 16, 24, 32, 40, 48,           // Left column
      56, 49, 42, 35                   // Diagonal
    ]
    
    const mappingB = [
      7, 6, 5, 4, 3, 2, 1, 0,          // Top row
      8, 16, 24, 32, 40, 48, 56,       // Left column
      57, 58, 59, 60, 61, 62, 63,      // Bottom row
      55, 47, 39, 31, 23, 15,          // Right column
      7, 14, 21, 28                    // Diagonal
    ]
    
    return side === 'A' ? mappingA[pathIndex] : mappingB[pathIndex]
  }

  // Calculate trail board indices for animation
  const calculateTrailBoardIndices = (oldPathIndex: number, newPathIndex: number, side: PlayerSide): number[] => {
    const trail: number[] = []
    const roll = Math.abs(newPathIndex - oldPathIndex)
    
    // Simple forward movement (no reflection)
    if (oldPathIndex + roll <= 31 && newPathIndex > oldPathIndex) {
      for (let i = oldPathIndex + 1; i <= newPathIndex; i++) {
        trail.push(pathToBoardIndex(i, side))
      }
    } else if (oldPathIndex + roll > 31) {
      // Reflection: forward to 31, then backward
      for (let i = oldPathIndex + 1; i <= 31; i++) {
        trail.push(pathToBoardIndex(i, side))
      }
      for (let i = 30; i >= newPathIndex; i--) {
        trail.push(pathToBoardIndex(i, side))
      }
    }
    
    return trail
  }

  const getPieceAtCell = (cellIndex: number): Piece | null => {
    if (!gameState) return null
    
    for (const player of gameState.players) {
      for (const piece of player.pieces) {
        // Convert pathIndex to boardIndex for comparison
        if (piece.pathIndex !== null && (piece.state === 'active' || piece.state === 'finished')) {
          const boardIndex = pathToBoardIndex(piece.pathIndex, player.side)
          if (boardIndex === cellIndex) {
            return piece
          }
        }
      }
    }
    return null
  }

  const getPlayerSide = (piece: Piece): PlayerSide | null => {
    if (!gameState) return null
    
    const player = gameState.players.find(p => p.id === piece.ownerId)
    return player?.side || null
  }

  const canSelectPiece = (piece: Piece): boolean => {
    if (!gameState || !playerId) return false
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    if (currentPlayer.id !== playerId) return false
    
    if (gameState.phase !== 'move' && gameState.phase !== 'decision') return false
    
    // Check if this piece has legal moves
    return legalMoves.some(move => move.pieceId === piece.id)
  }

  const handleCellClick = (cellIndex: number) => {
    if (!socket || !gameState || !playerId) return

    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    if (currentPlayer.id !== playerId) return

    if (gameState.phase !== 'move' && gameState.phase !== 'decision') return

    // FIRST: If clicking on highlighted cell (including "stay in place"), make move
    if (highlightedCells.has(cellIndex)) {
      const move = legalMoves.find(m => m.targetIndex === cellIndex)
      if (move) {
        executeMove(move)
        return
      }
    }

    // SECOND: If clicking on own piece, select it
    const piece = getPieceAtCell(cellIndex)
    if (piece && piece.ownerId === playerId && canSelectPiece(piece)) {
      setSelectedPiece(piece.id)
      // Filter moves for this piece
      const pieceMoves = legalMoves.filter(m => m.pieceId === piece.id)
      const targets = new Set(pieceMoves.map(m => m.targetIndex).filter((idx): idx is number => idx !== null))
      setHighlightedCells(targets)
      return
    }
  }

  const executeMove = (move: LegalMove) => {
    if (!socket) return

    // Just emit the move - animation will be handled by moveApplied event
    socket.emit('applyMove', {
      sessionId,
      move: {
        pieceId: move.pieceId === 'new' ? 'new' : move.pieceId,
        type: move.type,
        targetIndex: move.targetIndex !== null ? move.targetIndex : undefined
      }
    })

    setSelectedPiece(null)
    setHighlightedCells(new Set())
    setShowEnterChoice(false)
  }

  const handleEnterPiece = () => {
    const enterMove = legalMoves.find(m => m.type === 'enter')
    if (enterMove) {
      executeMove(enterMove)
      setShowEnterChoice(false)
    }
  }

  const handleMoveExisting = () => {
    // Filter out enter moves and show only move moves
    const moveMoves = legalMoves.filter(m => m.type !== 'enter')
    setLegalMoves(moveMoves)
    setShowEnterChoice(false)
    
    // Highlight target cells
    const targets = new Set<number>()
    moveMoves.forEach(move => {
      if (move.targetIndex !== null) {
        targets.add(move.targetIndex)
      }
    })
    setHighlightedCells(targets)
  }

  const getCellClass = (index: number) => {
    const row = Math.floor(index / 8)
    const col = index % 8
    const isDark = (row + col) % 2 === 1
    
    let classes = 'board-cell'
    classes += isDark ? ' dark' : ' light'
    
    // Only show start markers if no piece is there
    const piece = getPieceAtCell(index)
    if (!piece) {
      if (index === playerAStart) {
        classes += ' start-a'
      } else if (index === playerBStart) {
        classes += ' start-b'
      }
    }

    if (highlightedCells.has(index)) {
      classes += ' legal-move'
    }
    
    // Show trail during piece movement
    if (pieceTrail.includes(index)) {
      classes += ' trail'
    }

    if (piece && piece.ownerId === playerId) {
      if (canSelectPiece(piece)) {
        classes += ' selectable'
      }
      if (selectedPiece === piece.id) {
        classes += ' selected'
      }
    }

    return classes
  }

  const renderPiece = (index: number) => {
    const piece = getPieceAtCell(index)
    
    // Don't render piece at old position if it's animating
    if (animatingPieceId && piece && piece.id === animatingPieceId && animatingPiecePath.length > 0 && animatingPiecePath[0] === index) {
      return null
    }
    
    if (!piece) return null

    const side = getPlayerSide(piece)
    if (!side) return null

    const isFinished = piece.state === 'finished'
    const classes = `piece player-${side.toLowerCase()} ${isFinished ? 'finished' : ''}`

    return <div className={classes} />
  }
  
  // Render animating piece separately
  const renderAnimatingPiece = () => {
    if (!animatingPieceId || animatingPiecePath.length === 0 || !gameState) return null
    
    const piece = gameState.players
      .flatMap(p => p.pieces)
      .find(p => p.id === animatingPieceId)
    
    if (!piece) return null
    
    const side = getPlayerSide(piece)
    if (!side) return null
    
    const currentBoardIndex = animatingPiecePath[animatingPieceStep]
    const row = Math.floor(currentBoardIndex / 8)
    const col = currentBoardIndex % 8
    
    const classes = `piece player-${side.toLowerCase()} animating-piece`
    
    return (
      <div 
        className={classes}
        style={{
          top: `${row * 12.5}%`,
          left: `${col * 12.5}%`,
        }}
      />
    )
  }

  const currentPlayer = gameState?.players[gameState.currentPlayerIndex]
  const isMyTurn = currentPlayer?.id === playerId
  const canRoll = gameState?.phase === 'roll' && isMyTurn

  return (
    <div className="game-board">
      {errorMessage && (
        <div className="error-message">
          <span>{errorMessage}</span>
          <button className="error-close" onClick={() => setErrorMessage(null)}>×</button>
        </div>
      )}
      
      {toastMessage && (
        <div className="toast-notification">
          <p>{toastMessage.text}</p>
        </div>
      )}
      
      {gameState && (
        <div className="game-status">
          <div className={`current-player ${isMyTurn ? 'active' : ''}`}>
            {isMyTurn ? 'Ваш ход' : `Ход игрока ${currentPlayer?.side}`}
          </div>
          <div className="dice-results">
            {gameState.players.map((player) => {
              const playerRoll = gameState.playerDiceRolls?.[player.id]
              const isPlayerMe = player.id === playerId
              return (
                <div key={player.id} className={`dice-result ${isPlayerMe ? 'my-roll' : ''}`}>
                  <span className="dice-label">
                    {isPlayerMe ? 'You' : `P${player.side}`}:
                  </span>
                  <span className="dice-value">
                    {playerRoll !== undefined ? playerRoll : '-'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="dice-container">
        {canRoll && (
          <button 
            className="dice-button"
            onClick={() => socket?.emit('rollDice', { sessionId })}
          >
            Бросить кубик
          </button>
        )}
        {!canRoll && gameState && !isMyTurn && (
          <div className="waiting-for-player">
            {currentPlayer?.id.startsWith('bot_') ? 'Бот думает...' : `Ожидание игрока ${currentPlayer?.side}...`}
          </div>
        )}
      </div>



      {showEnterChoice && isMyTurn && gameState && gameState.phase === 'decision' && legalMoves.some(m => m.type === 'enter') && legalMoves.some(m => m.type !== 'enter') && (
        <div className="enter-choice">
          <p>Выпала 6! Выберите:</p>
          <div className="choice-buttons">
            <button 
              className="choice-button"
              onClick={handleEnterPiece}
            >
              Поставить новую фигуру
            </button>
            <button 
              className="choice-button"
              onClick={handleMoveExisting}
            >
              Двигать существующую
            </button>
          </div>
        </div>
      )}


      <div className="board-grid">
        {cells.map((index) => (
          <div 
            key={index} 
            className={getCellClass(index)}
            onClick={() => handleCellClick(index)}
          >
            {renderPiece(index)}
          </div>
        ))}
        {renderAnimatingPiece()}
        
        {showDiceAnimation && diceRollValue && (
          <DiceAnimation value={diceRollValue} />
        )}
        
        {captureParticles.map(particle => (
          <Particles
            key={particle.id}
            x={particle.x}
            y={particle.y}
            color={particle.color}
            onComplete={() => {
              setCaptureParticles(prev => prev.filter(p => p.id !== particle.id))
            }}
          />
        ))}
        
        {showWinner && (
          <WinnerPopup
            winner={showWinner.winner}
            isMe={showWinner.isMe}
            onClose={() => setShowWinner(null)}
          />
        )}
      </div>
    </div>
  )
}

export default GameBoard
