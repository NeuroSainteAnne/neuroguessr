import { useApp } from '../context/AppContext';
import { SingleChallenge } from './SingleChallenge';

export function NextChallenge() {
  const { 
    nextChallenge, 
    nextChallengeLoading, 
    nextChallengeError 
  } = useApp();

  if (nextChallengeLoading || nextChallengeError || !nextChallenge) {
    return (<></>);
  }

  return (
    <SingleChallenge 
      challenge={{
        isNext: true,
        ...nextChallenge
      }} />
  );
}

