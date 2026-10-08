import { navigate } from 'vike/client/router';
import { useApp } from '../../context/AppContext';
import { useEffect } from 'react';
import { LoadingScreen } from '../../components/LoadingScreen';
import NeuroGuessrLandingPage from '../../components/NeuroGuessrLandingPage';

function LandingPage() {
    const { isLoggedIn } = useApp();

    // Redirect logic
    useEffect(() => {
        if (isLoggedIn) {
            navigate('/welcome');
        }
    }, [isLoggedIn]);

    return (
        <>
            <title>NeuroGuessr</title>

            {isLoggedIn && <LoadingScreen />}

            {!isLoggedIn && <NeuroGuessrLandingPage />}
        </>
    );
}

export default LandingPage;
