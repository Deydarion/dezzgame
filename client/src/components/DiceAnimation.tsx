import React, { useEffect, useState } from 'react'
import './DiceAnimation.css'

interface DiceAnimationProps {
  value: number | null
  onComplete?: () => void
}

const DiceAnimation: React.FC<DiceAnimationProps> = ({ value, onComplete }) => {
  const [isRolling, setIsRolling] = useState(true)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    if (value !== null) {
      setIsRolling(true)
      
      // Random position: within 4x4 cells around center (center is at 50%, 50%)
      // Each cell is 12.5% of board width
      // Random offset: -2 to +2 cells (i.e., -25% to +25%)
      const offsetX = (Math.random() - 0.5) * 50 // -25% to +25%
      const offsetY = (Math.random() - 0.5) * 50
      const randomRotation = Math.random() * 360
      
      setPosition({ x: offsetX, y: offsetY })
      setRotation(randomRotation)
      
      // Roll for 600ms, then show result
      const timer = setTimeout(() => {
        setIsRolling(false)
        if (onComplete) {
          onComplete()
        }
      }, 600)

      return () => clearTimeout(timer)
    }
  }, [value, onComplete])

  if (value === null) return null

  // Render dots based on dice value
  const renderDots = (num: number) => {
    const dots = []
    
    // Position classes for different values
    const patterns: Record<number, string[]> = {
      1: ['center'],
      2: ['top-left', 'bottom-right'],
      3: ['top-left', 'center', 'bottom-right'],
      4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
      6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
    }

    const positions = patterns[num] || []
    
    for (let i = 0; i < positions.length; i++) {
      dots.push(<div key={i} className={`dice-dot ${positions[i]}`}></div>)
    }

    return dots
  }

  return (
    <div 
      className="dice-overlay-board"
      style={{
        '--dice-x': `${position.x}%`,
        '--dice-y': `${position.y}%`,
        '--dice-rotation': `${rotation}deg`,
      } as React.CSSProperties}
    >
      <div className={`dice-3d ${isRolling ? 'rolling' : 'landed'}`}>
        <div className="dice-face dice-front">
          {value && renderDots(value)}
        </div>
        <div className="dice-face dice-back">
          {renderDots(value === 6 ? 1 : 7 - (value || 1))}
        </div>
        <div className="dice-face dice-top">
          {renderDots(5)}
        </div>
        <div className="dice-face dice-bottom">
          {renderDots(2)}
        </div>
        <div className="dice-face dice-left">
          {renderDots(3)}
        </div>
        <div className="dice-face dice-right">
          {renderDots(4)}
        </div>
      </div>
    </div>
  )
}

export default DiceAnimation

