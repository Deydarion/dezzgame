import { GameEngine } from './GameEngine'
import { LegalMove, Move, BotDifficulty, Piece } from '../types/game'

/**
 * BotService - AI для игры с 3 уровнями сложности
 * Написан с нуля для устранения всех багов
 */
export class BotService {
  private difficulty: BotDifficulty

  constructor(difficulty: BotDifficulty = 'medium') {
    this.difficulty = difficulty
  }

  /**
   * Главная функция выбора хода
   */
  makeMove(engine: GameEngine, botPlayerId: string): Move | null {
    const legalMoves = engine.getLegalMoves(botPlayerId)
    
    if (legalMoves.length === 0) {
      console.log(`[BotService] No legal moves available`)
      return null
    }

    console.log(`[BotService] Analyzing ${legalMoves.length} legal moves with difficulty: ${this.difficulty}`)

    // Выбираем стратегию по уровню сложности
    let selectedMove: Move | null = null

    switch (this.difficulty) {
      case 'easy':
        selectedMove = this.easyLogic(legalMoves, engine, botPlayerId)
        break
      case 'medium':
        selectedMove = this.mediumLogic(legalMoves, engine, botPlayerId)
        break
      case 'hard':
        selectedMove = this.hardLogic(legalMoves, engine, botPlayerId)
        break
      default:
        selectedMove = this.mediumLogic(legalMoves, engine, botPlayerId)
    }

    console.log(`[BotService] Selected move:`, selectedMove)
    return selectedMove
  }

  // =========================================================================
  // ЛЕГКИЙ УРОВЕНЬ
  // =========================================================================

  /**
   * ЛЕГКИЙ:
   * - Всегда предпочитает ходить существующей фишкой
   * - При выпадении 6: только 20% шанс поставить новую
   */
  private easyLogic(legalMoves: LegalMove[], engine: GameEngine, botPlayerId: string): Move {
    const enterMoves = legalMoves.filter(m => m.type === 'enter')
    const otherMoves = legalMoves.filter(m => m.type !== 'enter')

    // Если есть выбор между enter и движением
    if (enterMoves.length > 0 && otherMoves.length > 0) {
      // 20% шанс поставить новую фишку
      const shouldEnter = Math.random() < 0.2
      
      if (shouldEnter) {
        console.log(`[BotService-Easy] Chose to enter new piece (20% chance)`)
        return this.toMove(enterMoves[0])
      } else {
        console.log(`[BotService-Easy] Chose to move existing piece (80% chance)`)
        return this.toMove(this.pickRandom(otherMoves))
      }
    }

    // Если только enter
    if (enterMoves.length > 0) {
      console.log(`[BotService-Easy] Only enter available`)
      return this.toMove(enterMoves[0])
    }

    // Если только обычные ходы - выбираем случайный
    console.log(`[BotService-Easy] Picking random move`)
    return this.toMove(this.pickRandom(legalMoves))
  }

  // =========================================================================
  // НОРМАЛЬНЫЙ УРОВЕНЬ
  // =========================================================================

  /**
   * НОРМАЛЬНЫЙ:
   * - При выпадении 6: ставит новую ЕСЛИ не может съесть оппонента 
   *   И фишка оппонента дальше 6 клеток от спавна
   * - Предпочитает фишку, которая ближе к фишке оппонента
   */
  private mediumLogic(legalMoves: LegalMove[], engine: GameEngine, botPlayerId: string): Move {
    const state = engine.getState()
    const botPlayer = state.players.find(p => p.id === botPlayerId)!
    const opponent = state.players.find(p => p.id !== botPlayerId)!

    const enterMoves = legalMoves.filter(m => m.type === 'enter')
    const moveMoves = legalMoves.filter(m => m.type === 'move')
    const finishMoves = legalMoves.filter(m => m.type === 'finish')

    // ПРИОРИТЕТ 1: Финиш (если можем зафиксировать фишку)
    if (finishMoves.length > 0) {
      console.log(`[BotService-Medium] Finishing piece`)
      return this.toMove(finishMoves[0])
    }

    // ПРИОРИТЕТ 2: Если есть выбор между enter и движением (выпало 6)
    if (enterMoves.length > 0 && moveMoves.length > 0) {
      // Проверяем, можем ли съесть оппонента этим ходом
      const captureMove = this.findCapture(moveMoves, opponent, engine)
      if (captureMove) {
        console.log(`[BotService-Medium] Can capture opponent - not entering`)
        return this.toMove(captureMove)
      }

      // Проверяем, есть ли оппонент близко к спавну (в пределах 6 клеток)
      const opponentNearby = this.isOpponentNear(opponent, 6)
      
      if (opponentNearby) {
        console.log(`[BotService-Medium] Opponent within 6 cells - not entering`)
        // Ходим ближайшей к оппоненту фишкой
        const bestMove = this.pickClosestToOpponent(moveMoves, botPlayer, opponent)
        return this.toMove(bestMove)
      } else {
        console.log(`[BotService-Medium] Opponent far away - entering new piece`)
        return this.toMove(enterMoves[0])
      }
    }

    // ПРИОРИТЕТ 3: Только enter
    if (enterMoves.length > 0) {
      console.log(`[BotService-Medium] Only enter available`)
      return this.toMove(enterMoves[0])
    }

    // ПРИОРИТЕТ 4: Обычные ходы - выбираем ближайшую к оппоненту
    if (moveMoves.length > 0) {
      console.log(`[BotService-Medium] Moving closest piece to opponent`)
      const bestMove = this.pickClosestToOpponent(moveMoves, botPlayer, opponent)
      return this.toMove(bestMove)
    }

    // Fallback
    return this.toMove(legalMoves[0])
  }

  // =========================================================================
  // СЛОЖНЫЙ УРОВЕНЬ
  // =========================================================================

  /**
   * СЛОЖНЫЙ:
   * Все из нормального +
   * - При выходе на диагональ: ходит только если приведет к финишу (при 2 фишках)
   * - Стратегия засады: фишка в 1-3 клетках от спавна оппонента (при 2 фишках)
   * - При 1 фишке: просто ходит
   */
  private hardLogic(legalMoves: LegalMove[], engine: GameEngine, botPlayerId: string): Move {
    const state = engine.getState()
    const botPlayer = state.players.find(p => p.id === botPlayerId)!
    const opponent = state.players.find(p => p.id !== botPlayerId)!

    const activePieces = botPlayer.pieces.filter(p => p.state === 'active')
    const enterMoves = legalMoves.filter(m => m.type === 'enter')
    const moveMoves = legalMoves.filter(m => m.type === 'move')
    const finishMoves = legalMoves.filter(m => m.type === 'finish')

    // ПРИОРИТЕТ 1: Финиш (если можем зафиксировать фишку)
    if (finishMoves.length > 0) {
      console.log(`[BotService-Hard] Finishing piece`)
      return this.toMove(finishMoves[0])
    }

    // ПРИОРИТЕТ 2: Если есть выбор между enter и движением (выпало 6)
    if (enterMoves.length > 0 && moveMoves.length > 0) {
      // Проверяем, можем ли съесть оппонента этим ходом
      const captureMove = this.findCapture(moveMoves, opponent, engine)
      if (captureMove) {
        console.log(`[BotService-Hard] Can capture opponent - not entering`)
        return this.toMove(captureMove)
      }

      // Проверяем, есть ли оппонент близко к спавну (в пределах 6 клеток)
      const opponentNearby = this.isOpponentNear(opponent, 6)
      
      if (opponentNearby) {
        console.log(`[BotService-Hard] Opponent within 6 cells - not entering`)
        // Продолжаем с hard-логикой движения
      } else {
        console.log(`[BotService-Hard] Opponent far away - entering new piece`)
        return this.toMove(enterMoves[0])
      }
    }

    // ПРИОРИТЕТ 3: Только enter
    if (enterMoves.length > 0 && moveMoves.length === 0) {
      console.log(`[BotService-Hard] Only enter available`)
      return this.toMove(enterMoves[0])
    }

    // === HARD-СПЕЦИФИЧНЫЕ СТРАТЕГИИ ===

    // Если у нас 2 фишки - используем продвинутые стратегии
    if (activePieces.length === 2) {
      console.log(`[BotService-Hard] 2 pieces - applying advanced strategies`)

      // СТРАТЕГИЯ 1: Засада около спавна оппонента (1-3 клетки)
      const ambushMove = this.findAmbushPosition(moveMoves, botPlayer, opponent, engine)
      if (ambushMove) {
        console.log(`[BotService-Hard] Setting up ambush near opponent spawn`)
        return this.toMove(ambushMove)
      }

      // СТРАТЕГИЯ 2: Не ходить фишкой в диагонали, если не финиш
      const filteredMoves = this.filterDiagonalNonFinish(moveMoves, botPlayer)
      if (filteredMoves.length > 0) {
        console.log(`[BotService-Hard] Moving non-diagonal piece`)
        const bestMove = this.pickClosestToOpponent(filteredMoves, botPlayer, opponent)
        return this.toMove(bestMove)
      }

      // Если после фильтра нет ходов - выбираем любой
      console.log(`[BotService-Hard] No filtered moves, picking best available`)
    }

    // При 1 фишке или если нет специальных ходов - просто выбираем лучший
    if (moveMoves.length > 0) {
      console.log(`[BotService-Hard] Moving best piece (1 piece or default)`)
      const bestMove = this.pickClosestToOpponent(moveMoves, botPlayer, opponent)
      return this.toMove(bestMove)
    }

    // Fallback
    return this.toMove(legalMoves[0])
  }

  // =========================================================================
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // =========================================================================

  /**
   * Находит ход, который захватит фишку оппонента
   */
  private findCapture(moves: LegalMove[], opponent: any, engine: GameEngine): LegalMove | null {
    for (const move of moves) {
      if (move.targetIndex === null || move.targetIndex === undefined) continue

      // Проверяем, есть ли на целевой клетке активная фишка оппонента
      for (const oppPiece of opponent.pieces) {
        if (oppPiece.state !== 'active' || oppPiece.pathIndex === null) continue

        const oppBoardIndex = engine.pathToBoardIndex(oppPiece.pathIndex, opponent.side)
        
        if (oppBoardIndex === move.targetIndex) {
          return move
        }
      }
    }

    return null
  }

  /**
   * Проверяет, есть ли активные фишки оппонента в пределах N клеток от старта
   */
  private isOpponentNear(opponent: any, maxDistance: number): boolean {
    for (const piece of opponent.pieces) {
      if (piece.state === 'active' && piece.pathIndex !== null) {
        if (piece.pathIndex < maxDistance) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Выбирает ход фишкой, которая ближе всего к фишке оппонента
   */
  private pickClosestToOpponent(moves: LegalMove[], botPlayer: any, opponent: any): LegalMove {
    // Находим ближайшую фишку оппонента
    const opponentPieces = opponent.pieces.filter((p: Piece) => 
      p.state === 'active' && p.pathIndex !== null
    )

    if (opponentPieces.length === 0) {
      // Нет активных фишек оппонента - выбираем фишку с наибольшим pathIndex
      return this.pickFarthest(moves, botPlayer)
    }

    // Находим фишку оппонента с минимальным pathIndex (ближайшая к старту)
    let minOpponentPath = Infinity
    for (const oppPiece of opponentPieces) {
      if (oppPiece.pathIndex < minOpponentPath) {
        minOpponentPath = oppPiece.pathIndex
      }
    }

    // Выбираем нашу фишку, которая ближе всего к этой фишке оппонента
    let bestMove = moves[0]
    let minDistance = Infinity

    for (const move of moves) {
      const piece = botPlayer.pieces.find((p: Piece) => p.id === move.pieceId)
      if (!piece || piece.pathIndex === null) continue

      const distance = Math.abs(piece.pathIndex - minOpponentPath)

      if (distance < minDistance) {
        minDistance = distance
        bestMove = move
      }
    }

    return bestMove
  }

  /**
   * Выбирает ход фишкой с наибольшим pathIndex (самая продвинутая)
   */
  private pickFarthest(moves: LegalMove[], botPlayer: any): LegalMove {
    let bestMove = moves[0]
    let maxPath = -1

    for (const move of moves) {
      const piece = botPlayer.pieces.find((p: Piece) => p.id === move.pieceId)
      if (!piece || piece.pathIndex === null) continue

      if (piece.pathIndex > maxPath) {
        maxPath = piece.pathIndex
        bestMove = move
      }
    }

    return bestMove
  }

  /**
   * HARD: Находит ход для засады (остановиться в 1-3 клетках от спавна оппонента)
   * Засада работает на клетках 25-27 (перед спавном 0)
   */
  private findAmbushPosition(moves: LegalMove[], botPlayer: any, opponent: any, engine: GameEngine): LegalMove | null {
    // Определяем зону засады - это клетки 25, 26, 27 (перед клеткой 0 - спавн)
    const ambushZone = [25, 26, 27]

    // Проверяем, есть ли уже фишка в зоне засады
    let hasAmbushPiece = false
    for (const piece of botPlayer.pieces) {
      if (piece.state === 'active' && piece.pathIndex !== null) {
        if (ambushZone.includes(piece.pathIndex)) {
          hasAmbushPiece = true
          break
        }
      }
    }

    // Если уже есть фишка в засаде - не нужно ставить еще одну
    if (hasAmbushPiece) {
      return null
    }

    // Ищем ход, который поставит фишку в зону засады
    const roll = engine.getState().lastDiceRoll || 0

    for (const move of moves) {
      const piece = botPlayer.pieces.find((p: Piece) => p.id === move.pieceId)
      if (!piece || piece.pathIndex === null) continue

      // Вычисляем, где окажется фишка после хода
      const newPathIndex = piece.pathIndex + roll

      if (ambushZone.includes(newPathIndex)) {
        return move
      }
    }

    return null
  }

  /**
   * HARD: Фильтрует ходы - не ходить фишкой в диагонали, если не финиш
   */
  private filterDiagonalNonFinish(moves: LegalMove[], botPlayer: any): LegalMove[] {
    return moves.filter(move => {
      const piece = botPlayer.pieces.find((p: Piece) => p.id === move.pieceId)
      if (!piece || piece.pathIndex === null) return true

      // Если фишка в диагонали (pathIndex >= 28)
      if (piece.pathIndex >= 28) {
        // Разрешаем только finish
        return move.type === 'finish'
      }

      // Все остальные ходы разрешены
      return true
    })
  }

  /**
   * Выбирает случайный элемент из массива
   */
  private pickRandom(moves: LegalMove[]): LegalMove {
    const index = Math.floor(Math.random() * moves.length)
    return moves[index]
  }

  /**
   * Конвертирует LegalMove в Move
   */
  private toMove(legalMove: LegalMove): Move {
    return {
      pieceId: legalMove.pieceId,
      type: legalMove.type,
      targetIndex: legalMove.targetIndex !== null && legalMove.targetIndex !== undefined
        ? legalMove.targetIndex
        : undefined
    }
  }
}


