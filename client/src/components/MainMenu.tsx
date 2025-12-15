import { useState } from 'react'
import { Socket } from 'socket.io-client'
import { GameStats } from '../types/game'
import BotGameMenu from './BotGameMenu'
import './MainMenu.css'

interface MainMenuProps {
  socket: Socket | null
  stats: GameStats
  connected?: boolean
}

function MainMenu({ socket, stats, connected }: MainMenuProps) {
  const [showBotMenu, setShowBotMenu] = useState(false)

  const handleBotGame = () => {
    setShowBotMenu(true)
  }

  const handleOnlineGame = () => {
    alert('🚧 Возможно в будущем...')
  }

  const handleBack = () => {
    setShowBotMenu(false)
  }

  if (showBotMenu) {
    return <BotGameMenu socket={socket} onBack={handleBack} />
  }

  return (
    <div className="main-menu">
      <div className="disclaimer">
        ⚠️ Игра сделана за 30 минут и имеет множество багов
      </div>
      
      <div className="stats-panel">
        <div className="stat-item">
          <span className="stat-label">Онлайн</span>
          <span className="stat-value">{stats.playersOnline}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">В очереди</span>
          <span className="stat-value">{stats.playersInQueue}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Игр</span>
          <span className="stat-value">{stats.activeMatches}</span>
        </div>
      </div>

      <div className="menu-content">
        <h1 className="menu-title">Dess Game</h1>
        
        <div className="menu-buttons">
          <button 
            className="menu-button primary"
            onClick={handleBotGame}
            disabled={!connected || !socket}
          >
            Играть против бота
          </button>
          
          <button 
            className="menu-button primary"
            onClick={handleOnlineGame}
            disabled={!connected || !socket}
          >
            Онлайн
          </button>
        </div>
      </div>
    </div>
  )
}

export default MainMenu

