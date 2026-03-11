import { useApp } from '../context/AppContext';
import { SingleChallenge } from './SingleChallenge';

export function NextChallenge() {
  const { 
    nextChallenge, 
    nextChallengeLoading, 
    nextChallengeError 
  } = useApp();

  return (
    (nextChallenge && !nextChallengeError && !nextChallengeLoading) && <SingleChallenge 
      challenge={{
        isNext: true,
        ...nextChallenge
      }} />
  );
}

