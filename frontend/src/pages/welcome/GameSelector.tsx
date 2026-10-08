import { useApp } from '../../context/AppContext';
import { useEffect, useRef, useState } from 'react';
import { navigate } from 'vike/client/router';
import './GameSelector.css';

function GameSelector({ forceTab }: { forceTab?: string } = {}) {
  const { t, pageContext } = useApp();
  const parts = pageContext.urlPathname.split('/');
  const rawSubPage = parts[2] || 'singleplayer';
  const currentSubPage = rawSubPage === 'multiplayer-create' ? 'multiplayer' : rawSubPage;

  const navItems = [
    { id: 'leaderboard', label: 'leaderboard_button', href: '/welcome/leaderboard' },
    { id: 'singleplayer', label: 'single_player_button', href: '/welcome/singleplayer' },
    { id: 'multiplayer', label: 'multiplayer_button', href: '/welcome/multiplayer' },
    { id: 'challenges', label: 'challenges_button', href: '/welcome/challenges' },
  ];

  // activeTab is local so it updates immediately on click, before navigation
  const [activeTab, setActiveTab] = useState(forceTab ?? currentSubPage);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({ opacity: 0 });

  // Sync if URL changes externally — only when not forced
  useEffect(() => {
    if (!forceTab) setActiveTab(currentSubPage);
  }, [currentSubPage, forceTab]);

  useEffect(() => {
    const updateSlider = () => {
      if (!containerRef.current) return;
      const activeBtn = containerRef.current.querySelector('.segment-button.active') as HTMLElement;
      if (!activeBtn) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setSliderStyle({ left: btnRect.left - containerRect.left, width: btnRect.width, opacity: 1 });
    };
    updateSlider();
    window.addEventListener('resize', updateSlider);
    return () => window.removeEventListener('resize', updateSlider);
  }, [activeTab, t]);

  const handleClick = (item: typeof navItems[0]) => {
    setActiveTab(item.id);
    // Small delay so the slide animation plays before navigation
    setTimeout(() => navigate(item.href), 200);
  };

  return (
    <div className="game-nav-container">
      <div className="segmented-control" ref={containerRef}>
        <div className="segment-slider" style={sliderStyle} />
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleClick(item)}
            className={`segment-button ${activeTab === item.id ? 'active' : ''}`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default GameSelector;