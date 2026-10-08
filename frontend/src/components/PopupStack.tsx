import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { SingleChallenge } from './SingleChallenge';
import './PopupStack.css';

interface NewsItem {
  id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export function PopupStack() {
  const { nextChallenge, nextChallengeLoading, nextChallengeError, pageContext, headerMessages, t } = useApp();

  // Hide news/challenge popups during any active gameplay (including navigation)
  const path = pageContext?.urlPathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  const isNavigation = /^\/singleplayer\/navigation/.test(path);
  const isGameplay = /^\/(singleplayer|multiplayer)\//.test(path);

  // ── Region detail popup (navigation mode) ──
  const infoMsg = isNavigation ? headerMessages[1] : null;
  const rawInfoContent = infoMsg?.infoContent || null;
  const shortDesc = infoMsg?.text || null;
  // If the long description starts with the short one, strip it to avoid visual duplicate
  const infoContent = rawInfoContent && shortDesc && rawInfoContent.startsWith(shortDesc)
    ? rawInfoContent.slice(shortDesc.length).replace(/^[\s.,:;–-]+/, '')
    : rawInfoContent;
  const infoSource = infoMsg?.infoSource || null;
  const regionName = isNavigation ? headerMessages[0]?.text || null : null;

  const [infoVisible, setInfoVisible] = useState(false);
  const [infoDismissedKey, setInfoDismissedKey] = useState<string | null>(null);
  const infoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
    if (!infoContent) { setInfoVisible(false); return; }
    // If region changed (new key), show again
    const key = regionName + '||' + infoContent;
    if (key === infoDismissedKey) return;
    setInfoVisible(false);
    infoTimerRef.current = setTimeout(() => setInfoVisible(true), 80);
    return () => { if (infoTimerRef.current) clearTimeout(infoTimerRef.current); };
  }, [infoContent, regionName]);

  const dismissInfo = () => {
    setInfoVisible(false);
    setInfoDismissedKey(regionName + '||' + infoContent);
  };

  // ── News state ──
  const [news, setNews] = useState<NewsItem | null>(null);
  const [newsVisible, setNewsVisible] = useState(false);
  const [newsDismissed, setNewsDismissed] = useState(false);
  const newsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Challenge dismiss state ──
  const [challengeDismissed, setChallengeDismissed] = useState(false);
  const [challengeVisible, setChallengeVisible] = useState(false);
  const challengeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch news
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news/active');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.news) return;
        const dismissedKey = `news_dismissed_${data.news.id}_${data.news.updated_at}`;
        if (typeof localStorage !== 'undefined' && localStorage.getItem(dismissedKey)) return;
        setNews(data.news);
        newsTimerRef.current = setTimeout(() => setNewsVisible(true), 200);
      } catch (_) {}
    };
    fetchNews();
    return () => { if (newsTimerRef.current) clearTimeout(newsTimerRef.current); };
  }, []);

  // Slide-in challenge after load
  useEffect(() => {
    if (!nextChallenge || nextChallengeLoading || nextChallengeError) return;
    const key = `challenge_dismissed_${nextChallenge.sessionCode}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
    challengeTimerRef.current = setTimeout(() => setChallengeVisible(true), 80);
    return () => { if (challengeTimerRef.current) clearTimeout(challengeTimerRef.current); };
  }, [nextChallenge, nextChallengeLoading, nextChallengeError]);

  const dismissNews = () => {
    setNewsVisible(false);
    if (news && typeof localStorage !== 'undefined') {
      localStorage.setItem(`news_dismissed_${news.id}_${news.updated_at}`, '1');
    }
    setTimeout(() => setNewsDismissed(true), 350);
  };

  const dismissChallenge = () => {
    setChallengeVisible(false);
    if (nextChallenge && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`challenge_dismissed_${nextChallenge.sessionCode}`, '1');
    }
    setTimeout(() => setChallengeDismissed(true), 350);
  };

  const showChallenge = !isGameplay && nextChallenge && !nextChallengeError && !nextChallengeLoading && !challengeDismissed;
  const showNews = !isGameplay && news && !newsDismissed;
  const showInfo = isNavigation && !!infoContent;

  if (!showChallenge && !showNews && !showInfo) return null;

  return (
    <div className="popup-stack">
      {/* Region detail — navigation mode */}
      {showInfo && (
        <div className={`popup-stack-item popup-stack-item--info${infoVisible ? ' popup-stack-item--visible' : ''}`}>
          <button className="popup-stack-close" onClick={dismissInfo} aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="popup-info-body">
            <span className="popup-info-label">{t ? t("more_details") : "En savoir plus"}</span>
            <p className="popup-info-content">{infoContent}</p>
            {infoSource && infoSource.length > 0 && (
              <div className="popup-info-sources">
                {infoSource.map((source, idx) => {
                  const href = source.doi ? (source.doi.startsWith('http') ? source.doi : `https://doi.org/${source.doi}`) : undefined;
                  const citation = `${source.auteur} (${source.year}) — ${source.journal}`;
                  return href ? (
                    <a key={idx} className="popup-info-source" href={href} target="_blank" rel="noopener noreferrer">
                      📖 {citation}
                    </a>
                  ) : (
                    <p key={idx} className="popup-info-source">📖 {citation}</p>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Challenge — bottom slot */}
      {showChallenge && (
        <div className={`popup-stack-item${challengeVisible ? ' popup-stack-item--visible' : ''}`}>
          <button className="popup-stack-close" onClick={dismissChallenge} aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <SingleChallenge challenge={{ isNext: true, ...nextChallenge }} />
        </div>
      )}

      {/* News — stacked above challenge */}
      {showNews && (
        <div className={`popup-stack-item popup-stack-item--news${newsVisible ? ' popup-stack-item--visible' : ''}`}>
          <button className="popup-stack-close" onClick={dismissNews} aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="popup-news-body">
            <span className="popup-news-label">Nouveauté</span>
            <h3 className="popup-news-title">{news!.title}</h3>
            <p className="popup-news-description">{news!.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
