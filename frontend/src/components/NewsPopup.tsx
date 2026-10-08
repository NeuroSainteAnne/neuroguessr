import { useEffect, useRef, useState } from 'react';
import './NewsPopup.css';

interface NewsItem {
  id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export function NewsPopup() {
  const [news, setNews] = useState<NewsItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news/active');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.news) return;

        // Don't show if already dismissed for this version of the news
        const dismissedKey = `news_dismissed_${data.news.id}_${data.news.updated_at}`;
        if (typeof localStorage !== 'undefined' && localStorage.getItem(dismissedKey)) return;

        setNews(data.news);
        timerRef.current = setTimeout(() => setVisible(true), 200);
      } catch (_) {}
    };
    fetchNews();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    if (news && typeof localStorage !== 'undefined') {
      localStorage.setItem(`news_dismissed_${news.id}_${news.updated_at}`, '1');
    }
    setTimeout(() => setDismissed(true), 350);
  };

  if (!news || dismissed) return null;

  return (
    <div className={`news-slidein${visible ? ' news-slidein--visible' : ''}`}>
      <button className="news-slidein-close" onClick={handleDismiss} aria-label="Fermer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div className="news-slidein-body">
        <span className="news-slidein-label">Nouveauté</span>
        <h3 className="news-slidein-title">{news.title}</h3>
        <p className="news-slidein-description">{news.description}</p>
      </div>
    </div>
  );
}
