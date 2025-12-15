import React, { useEffect, useState } from 'react'
import './Particles.css'

interface ParticlesProps {
  x: number // Board cell x (0-7)
  y: number // Board cell y (0-7)
  color: 'blue' | 'red'
  onComplete?: () => void
}

interface Particle {
  id: number
  angle: number
  velocity: number
  life: number
}

const Particles: React.FC<ParticlesProps> = ({ x, y, color, onComplete }) => {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    // Generate particles
    const newParticles: Particle[] = []
    for (let i = 0; i < 12; i++) {
      newParticles.push({
        id: i,
        angle: (Math.PI * 2 * i) / 12 + Math.random() * 0.3,
        velocity: 50 + Math.random() * 50,
        life: 1
      })
    }
    setParticles(newParticles)

    // Auto-complete after animation
    const timer = setTimeout(() => {
      if (onComplete) onComplete()
    }, 800)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div 
      className="particles-container"
      style={{
        top: `${y * 12.5}%`,
        left: `${x * 12.5}%`,
      }}
    >
      {particles.map(particle => (
        <div
          key={particle.id}
          className={`particle particle-${color}`}
          style={{
            '--angle': `${particle.angle}rad`,
            '--velocity': `${particle.velocity}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

export default Particles



