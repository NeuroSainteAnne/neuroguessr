import { useApp } from '../context/AppContext';
import { formatTime } from '../utils/formatters';
import { SingleRTChallenge } from './SingleRTChallenge';

export function NextChallenge() {
  const { 
    t, 
    nextChallenge, 
    nextChallengeLoading, 
    nextChallengeError 
  } = useApp();

  const formatTimeUntilStart = (startTime: string) => {
    const now = new Date();
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();
    
    if (diff <= 0) return t('starting_now');
    return `${t('starts_in')} ${formatTime({ms:diff, showSeconds:false})}`
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  if (nextChallengeLoading || nextChallengeError || !nextChallenge) {
    return (<></>);
  }

  return (
    <SingleRTChallenge 
      isNext={true}
      sessionCode={nextChallenge.sessionCode}
      startTime={formatTimeUntilStart(nextChallenge.startTime)}
      scheduledTime={formatDateTime(nextChallenge.startTime)}
      name={nextChallenge.name || undefined} />
  );
}

