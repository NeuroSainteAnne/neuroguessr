import { useState } from 'react';
import { useApp } from '../context/AppContext';

interface Props {
  challengeId: number | string | null | undefined;
  className?: string;
}

export default function ChallengeEmailOptIn({ challengeId, className }: Props) {
  const { authToken, isLoggedIn, t } = useApp();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleClick = async () => {
    if (!challengeId || !authToken || !isLoggedIn || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/multi/challenge-email-optin/${challengeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        setSent(true);
      } else {
        console.error('Email opt-in failed', res.statusText);
      }
    } catch (err) {
      console.error('Error during email opt-in', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className={className || 'email-optin-btn'}
      onClick={handleClick}
      disabled={loading || sent}
    >
      {loading && <i className="fas fa-sync-alt fa-spinner fa-spin" />}
      {sent ? t('email_optin_sent') || 'Demande prise en compte!' : (t('email_optin_button') || 'Recevoir résultats finaux par email')}
    </button>
  );
}
