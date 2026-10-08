import React, { useEffect, useState } from 'react';
import { navigate } from 'vike/client/router';
import { useApp } from '../context/AppContext';
import LandingAtlasViewer from './LandingAtlasViewer';

const LOGO_BLUE = '#4a90e2';

const NeuroGuessrLandingPage: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { t } = useApp();

  useEffect(() => {
    setIsClient(true);
    // Detect mobile viewport
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize(); // Check on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSignIn = () => {
    navigate('/login');
  };

  const handleSignUp = () => {
    navigate('/register');
  };

  const handleContinue = () => {
    navigate('/welcome/singleplayer');
  };

  // Available height between header (80px) and footer (52px)
  const AVAILABLE_HEIGHT = 'calc(100vh - 132px)';
  // Viewer size: square, fits within available height with padding
  const VIEWER_SIZE = 'min(calc(100vh - 152px), 598px)';

  return (
    <div
      style={{
        fontFamily: `'Open Sans', 'Helvetica Neue', sans-serif`,
        backgroundColor: '#000000',
        backgroundImage: 'none',
        margin: 0,
        padding: 0,
        width: '100%',
        height: AVAILABLE_HEIGHT,
        overflow: 'hidden',
        display: 'flex',
      }}
    >
      {/* Left column: Brain Viewer — 50% of page, viewer square centered inside */}
      {!isMobile && (
        <div
          style={{
            flex: '0 0 50%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            padding: '40px',
            boxSizing: 'border-box',
          }}
        >
          {isClient && (
            <div
              style={{
                width: VIEWER_SIZE,
                height: VIEWER_SIZE,
                borderRadius: '12px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <LandingAtlasViewer />
            </div>
          )}
        </div>
      )}

      {/* Right column: Sign-in panel — 50% of page (or 100% on mobile), content centered */}
      <div
        style={{
          flex: isMobile ? '1' : '0 0 50%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
          padding: isMobile ? '16px' : '40px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? '16px' : '24px',
              width: '100%',
              maxWidth: '380px',
            }}
          >
            {/* Welcome text */}
            <div style={{ textAlign: 'center' }} suppressHydrationWarning>
              <h1 style={{
                fontSize: isMobile ? '1.6rem' : '3rem',
                fontWeight: 300,
                color: '#fff',
                margin: '0 0 6px 0',
                fontFamily: "'Open Sans', sans-serif",
              }}>
                {isClient ? (t('welcome_to_neuroguessr') || "Welcome to NeuroGuessr") : "Welcome to NeuroGuessr"}
              </h1>
              <p style={{
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                fontWeight: 300,
                color: '#ccc',
                margin: 0,
                fontFamily: "'Open Sans', sans-serif",
                lineHeight: '1.5',
              }}>
                {isClient ? (t('landing_tagline') || "Test your neuroanatomy knowledge") : "Test your neuroanatomy knowledge"}
              </p>
            </div>

            {/* Sign-in panel */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: isMobile ? '10px' : '16px',
                backgroundColor: '#1e1e1e',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '12px',
                padding: isMobile ? '20px 16px' : '32px 24px',
              }}
            >
              <button
                onClick={handleSignIn}
                style={{
                  backgroundColor: LOGO_BLUE,
                  color: '#fff',
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 400,
                  width: '100%',
                  transition: 'all 0.2s ease',
                  fontFamily: "'Open Sans', sans-serif",
                }}
                suppressHydrationWarning
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#357abd';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = LOGO_BLUE;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {t('sign_in')}
              </button>

              <button
                onClick={handleSignUp}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.07)',
                  color: '#fff',
                  padding: '12px 24px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 400,
                  width: '100%',
                  transition: 'all 0.2s ease',
                  fontFamily: "'Open Sans', sans-serif",
                }}
                suppressHydrationWarning
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.07)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {t('sign_up')}
              </button>

              <button
                onClick={handleContinue}
                style={{
                  backgroundColor: 'transparent',
                  color: '#aaa',
                  padding: '10px 24px',
                  border: 'none',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 400,
                  width: '100%',
                  transition: 'all 0.2s ease',
                  fontFamily: "'Open Sans', sans-serif",
                  textDecoration: 'underline',
                  marginTop: '10px'
                }}
                suppressHydrationWarning
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#aaa';
                }}
              >
                {t('no_sign_in')}
              </button>
            </div>
          </div>
        </div>
    </div>
  );
};

export default NeuroGuessrLandingPage;
