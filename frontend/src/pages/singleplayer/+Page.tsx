import React, { use } from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { isTokenValid, refreshToken } from '../../utils/helper_login';
import { AtlasImageProxy, defineNiiOptions, fetchJSON, initNiivue, loadAtlasNii } from '../../utils/helper_nii';
import { useApp } from '../../context/AppContext';
import { ColorMap, ImageMetadata, PastRegion } from '../../types';
import atlasFiles from '../../utils/atlas_files';
import { Help } from '../../components/Help';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Niivue, NVImage, DRAG_MODE } from '@niivue/niivue';
import { navigate } from 'vike/client/router';
import { PublishToLeaderboardBox } from '../../components/PublishToLeaderboardBox';
import RegionHistory from '../../components/RegionHistory';
import SearchBar from '../../components/SearchBar';
import { BrainViewer, GameProvider, useGame } from '../../components/BrainViewer';


async function startOnlineSession(isLoggedIn: boolean, token: string, mode: string, atlas: string, blindMode: boolean): Promise<{ sessionToken: string, sessionId: string } | null> {
    // Check if the player is logged in
    if (!isLoggedIn || !token) {
        return null;
    }
    if (!isTokenValid(token)) {
        if (!refreshToken()) {
            return null;
        }
    }
    try {
        // Send a request to the backend to start a session
        const response = await fetch('/api/start-game-session', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mode, atlas, blindMode }),
        });

        if (!response.ok) {
            console.error("Failed to online game session on the backend.");
            const result = await response.json();
            console.error(result.message || "Failed to start game session.");
            return null;
        }

        const result = await response.json();
        return { sessionToken: result.sessionToken, sessionId: result.sessionId };
    } catch (error) {
        console.error("Error starting online game session:", error);
        console.error("An error occurred while starting online game session. Please try again later.");
        return null;
    }
}

function getDistance(centers: number[][], coordinates: { mm: number[], vox: number[] }): number {
    let minDistance = Infinity;
    const [xMm, yMm, zMm] = coordinates.mm;
    // Find the minimum distance to any center of the region
    for (const center of centers) {
        const distance = Math.sqrt(
            Math.pow(center[0] - xMm, 2) +
            Math.pow(center[1] - yMm, 2) +
            Math.pow(center[2] - zMm, 2)
        );
        if (distance < minDistance) {
            minDistance = distance;
        }
    }
    return minDistance;
}

export function Page() {
    const { pageContext } = useApp();
    const { routeParams } = pageContext;
    const gameMode = routeParams?.mode;
    const blindMode = routeParams?.blind === "true" || false;
    const routedAtlas = routeParams?.atlas
    const routedRegion = parseInt(routeParams?.region) || undefined
    const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
    const cleanGameCallbackRef = useRef<(() => void)>(() => { console.log("Not Initialized") });
    const startGameCallbackRef = useRef<(() => void)>(() => { console.log("Not Initialized") });
    const resetGameCallbackRef = useRef<(() => void)>(() => { console.log("Not Initialized") });
    const validateGuessCallbackRef = useRef<(() => void)>(() => { console.log("Not Initialized") });
    const genericKeyPressCallbackRef = useRef<((e: KeyboardEvent) => void)>((e) => { console.log("Not Initialized") });
    const canvasInteractionRef = useRef<((e: { mm: number[]; vox: number[]; idx: number | undefined; } | undefined) => void)>((e) => { console.log("Not Initialized") });
    return (
        <GameProvider gameMode={gameMode} blindMode={blindMode} routedAtlas={routedAtlas} routedRegion={routedRegion} tooltip={tooltip} setTooltip={setTooltip}
            cleanGameCallbackRef={cleanGameCallbackRef} startGameCallbackRef={startGameCallbackRef} resetGameCallbackRef={resetGameCallbackRef}
            validateGuessCallbackRef={validateGuessCallbackRef} genericKeyPressCallbackRef={genericKeyPressCallbackRef} canvasInteractionRef={canvasInteractionRef}>
            <SinglePlayer tooltip={tooltip} setTooltip={setTooltip}
                cleanGameCallbackRef={cleanGameCallbackRef} startGameCallbackRef={startGameCallbackRef} resetGameCallbackRef={resetGameCallbackRef}
                validateGuessCallbackRef={validateGuessCallbackRef} genericKeyPressCallbackRef={genericKeyPressCallbackRef} canvasInteractionRef={canvasInteractionRef} />
        </GameProvider>
    )
}

function SinglePlayer({
    tooltip, setTooltip,
    cleanGameCallbackRef, startGameCallbackRef, resetGameCallbackRef,
    validateGuessCallbackRef, genericKeyPressCallbackRef, canvasInteractionRef
}: {
    tooltip: { visible: boolean; text: string; x: number; y: number; },
    setTooltip: React.Dispatch<React.SetStateAction<{ visible: boolean; text: string; x: number; y: number; }>>,
    cleanGameCallbackRef: React.RefObject<() => void>,
    startGameCallbackRef: React.RefObject<() => void>,
    resetGameCallbackRef: React.RefObject<() => void>,
    validateGuessCallbackRef: React.RefObject<() => void>,
    genericKeyPressCallbackRef: React.RefObject<(e: KeyboardEvent) => void>,
    canvasInteractionRef: React.RefObject<(e: { mm: number[]; vox: number[]; idx: number | undefined; } | undefined) => void>,
}) {
    const { t, currentLanguage, askedAtlas, askedRegion,
        preloadedBackgroundMNI, viewerOptions,
        isLoggedIn, authToken, userPublishToLeaderboard,
        isMobileView, setIsMobileView,
        setHeaderText, setHeaderTextMode, setHeaderScore,
        setHeaderStreak, setHeaderErrors, setHeaderTime,
        setShowHelpOverlay, showNotification,
        setAskedAtlas, setAskedRegion, pageContext } = useApp();
    // Time Attack specific constants
    const TOTAL_REGIONS_TIME_ATTACK = 18;
    const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
    const MAX_TIME_IN_SECONDS = 100; // nombre de secondes pour le Time Attack
    const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
    const MAX_POINTS_TIMEATTACK = MAX_POINTS_PER_REGION * TOTAL_REGIONS_TIME_ATTACK + MAX_TIME_IN_SECONDS * BONUS_POINTS_PER_SECOND;
    const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
    const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)
    const MAX_ATTEMPTS_BEFORE_HIGHLIGHT = 3; // Number of attempts before highlighting the target region in practice mode
    const BLIND_MODE_MULTIPLIER = 1.5; // Multiplier for points in blind mode
    const STREAK_BONUS_AFTER = 5;
    const STREAK_BONUS = 5;
    const MAX_STREAK_DISTANCE = 50; // Maximum distance in mm to prevent streak stop
    const MAX_NUMBER_FAR_STREAK = 3; // Maximum distance in mm to prevent streak stop
    const { routeParams } = pageContext;
    const gameMode = routeParams?.mode;
    const blindMode = routeParams?.blind === "true" || false;
    const [currentScore, setCurrentScore] = useState<number>(0);
    const currentScoreRef = useRef<number>(0);
    const [finalScore, setFinalScore] = useState<number>(0);
    const [finalElapsed, setFinalElapsed] = useState<number>(0);
    const [currentCorrects, setCurrentCorrects] = useState<number>(0);
    const [currentErrors, setCurrentErrors] = useState<number>(0);
    const [currentStreak, setCurrentStreak] = useState<number>(0);
    const currentStreakRef = useRef<number>(0);
    const currentConsecutiveErrorsRef = useRef<number>(0);
    const [finalStreak, setFinalStreak] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<string>("00:00");
    const [currentAttempts, setCurrentAttempts] = useState<number>(0);
    const currentAttemptsRef = useRef<number>(0);
    const usedRegions = useRef<number[]>([]);
    const startTime = useRef<number | null>(null);
    const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const sessionToken = useRef<string | null>(null);
    const sessionId = useRef<string | null>(null);
    const [showStreakOverlay, setShowStreakOverlay] = useState<boolean>(false);
    const streakOverlayRef = useRef<HTMLDivElement>(null);
    const [showTimeattackOverlay, setShowTimeattackOverlay] = useState<boolean>(false);
    const timeattackOverlayRef = useRef<HTMLDivElement>(null);
    const [forceDisplayUpdate, setForceDisplayUpdate] = useState<number>(0);

    const {
        setIsGameRunning, setPastRegions, currentTarget, selectedVoxelProp, setHasEnded, hasEndedRef,
        guessButtonRef, atlasRef, isGameRunning, highlightedRegion, highlightWrapper, setHighlightedRegion, unHighlight,
        setIsNavigationMode,
        niivue, niivueRef, canvasRef, isLoading,
    } = useGame();

    useEffect(() => {
        currentStreakRef.current = currentStreak
    }, [currentStreak])
    useEffect(() => {
        currentScoreRef.current = currentScore
    }, [currentScore])
    useEffect(() => {
        currentAttemptsRef.current = currentAttempts
    }, [currentAttempts])

    const cleanHeader = () => {
        setHeaderText("");
        setHeaderScore("");
        setHeaderStreak("");
        setHeaderErrors("");
        setHeaderTime("")
    }

    useEffect(() => {
        const cleanGame = () => {
            cleanHeader();
            usedRegions.current = [];
            setIsGameRunning(false);
            setPastRegions([]);
            if (timerInterval.current) {
                clearInterval(timerInterval.current);
                timerInterval.current = null;
            }
        }

        if (cleanGameCallbackRef) {
            cleanGameCallbackRef.current = cleanGame; // Set the callback in the ref
        }
    }, [cleanGameCallbackRef]);


    useEffect(() => {
        const resetGameState = () => {
            currentTarget.current = null;
            selectedVoxelProp.current = null;
            currentConsecutiveErrorsRef.current = 0;
            setCurrentAttempts(0); // Reset attempts for practice mode
            setCurrentScore(0); // Reset score for Time Attack
            setCurrentCorrects(0); // Reset correct count for Practice/Streak
            setCurrentErrors(0); // Reset errors
            setCurrentStreak(0); // Reset streak
            usedRegions.current = []; // Reset used regions for time attack
            setHeaderTextMode("normal"); // Reset header text mode
            setHasEnded(false);
            hasEndedRef.current = false; // Reset the ref value
            setPastRegions([]);
            setHeaderText(gameMode === 'navigation' ? t('click_to_identify') : t('not_started'));
            if (gameMode === 'navigation') {
                setHeaderScore("");
                setHeaderStreak("");
                setHeaderErrors("");
            } else if (gameMode === 'practice') {
                setHeaderScore(t('correct_label') + ": 0");
                setHeaderErrors("0");
                setHeaderStreak("");
            } else if (gameMode === 'streak') {
                setHeaderScore(t('correct_label') + ": 0");
                setHeaderErrors("0");
                setHeaderStreak("0");
            } else if (gameMode === 'time-attack') {
                setHeaderScore(t('score_label') + ": 0");
                setHeaderErrors("0");
                setHeaderStreak("");
            }
            if (guessButtonRef.current) guessButtonRef.current.disabled = true;
            atlasRef.current?.showShuffledRegions()
            if (timerInterval.current) {
                clearInterval(timerInterval.current);
                timerInterval.current = null;
            }
            if (tooltip) {
                setTooltip({ ...tooltip, visible: false });
            }
            // Hide overlays
            setShowHelpOverlay(false);
            setShowStreakOverlay(false);
            setShowTimeattackOverlay(false);
        }
        if (resetGameCallbackRef) {
            resetGameCallbackRef.current = resetGameState; // Set the callback in the ref
        }
    }, [resetGameCallbackRef, tooltip]);


    useEffect(() => {
        const startGame = () => {
            setIsGameRunning(true);
            if (!atlasRef.current) return;

            startOnlineSession(isLoggedIn, authToken, gameMode || 'practice', askedAtlas || 'aal', blindMode).then((session) => {
                if (session) {
                    sessionToken.current = session.sessionToken;
                    sessionId.current = session.sessionId;
                    //console.log("Online session started:", session);
                } else {
                    console.warn("Failed to start online session, proceeding in offline mode.");
                }
            }).catch((error) => {
                console.error("Error starting online session:", error);
            }).finally(() => {
                if (gameMode === 'time-attack') {
                    if (!sessionToken.current) { // logic for local game
                        // Shuffle validRegions and take the first 20 for Time Attack
                        if (atlasRef.current && atlasRef.current.validRegions.length >= TOTAL_REGIONS_TIME_ATTACK) {
                            atlasRef.current.validRegions.sort(() => 0.5 - Math.random());
                            atlasRef.current.validRegions = atlasRef.current.validRegions.slice(0, TOTAL_REGIONS_TIME_ATTACK);
                            //console.log(`Selected ${TOTAL_REGIONS_TIME_ATTACK} regions for Time Attack:`, validRegions);
                        } else if (atlasRef.current && atlasRef.current.validRegions.length > 0) {
                            console.warn(`Not enough regions for Time Attack (${TOTAL_REGIONS_TIME_ATTACK} required), using all ${atlasRef.current.validRegions.length} available regions.`);
                            atlasRef.current.validRegions.sort(() => 0.5 - Math.random()); // Still shuffle available regions
                        } else {
                            console.error("No valid regions available for Time Attack!");
                            setHeaderText(t('no_regions_available') || 'No regions available.');
                            return; // Stop game initialization if no regions
                        }
                    }
                    startTimer(); // Start timer for Time Attack
                }
                // Start the first round
                if (gameMode != "navigation") selectNewTarget();
                setForceDisplayUpdate((u) => u + 1);
            })
        }
        if (startGameCallbackRef) {
            startGameCallbackRef.current = startGame; // Set the callback in the ref
        }
    }, [startGameCallbackRef, isLoggedIn, authToken, gameMode, askedAtlas, blindMode]);



    function startTimer() {
        startTime.current = Date.now();
        refreshTimer()
        timerInterval.current = setInterval(() => {
            refreshTimer()
        }, 500);
    }

    const manualClotureGameSession = async (): Promise<number> => {
        try {
            const response = await fetch('/api/cloture-game-session', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId: sessionId.current, sessionToken: sessionToken.current }),
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.message || "Unknown error");
            }
            const result = await response.json();
            return result.finalScore;
        } catch (error) {
            throw error;
        }
    }

    const refreshTimer = () => {
        const remaining = Math.floor(((startTime.current || Date.now()) + MAX_TIME_IN_SECONDS * 1000 - Date.now()) / 1000);
        //const elapsed = Math.floor((Date.now() - (startTime.current || 0)) / 1000);
        const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
        const seconds = (remaining % 60).toString().padStart(2, '0');
        setHeaderTime(`${t("time_label")}: ${minutes}:${seconds}`);

        if (remaining <= 0 && !hasEndedRef.current) {
            // Set ended flags synchronously first to prevent multiple calls
            hasEndedRef.current = true;
            setHasEnded(true);
            if (isLoggedIn) {
                manualClotureGameSession().then((finalScore) => {
                    endTimeAttack(finalScore);
                }).catch((error) => {
                    endTimeAttack(currentScoreRef.current);
                });
            } else {
                endTimeAttack(currentScoreRef.current);
            }
            setPastRegions(prev => [...prev, {
                regionId: currentTarget.current!,
                regionName: atlasRef.current?.labels?.[currentTarget.current!] || t('unknown_region'),
                isCorrect: false,
                score: 0,
                distance: -1,
            }]);
        }
    }

    function endTimeAttack(givenFinalScore: number) {
        if (timerInterval.current) clearInterval(timerInterval.current);
        const elapsed = Math.floor((Date.now() - (startTime.current || 0)) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = (elapsed % 60).toString().padStart(2, '0');

        setFinalScore(givenFinalScore);
        setFinalElapsed(elapsed);
        setShowTimeattackOverlay(true); // Show Time Attack end overlay

        setHeaderTextMode("success")

        // Stop the game
        setIsGameRunning(false)
        setHasEnded(true);
        hasEndedRef.current = true;
        selectedVoxelProp.current = null;
        if (guessButtonRef.current) guessButtonRef.current.disabled = true;
    }

    const selectNewTarget = async () => {
        let regionId = -1;
        if (isLoggedIn) { // network region fetching
            try {
                const response = await fetch('/api/get-next-region', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ sessionId: sessionId.current, sessionToken: sessionToken.current }),
                });
                if (!response.ok) {
                    const result = await response.json();
                    console.error("Failed to get next region:", result.message || "Unknown error");
                    return false;
                }
                const result = await response.json();
                if (result.regionId >= 0) {
                    regionId = result.regionId;
                } else {
                    console.warn("No valid region ID received from server.");
                    return false;
                }
            } catch (error) {
                console.error("Error occured during next region fetching:", error);
                return false;
            }
        } else if (atlasRef.current && atlasRef.current.validRegions && usedRegions.current) {
            let availableRegions = atlasRef.current.validRegions.filter(r => !usedRegions.current.includes(r));
            if ((gameMode === 'time-attack' || gameMode === "streak") && availableRegions.length === 0) {
                // if no region remaining, we'll take a random region
                availableRegions = atlasRef.current.validRegions
            }
            if (availableRegions.length !== 0) {
                regionId = availableRegions[Math.floor(Math.random() * availableRegions.length)];
                if ((gameMode === 'time-attack' || gameMode === 'streak')) {
                    usedRegions.current.push(regionId);
                }
            }
        }

        if (regionId === -1) { // did not found region
            if (gameMode === 'time-attack') {
                // TODO take into account server response = -1
                const remaining = Math.floor(((startTime.current || Date.now()) + MAX_TIME_IN_SECONDS * 1000 - Date.now()) / 1000);
                // Calculate time bonus points
                const timeBonus = remaining > 0 ? remaining * BONUS_POINTS_PER_SECOND : 0;
                // Apply blind mode multiplier to the entire score
                const finalScore = Math.round(currentScoreRef.current = (timeBonus * (blindMode ? BLIND_MODE_MULTIPLIER : 1)));
                endTimeAttack(finalScore);
                return;
            } else if (gameMode === 'streak') {
                setFinalStreak(currentStreakRef.current); // Store the final streak before resetting
                setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
                setShowStreakOverlay(true);
                return;
            } else {
                // If no more regions in Practice, end the game
                resetGameCallbackRef.current(); // Or handle as an error in other modes
                return;
            }
        }
        currentTarget.current = regionId
        if (atlasRef.current) {
            showNotification('new_target', true, { region: atlasRef.current.labels[currentTarget.current] }, 1500);
        }

        if (currentTarget.current) {
            setForceDisplayUpdate((u) => u + 1); // Update display with the new target label
            selectedVoxelProp.current = null; // Reset selected voxel
            if (gameMode == "practice") setCurrentAttempts(0); // Reset attempts in practice mode
            atlasRef.current?.showShuffledRegions()
        }
    }

    useEffect(() => {
        const genericKeyPressCallback = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showStreakOverlay) {
                setShowStreakOverlay(false)
            }
            if (e.key === 'Escape' && showTimeattackOverlay) {
                setShowTimeattackOverlay(false)
            }
        }
        if (genericKeyPressCallbackRef) {
            genericKeyPressCallbackRef.current = genericKeyPressCallback; // Set the callback in the ref
        }
    }, [genericKeyPressCallbackRef]);

    useEffect(() => {
        const canvasInteraction = (clickedRegionLocation: any) => {
            if (!isGameRunning || !niivue || !atlasRef.current) return;
            if (clickedRegionLocation && (clickedRegionLocation.idx !== undefined || blindMode)) {
                selectedVoxelProp.current = clickedRegionLocation;
                if (gameMode === 'navigation' && clickedRegionLocation.idx !== undefined) {
                    setHeaderText(atlasRef.current.labels?.[clickedRegionLocation.idx] || t('no_region_selected'));
                    setHighlightedRegion(clickedRegionLocation.idx);
                    highlightWrapper(clickedRegionLocation.idx, false, true);
                    if (atlasRef.current) showNotification(atlasRef.current.labels[clickedRegionLocation.idx], true, {}, 1500);
                    if (tooltip) {
                        setTooltip({ ...tooltip, visible: false });
                    }
                    niivue.opts.crosshairColor = [1, 1, 1, 1];
                    niivue.drawScene();
                    window.history.pushState(null, '', `/singleplayer/navigation/${askedAtlas}/${clickedRegionLocation.idx}`);
                } else {
                    if (guessButtonRef.current) {
                        guessButtonRef.current.disabled = false;
                    }
                    niivue.opts.crosshairColor = [1, 1, 1, 1];
                    niivue.drawScene();
                }
            } else {
                selectedVoxelProp.current = null;
                if (gameMode === 'navigation') {
                    setHeaderText(t('no_region_selected'));
                    setHighlightedRegion(null);
                    unHighlight();
                } else {
                    if (guessButtonRef.current) guessButtonRef.current.disabled = true;
                }
            }
        }
        if (canvasInteractionRef) {
            canvasInteractionRef.current = canvasInteraction; // Set the callback in the ref
        }
    }, [isGameRunning, canvasInteractionRef]);

    useEffect(() => {
        const validateGuess = async () => {
            if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current) {
                console.warn('Cannot validate guess:', { selectedVoxelProp, isGameRunning, currentTarget });
                return;
            }
            let guessSuccess = null;
            let isEndgame = false;
            let clickedRegion = null;
            let scoreIncrement = 0;
            let streak = 0;
            let consecutiveErrors = 0;
            let quitReason = "";
            let givenFinalScore = 0;
            let performHighlight = false;
            let distance = Infinity;
            if (isLoggedIn) {
                try {
                    const token = localStorage.getItem('authToken');
                    const response = await fetch('/api/validate-region', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            sessionId: sessionId.current,
                            sessionToken: sessionToken.current,
                            coordinates: selectedVoxelProp.current
                        }),
                    });
                    const result = await response.json();
                    guessSuccess = result.isCorrect;
                    isEndgame = result.endgame;
                    clickedRegion = result.voxelValue;
                    scoreIncrement = result.scoreIncrement;
                    givenFinalScore = result.finalScore;
                    performHighlight = result.performHighlight;
                    distance = result.distance;
                    streak = result.streak;
                    consecutiveErrors = result.consecutiveErrors;
                    quitReason = result.quitReason;
                } catch (error) {
                    console.error("Error occured during region validation:", error);
                    return false;
                }
            } else {
                clickedRegion = selectedVoxelProp.current.idx;
                guessSuccess = clickedRegion === currentTarget.current;
                if (gameMode === 'time-attack') {
                    isEndgame = currentAttemptsRef.current + 1 >= TOTAL_REGIONS_TIME_ATTACK
                }
                if (gameMode === 'streak') {
                    if (guessSuccess) {
                        currentConsecutiveErrorsRef.current = 0
                        isEndgame = false
                    } else {
                        currentConsecutiveErrorsRef.current += 1
                        if (atlasRef.current && atlasRef.current.centers) {
                            distance = getDistance(atlasRef.current.centers[currentTarget.current], selectedVoxelProp.current)
                        }
                        if (distance > MAX_STREAK_DISTANCE) {
                            isEndgame = true;
                            quitReason = "streak-too-far"
                        } else if (currentConsecutiveErrorsRef.current >= MAX_NUMBER_FAR_STREAK) {
                            isEndgame = true;
                            quitReason = "streak-max-errors"
                        }
                    }
                    consecutiveErrors = currentConsecutiveErrorsRef.current;
                }
            }
            let previousScore = currentScoreRef.current;
            scoreIncrement = getUpdatedScore({
                isEndgame, guessSuccess, scoreIncrement,
                performHighlight, distance, streak, consecutiveErrors, quitReason
            }).scoreIncrement

            if (isEndgame) {
                performEndGame({ finalScore: isLoggedIn ? givenFinalScore : previousScore + scoreIncrement })
            }
        }
        if (validateGuessCallbackRef) {
            validateGuessCallbackRef.current = validateGuess; // Set the callback in the ref
        }
    }, [validateGuessCallbackRef, isGameRunning, gameMode]);

    const getUpdatedScore = ({ isEndgame, guessSuccess, scoreIncrement, performHighlight, distance = Infinity, streak = 0, consecutiveErrors = 0, quitReason = "" }:
        { isEndgame: boolean, guessSuccess: boolean, scoreIncrement: number, performHighlight: boolean, distance: number, streak: number, consecutiveErrors: number, quitReason: string }): { scoreIncrement: number } => {
        if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current) {
            console.warn('Cannot update score:', { selectedVoxelProp, isGameRunning, currentTarget });
            return { scoreIncrement };
        }
        const targetName = atlasRef.current && atlasRef.current.labels?.[currentTarget.current] ? atlasRef.current.labels[currentTarget.current] : t('unknown_region');
        const clickedRegionName = atlasRef.current && selectedVoxelProp.current.idx && atlasRef.current.labels?.[selectedVoxelProp.current.idx] ? atlasRef.current.labels[selectedVoxelProp.current.idx] : t('unknown_region');
        const selectedVoxelSave = selectedVoxelProp.current;
        if (guessSuccess) {
            // Correct Guess
            setCurrentCorrects((cs) => cs + 1); // Increment correct count       
            if (gameMode === 'time-attack') {
                // Add full points for correct guess - scoreIncrement already has blind mode multiplier applied if from server
                const points = isLoggedIn ? scoreIncrement : Math.floor(MAX_POINTS_PER_REGION * (blindMode ? BLIND_MODE_MULTIPLIER : 1));
                setCurrentScore((curScore) => curScore + points);
            }
            if (gameMode === 'streak') {
                if (isLoggedIn) {
                    // Online mode - use server values
                    setCurrentStreak((cs) => streak);
                    setCurrentScore((cs) => cs + scoreIncrement);
                    setCurrentErrors((cs) => consecutiveErrors);
                } else {
                    const newStreak = currentStreakRef.current + 1;
                    setCurrentStreak(newStreak);
                    let pointsForGuess = 1;
                    // Apply streak bonus if applicable
                    if (newStreak % STREAK_BONUS_AFTER === 0) {
                        pointsForGuess += STREAK_BONUS;
                    }
                    // Apply blind mode multiplier if applicable
                    if (blindMode) {
                        pointsForGuess = Math.floor(pointsForGuess * BLIND_MODE_MULTIPLIER);
                    }
                    // Update score
                    setCurrentScore((cs) => cs + pointsForGuess);
                    // Reset consecutive errors on correct guess
                    setCurrentErrors(0);
                    currentConsecutiveErrorsRef.current = 0;
                }
            }
            if (gameMode === 'practice') {
                setCurrentAttempts(0); // Reset attempts on correct guess
            } else {
                setCurrentAttempts((curAttempts) => curAttempts + 1); // Increment attempts 
            }

            setHeaderTextMode("success"); // Indicate correct guess visually
            atlasRef.current?.showShuffledRegions()
            selectedVoxelProp.current = null; // Reset selected voxel after guess
            if (guessButtonRef.current) guessButtonRef.current.disabled = true; // Disable guess button until next target

            // Move to the next target after a short delay to show feedback
            if (!isEndgame) {
                setTimeout(() => {
                    selectNewTarget();
                }, 100);
            }
        } else { // Incorrect Guess
            if (gameMode === 'practice') {
                // Use i18next interpolation for the incorrect message
                const incorrectMessage = t('incorrect_clicked', { region: clickedRegionName });
                setHeaderText(incorrectMessage);
                setHeaderTextMode("failure")

                //console.log(`Incorrect guess: ${clickedRegionName} (ID: ${clickedRegion}), Expected: ${targetName} (ID: ${currentTarget})`);

                //console.log(currentAttempts, MAX_ATTEMPTS_BEFORE_HIGHLIGHT);
                if ((!isLoggedIn && currentAttemptsRef.current >= MAX_ATTEMPTS_BEFORE_HIGHLIGHT - 1) ||
                    (isLoggedIn && performHighlight)) {
                    setHighlightedRegion(currentTarget.current);
                    highlightWrapper(currentTarget.current, true); // Highlight the target region
                }
                // Increased timeout duration to make the incorrect message visible longer
                setCurrentErrors((prevErrors) => prevErrors + 1); // Increment error count
                setCurrentAttempts((curAttempts) => curAttempts + 1); // Increment attempts 
                setTimeout(() => {
                    const findPrefix = t('find') || 'Find: ';
                    setHeaderText(findPrefix + targetName);
                    setHeaderTextMode("normal")
                }, 3000); // Increased delay to 3 seconds
            } else if (gameMode === "streak") {
                if (!isLoggedIn) {
                    const incorrectMessage = t('incorrect_clicked', { region: clickedRegionName });
                    setHeaderText(incorrectMessage);
                    setHeaderTextMode("failure");
                } else {
                    // Use i18next interpolation for the incorrect message
                    const incorrectMessage = t('incorrect_clicked', { region: clickedRegionName });
                    setHeaderText(incorrectMessage);
                    setHeaderTextMode("failure");
                }
                if (isEndgame && quitReason === "streak-too-far") {
                    if (distance === Infinity) {
                        showNotification('streak_ended', false);
                    } else {
                        showNotification('streak_ended_too_far', false, { distance: Math.round(distance) });
                    }
                } else if (isEndgame && quitReason === "streak-max-errors") {
                    showNotification('streak_ended_max_errors', false, { maxErrors: MAX_NUMBER_FAR_STREAK });
                } else if (!isEndgame) {
                    showNotification('streak_incorrect', false, { consecutiveErrors: consecutiveErrors, maxErrors: MAX_NUMBER_FAR_STREAK });
                }
                // Automatically move to the next target after a short delay
                if (!isEndgame) {
                    setTimeout(async () => {
                        await selectNewTarget();
                        setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
                        setCurrentErrors((prevErrors) => prevErrors + 1); // Increment error count
                        setCurrentScore((score) => score + scoreIncrement); // Add points earned for this attempt to the total score
                    }, 100);
                }
            } else if (gameMode === 'time-attack') {
                // *** MODIFIED FOR TIME ATTACK: Calculate and add partial score for incorrect guess ***
                if (!isLoggedIn && atlasRef.current && atlasRef.current.labels) {
                    if (atlasRef.current.centers) {
                        // Calculate Euclidean distance between centers
                        distance = Infinity;
                        distance = getDistance(atlasRef.current.centers[currentTarget.current], selectedVoxelProp.current)

                        // Calculate score based on distance
                        if (distance <= MAX_PENALTY_DISTANCE) {
                            scoreIncrement = Math.floor((1 - (distance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
                        } else {
                            scoreIncrement = 0; // No points for too far away
                        }
                        if (blindMode) {
                            scoreIncrement = Math.floor(scoreIncrement * BLIND_MODE_MULTIPLIER); // Apply blind mode multiplier
                        }
                    } else {
                        console.warn(`Center data missing for region ${currentTarget} or ${selectedVoxelProp.current}. Cannot calculate distance-based score.`);
                        // Option: award minimal points or 0 if center data is missing
                        scoreIncrement = 0; // Award 0 points if centers are missing
                    }
                }

                setHeaderTextMode("failure"); // Indicate incorrect guess visually

                // Automatically move to the next target after a short delay
                if (!isEndgame) {
                    setTimeout(async () => {
                        await selectNewTarget();
                        setCurrentErrors((prevErrors) => prevErrors + 1); // Increment error count
                        setCurrentAttempts((curAttempts) => curAttempts + 1); // Increment attempts 
                        setCurrentScore((score) => score + scoreIncrement); // Add points earned for this attempt to the total score
                    }, 100);
                }
            } else {
                setCurrentErrors((prevErrors) => prevErrors + 1); // Increment error count
                setCurrentAttempts((curAttempts) => curAttempts + 1); // Increment attempts 
            }

            selectedVoxelProp.current = null;
            if (guessButtonRef.current) guessButtonRef.current.disabled = true;

            // Only update game display for score/error/streak *after* the incorrect message timeout in practice mode
            if (gameMode !== 'practice') {
                setForceDisplayUpdate((u) => u + 1);
            }
        }

        // Add region to history
        if (gameMode === 'time-attack' || gameMode == "streak") {
            setPastRegions(prev => [...prev, {
                regionId: currentTarget.current!,
                regionName: atlasRef.current?.labels?.[currentTarget.current!] || t('unknown_region'),
                isCorrect: guessSuccess,
                score: scoreIncrement,
                distance: guessSuccess ? 0 : distance,
                clickedPosition: selectedVoxelSave ? {
                    mm: [...selectedVoxelSave.mm],
                    vox: [...selectedVoxelSave.vox]
                } : undefined,
                regionCenter: (atlasRef.current && atlasRef.current.centers) ? atlasRef.current.centers?.[currentTarget.current!][0] : undefined
                // TODO ADJUST FOR MULTIPLE CENTERS
            }]);
        }

        return { scoreIncrement }
    }

    function performEndGame({ finalScore }: { finalScore: number }) {
        if (gameMode === 'streak') {
            // Apply blind mode multiplier consistently to the final streak score
            setFinalStreak(currentStreakRef.current);
            setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
            setShowStreakOverlay(true);
            setHeaderTextMode("failure"); // Indicate streak ended visually
            setIsGameRunning(false);
            setFinalScore(finalScore);
        } else if (gameMode === 'time-attack') {
            if (!isLoggedIn) {
                const remaining = Math.floor(((startTime.current || Date.now()) + MAX_TIME_IN_SECONDS * 1000 - Date.now()) / 1000);
                const timeBonus = (remaining > 0 ? remaining * BONUS_POINTS_PER_SECOND : 0) * (blindMode ? BLIND_MODE_MULTIPLIER : 1);
                finalScore = Math.round((currentScoreRef.current + timeBonus));
            }
            endTimeAttack(finalScore)
        }
        setHasEnded(true)
        hasEndedRef.current = true;
    }

    const updateGameDisplay = () => {
        // Update labels based on mode
        if (gameMode === 'time-attack' || gameMode === 'streak') {
            setHeaderScore(t('score_label') + `: ${Math.round(currentScore)}`); // Display rounded score for Time Attack
        } else if (gameMode === 'practice') {
            setHeaderScore(t('correct_label') + `: ${currentCorrects}`); // Display correct count for other modes
        }

        if (gameMode === 'time-attack' || gameMode === 'streak' || gameMode === 'practice') {
            setHeaderErrors(`${currentErrors}`);
        }
        if (gameMode === 'streak') {
            setHeaderStreak(`${currentStreak}`);
        }

        if (gameMode === 'navigation') {
            setHeaderText(highlightedRegion
                ? atlasRef.current?.labels?.[highlightedRegion] || t('no_region_selected')
                : t('click_to_identify'));
        } else if (currentTarget.current !== null && atlasRef.current && atlasRef.current.labels && atlasRef.current.labels[currentTarget.current]) {
            // Use 'find' translation key directly
            const prefix = t('find') || 'Find: ';
            // For time attack, display the current question number
            if (gameMode === 'time-attack') {
                setHeaderText(`${currentAttempts}/${TOTAL_REGIONS_TIME_ATTACK} - ${prefix}${atlasRef.current.labels[currentTarget.current]}`);
            } else {
                setHeaderText(prefix + atlasRef.current.labels[currentTarget.current]);
            }
        } else {
            setHeaderText(''); // No region : cleanup
        }
    }


    useEffect(() => {
        updateGameDisplay();
    }, [currentScore, currentCorrects, currentErrors, currentStreak, gameMode, currentTarget.current, highlightedRegion, forceDisplayUpdate]);

    useEffect(() => {
        if (!showStreakOverlay && !showTimeattackOverlay) return;
        // Add a small delay before attaching the click handler
        // to ensure the overlay is fully rendered
        const timeoutId = setTimeout(() => {
            const handleClick = (event: Event) => {
                if (
                    showStreakOverlay &&
                    streakOverlayRef.current &&
                    !streakOverlayRef.current.contains(event.target as Node)
                ) {
                    setShowStreakOverlay(false);
                }
                if (
                    showTimeattackOverlay &&
                    timeattackOverlayRef.current &&
                    !timeattackOverlayRef.current.contains(event.target as Node)
                ) {
                    setShowTimeattackOverlay(false);
                }
            };
            document.addEventListener('click', handleClick);
            return () => {
                document.removeEventListener('click', handleClick);
            };
        }, 300); // 300ms delay should be enough for the overlay to render

        return () => {
            clearTimeout(timeoutId);
        };
    }, [showStreakOverlay, showTimeattackOverlay])

    useEffect(() => {
        if (!isMobileView) defineNiiOptions(niivue, atlasRef.current || undefined, viewerOptions)
    }, [viewerOptions])

    useLayoutEffect(() => {
        if (niivue && canvasRef.current && !isLoading) {
            // Niivue expects the canvas to be sized by CSS, but sometimes needs a manual resize event
            niivue.resizeListener();
        }
    }, [niivue, isLoading]);

    useEffect(() => {
        setIsNavigationMode(gameMode === 'navigation');
    }, [gameMode])

    const myTitle = gameMode ? `NeuroGuessr - ${t(gameMode + "_mode")}` : t('neuroguessr_singleplayer_title')

    return (
        <>
            <title>{myTitle}</title>
            {isLoading && <LoadingScreen />}
            {!isLoading && gameMode == "navigation" && <SearchBar />}
            {tooltip.visible && <div className="region-tooltip" style={{ position: "absolute", left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}

            <BrainViewer />

            {showStreakOverlay && <div id="streak-end-overlay" className="streak-overlay">
                <div className="overlay-content" ref={streakOverlayRef}>
                    <h2>{t("streak_ended_title")}</h2>
                    <p><span>{t("streak_ended_score")}</span><span id="final-streak" className="streak-number">{finalScore}</span></p>
                    {isLoggedIn && userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
                    <div className="overlay-buttons">
                        <button
                            className="eye-button"
                            onClick={() => setShowStreakOverlay(false)}
                            data-umami-event="show review button"
                            data-umami-event-overlay="streak"
                        >
                            <i className="fas fa-eye"></i>
                        </button>
                        <button id="go-back-menu-button-streak"
                            data-umami-event="go back button" data-umami-event-gobacksource="streak"
                            className="home-button" onClick={() => { navigate("/welcome") }}>
                            <i className="fas fa-home"></i>
                        </button>
                        <button id="restart-button-streak"
                            data-umami-event="restart button" data-umami-event-restartsource="streak"
                            className="restart-button" onClick={() => { startGameCallbackRef.current() }}>
                            <i className="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
            </div>}

            {showTimeattackOverlay && <div id="time-attack-end-overlay" className="time-attack-overlay">
                <div className="overlay-content" ref={timeattackOverlayRef}>
                    <h2>{t("time_attack_ended_title")}</h2>
                    <p><span>{t("time_attack_ended_time")}</span>
                        <span id="final-time-attack-time">{finalElapsed}</span></p>
                    <p><span>{t("time_attack_ended_score")}</span></p>
                    {isLoggedIn && userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
                    <div className="score-progress-bar w3-light-grey w3-round">
                        <div id="time-attack-score-bar" className="w3-container w3-round w3-blue"
                            style={{ width: (finalScore / 1000) * 100 + "%" }}>{finalScore}</div>
                        <span className="progress-label progress-label-med">{Math.round(MAX_POINTS_TIMEATTACK * 0.5)}</span>
                        <span className="progress-label progress-label-max">{Math.round(MAX_POINTS_TIMEATTACK * 1)}</span>
                    </div>
                    <div className="overlay-buttons">
                        <button
                            className="eye-button"
                            onClick={() => setShowTimeattackOverlay(false)}
                            data-umami-event="show review button"
                            data-umami-event-overlay="time-attack"
                        >
                            <i className="fas fa-eye"></i>
                        </button>
                        <button id="go-back-menu-button-time-attack" className="home-button"
                            data-umami-event="go back button" data-umami-event-gobacksource="time-attack"
                            onClick={() => { navigate("/welcome") }}>
                            <i className="fas fa-home"></i>
                        </button>
                        <button id="restart-button-time-attack" className="restart-button"
                            data-umami-event="restart button" data-umami-event-restartsource="time-attack"
                            onClick={() => { setShowTimeattackOverlay(false); startGameCallbackRef.current() }}>
                            <i className="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
            </div>}

        </>
    )
}


