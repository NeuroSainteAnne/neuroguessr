import "./Sfnr.css"
import { useEffect, useState } from "react";
import { navigate } from 'vike/client/router'

function SfnrScreen() {
    const [enabledChallenges, setEnabledChallenges] = useState({
        challenge1: false,
        challenge2: false,
        challenge3: false
    });

    useEffect(() => {
        // Check which challenges should be enabled based on Paris timezone date
        const checkChallengeAvailability = () => {
            // Get current date/time in Paris timezone
            const now = new Date();
            const parisTimeStr = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
            const parisDate = new Date(parisTimeStr);
            
            const year = parisDate.getFullYear();
            const month = parisDate.getMonth(); // 0-indexed (March = 2)
            const day = parisDate.getDate();
            
            // Challenge dates in 2026
            const challenge1FakeDate = new Date(2026, 2, 2); // March 11, 2026
            const challenge2FakeDate = new Date(2026, 2, 3); // March 11, 2026
            const challenge3FakeDate = new Date(2026, 2, 4); // March 11, 2026
            const challenge1Fake2Date = new Date(2026, 2, 5); // March 11, 2026
            const challenge2Fake2Date = new Date(2026, 2, 6); // March 11, 2026
            const challenge3Fake2Date = new Date(2026, 2, 7); // March 11, 2026
            const challenge1Fake3Date = new Date(2026, 2, 8); // March 11, 2026
            const challenge2Fake3Date = new Date(2026, 2, 9); // March 11, 2026
            const challenge3Fake3Date = new Date(2026, 2, 10); // March 11, 2026
            const challenge1Date = new Date(2026, 2, 11); // March 11, 2026
            const challenge2Date = new Date(2026, 2, 12); // March 12, 2026
            const challenge3Date = new Date(2026, 2, 13); // March 13, 2026
            
            // Create a date object with just year/month/day for comparison
            const currentDate = new Date(year, month, day);
            
            setEnabledChallenges({
                challenge1: currentDate.getTime() === challenge1Date.getTime() ||
                            currentDate.getTime() === challenge1FakeDate.getTime() ||
                            currentDate.getTime() === challenge1Fake2Date.getTime() ||
                            currentDate.getTime() === challenge1Fake3Date.getTime(),
                challenge2: currentDate.getTime() === challenge2Date.getTime() ||
                            currentDate.getTime() === challenge2FakeDate.getTime() ||
                            currentDate.getTime() === challenge2Fake2Date.getTime() ||
                            currentDate.getTime() === challenge2Fake3Date.getTime(),
                challenge3: currentDate.getTime() === challenge3Date.getTime() ||
                            currentDate.getTime() === challenge3FakeDate.getTime() ||
                            currentDate.getTime() === challenge3Fake2Date.getTime() ||
                            currentDate.getTime() === challenge3Fake3Date.getTime()
            });
        };
        
        checkChallengeAvailability();
        // Recheck every minute in case the date changes while the page is open
        const interval = setInterval(checkChallengeAvailability, 60000);
        
        return () => clearInterval(interval);
    }, []);

    return <>
          <title>NeuroGuessr - SFNR</title>
          <div className='sfnr-container'>
            <span className="sfnr-header">
              <span className="sfnr-header-text">
                <span className="sfnr-header-title">Bienvenue sur l'événement spécial SFNR 2026</span>
                <span className="sfnr-header-subtitle-container">
                  <span className="sfnr-header-subtitle">
                    Participez à l'événement spécial SFNR 2026 !<br />
                    Chaque jour du congrès, participez à un challenge unique.<br />
                    Trouvez des régions cérébrales dans un temps limité<br />
                    Gagnez des points en répondant rapidement<br/>
                    Et que les meilleurs gagnent !
                  </span>
                </span>
              </span>
              <span>
                <img src="/interface/sfnr2026.png" alt="SFNR Logo" className="sfnr-logo" />
              </span>
            </span>
            <span className="sfnr-elements-container">
              <span className="sfnr-element sfnr-element1">
                <span className="sfnr-element-title">Mercredi 11 mars</span>
                <span className="sfnr-element-subtitle">Challenge 1: Gyrus et noyaux gris</span>
                <span className="sfnr-element-subtitle">Durée: 2 minutes</span>
                <button className='sfnr-element-button' disabled={!enabledChallenges.challenge1}
                   onClick={()=>{enabledChallenges.challenge1 && navigate('/multiplayer/20260311')}}>
                  {enabledChallenges.challenge1 ? 'Participer' : 'Disponible le 11 mars'}
                </button>
              </span>
              <span className="sfnr-element sfnr-element2">
                <span className="sfnr-element-title">Jeudi 12 mars</span>
                <span className="sfnr-element-subtitle">Challenge 2: Sillons et substance blanche</span>
                <span className="sfnr-element-subtitle">Durée: 3 minutes</span>
                <button className='sfnr-element-button' disabled={!enabledChallenges.challenge2}
                   onClick={()=>{enabledChallenges.challenge2 && navigate('/multiplayer/20260312')}}>
                  {enabledChallenges.challenge2 ? 'Participer' : 'Disponible le 12 mars'}
                </button>
              </span>
              <span className="sfnr-element sfnr-element3">
                <span className="sfnr-element-title">Vendredi 13 mars</span>
                <span className="sfnr-element-subtitle">Challenge 3: Tout l'encéphale !</span>
                <span className="sfnr-element-subtitle">Durée: 4 minutes</span>
                <button className='sfnr-element-button' disabled={!enabledChallenges.challenge3}
                   onClick={()=>{enabledChallenges.challenge3 && navigate('/multiplayer/20260313')}}>
                  {enabledChallenges.challenge3 ? 'Participer' : 'Disponible le 13 mars'}
                </button>
              </span>
            </span>
          </div>
      </>
}

export default SfnrScreen
