import React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defineNiiOptions } from '../../utils/helper_nii';
import { AddHeaderMessageOptions, useApp } from '../../context/AppContext';
import { LoadingScreen } from '../../components/LoadingScreen';
import { navigate } from 'vike/client/router';
import { consoleLog } from '../../utils/logging';
import { PublishToLeaderboardBox } from '../../components/PublishToLeaderboardBox';
import { BrainViewer, GameProvider, useGame } from '../../components/BrainViewer';
import CacheMonitor from '../../components/CacheMonitor';
import { CanvasInteractionContent, useSinglePlayerSocket } from '../../hooks/useSinglePlayerSocket';

export function Page() {
    const { pageContext } = useApp();
    const { routeParams } = pageContext;
    const gameMode = routeParams?.['mode'];
    if(gameMode === undefined){
        return null;
    }
    const blindMode = routeParams?.['blind'] === "true" || false;
    const routedAtlas = routeParams?.['atlas']
    const routedRegion = routeParams?.['region'] ? parseInt(routeParams?.['region']) : undefined;
    const replaySessionId = routeParams?.['replay_session'] ? parseInt(routeParams?.['replay_session']) : undefined;
    const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
    const cleanGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Clean game callback not initialized") });
    const startGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Start game callback not initialized") });
    const resetGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Reset game callback not initialized") });
    const validateGuessCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Validate guess callback not initialized") });
    const genericKeyPressCallbackRef = useRef<((e: KeyboardEvent) => void)>(() => { consoleLog("verbose", "Generic key press callback not initialized") });
    const canvasInteractionRef = useRef<((e: CanvasInteractionContent) => void)>(() => { consoleLog("verbose", "Canvas interaction callback not initialized") });

    // For replay mode, don't use game mode from routing, use 'multiplayer' style rendering
    const renderGameMode = replaySessionId ? gameMode : gameMode;

    return (
        <GameProvider gameMode={renderGameMode} blindMode={blindMode} routedAtlas={routedAtlas} routedRegion={routedRegion} tooltip={tooltip} setTooltip={setTooltip}
            cleanGameCallbackRef={cleanGameCallbackRef} startGameCallbackRef={startGameCallbackRef} resetGameCallbackRef={resetGameCallbackRef}
            validateGuessCallbackRef={validateGuessCallbackRef} genericKeyPressCallbackRef={genericKeyPressCallbackRef} canvasInteractionRef={canvasInteractionRef}>
            <SinglePlayer tooltip={tooltip} setTooltip={setTooltip}
                cleanGameCallbackRef={cleanGameCallbackRef} startGameCallbackRef={startGameCallbackRef} resetGameCallbackRef={resetGameCallbackRef}
                validateGuessCallbackRef={validateGuessCallbackRef} genericKeyPressCallbackRef={genericKeyPressCallbackRef} canvasInteractionRef={canvasInteractionRef}
                replaySessionId={replaySessionId} />
        </GameProvider>
    )
}

function SinglePlayer({
    tooltip, setTooltip,
    cleanGameCallbackRef, startGameCallbackRef, resetGameCallbackRef,
    validateGuessCallbackRef, genericKeyPressCallbackRef, canvasInteractionRef,
    replaySessionId
}: {
    tooltip: { visible: boolean; text: string; x: number; y: number; },
    setTooltip: React.Dispatch<React.SetStateAction<{ visible: boolean; text: string; x: number; y: number; }>>,
    cleanGameCallbackRef: React.RefObject<() => void>,
    startGameCallbackRef: React.RefObject<() => void>,
    resetGameCallbackRef: React.RefObject<() => void>,
    validateGuessCallbackRef: React.RefObject<() => void>,
    genericKeyPressCallbackRef: React.RefObject<(e: KeyboardEvent) => void>,
    canvasInteractionRef: React.RefObject<(e: CanvasInteractionContent) => void>,
    replaySessionId?: number | undefined,
}) {
    const { t, askedAtlas, viewerOptions,
        isLoggedIn, userPublishToLeaderboard,
        isMobileView,
        addHeaderMessage, addHeaderMessages, clearHeaderMessages,
        setHeaderStreak, setHeaderScore, setHeaderErrors, setHeaderTime,
        setAllHeaderMessagesColor,
        setShowHelpOverlay, showNotification,
        setAskedAtlas,
        pageContext } = useApp();
    const { routeParams } = pageContext;
    const gameMode = routeParams?.['mode'];
    const blindMode = routeParams?.['blind'] === "true" || false;
    const [currentScore, setCurrentScore] = useState<number>(0);
    const currentScoreRef = useRef<number>(0);
    const [finalScore, setFinalScore] = useState<number>(0);
    const [finalElapsed, setFinalElapsed] = useState<number>(0);
    const [currentCorrects, setCurrentCorrects] = useState<number>(0);
    const [currentErrors, setCurrentErrors] = useState<number>(0);
    const [currentStreak, setCurrentStreak] = useState<number>(0);
    const currentStreakRef = useRef<number>(0);
    const maxStreakRef = useRef<number>(0);
    const [currentAttempts, setCurrentAttempts] = useState<number>(0);
    const currentAttemptsRef = useRef<number>(0);
    const usedRegions = useRef<number[]>([]);
    const pastRegionIdCounter = useRef<number>(0);
    const [showStreakOverlay, setShowStreakOverlay] = useState<boolean>(false);
    const streakOverlayRef = useRef<HTMLDivElement>(null);
    const [showTimeattackOverlay, setShowTimeattackOverlay] = useState<boolean>(false);
    const timeattackOverlayRef = useRef<HTMLDivElement>(null);
    const [showPracticeOverlay, setShowPracticeOverlay] = useState<boolean>(false);
    const practiceOverlayRef = useRef<HTMLDivElement>(null);
    const [practiceAccuracy, setPracticeAccuracy] = useState<number>(0);
    const [finalMaxStreak, setFinalMaxStreak] = useState<number>(0);
    const [showCacheMonitor, setShowCacheMonitor] = useState<boolean>(false);
    const [currentAskedId, setCurrentAskedId] = useState<number>(0);
    const [currentTotalNumRegions, setCurrentTotalNumRegions] = useState<number>(18);
    const [maxScore, setMaxScore] = useState<number | null>(null);
    const [sessionName, setSessionName] = useState<string>("");
    const [sessionDate, setSessionDate] = useState<string>("");

    const {
        setIsGameRunning, setPastRegions, currentTarget, selectedVoxelProp, setHasEnded, hasEndedRef,
        guessButtonRef, atlasRef, isGameRunning, highlightedRegion, highlightWrapper, setHighlightedRegion, unHighlight,
        niivue, canvasRef, isLoading, isRegionLocked, setIsRegionLocked,
    } = useGame();

    // Use socket-based single player game management
    const {
        isConnected,
        gameState,
        currentRegion,
        lastGuessResult,
        gameEnded,
        regionHighlight,
        error,
        startGame: startSocketGame,
        validateGuess
    } = useSinglePlayerSocket(replaySessionId);

    // Handle socket connection status
    useEffect(() => {
        if (!isConnected) {
            consoleLog("verbose", "Socket not connected for single player game");
        }
    }, [isConnected]);


    useEffect(() => {
        const handler = () => {
            const parts = window.location.pathname.split('/');
            if(gameMode === 'navigation' && parts.length >= 4 && atlasRef.current){
                if(parts[3] && parts[3] != atlasRef.current.atlas){
                    setAskedAtlas({atlas: parts[3], blindMode});
                    setHighlightedRegion(parts[4] !== undefined ? parseInt(parts[4]) : null);
                } else if(parts[3] === atlasRef.current.atlas){
                    if(parts[4] !== undefined){
                        setHighlightedRegion(parseInt(parts[4]));
                        highlightWrapper(parseInt(parts[4]), true, true);
                    } else {
                        setHighlightedRegion(null);
                        unHighlight();
                    }
                }
            }
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, []);

    // Handle replay mode for single player — runs only once when replaySessionId is known
    const replayLoadedRef = useRef(false);
    useEffect(() => {
        if (!replaySessionId || replayLoadedRef.current) return;
        replayLoadedRef.current = true;

        const loadReplayData = async () => {
            try {
                const authToken = localStorage.getItem('authToken');
                const response = await fetch(`/api/single/replay-session/${replaySessionId}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });

                if (!response.ok) {
                    throw new Error(`Failed to load replay data: ${response.statusText}`);
                }

                const data = await response.json();
                const { pastRegions, atlas, blindMode, sessionName: sName, sessionDate: sDate } = data;

                hasEndedRef.current = true;
                setHasEnded(true);
                setPastRegions(pastRegions);
                setAskedAtlas({atlas, blindMode});
                setSessionName(sName);
                setSessionDate(sDate);
                // Clear game header stats — not relevant in replay mode
                setHeaderScore("");
                setHeaderStreak("");
                setHeaderErrors("");
                setHeaderTime("");
                clearHeaderMessages();

                consoleLog('verbose', `Loaded replay for ${sName} with ${pastRegions.length} regions`);
            } catch (err) {
                console.error('Error loading replay data:', err);
                showNotification('Failed to load replay data', false);
            }
        };

        loadReplayData();
    }, [replaySessionId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle game state updates from socket
    useEffect(() => {
        if (!replaySessionId && gameState && gameMode !== "navigation") {
            setCurrentScore(gameState.score);
            setCurrentStreak(gameState.streak);

            // Store maxScore for time-attack mode
            if (gameMode === 'time-attack' && gameState.maxScore) {
                setMaxScore(gameState.maxScore);
            }

            // Display score using new header message system (not in practice mode)
            if (gameMode !== 'practice') {
                setHeaderScore(`${Math.round(gameState.score)}`);
            }

            if(gameMode === "streak"){
                setHeaderStreak(`${gameState.streak}`);
            }
        }
    }, [gameState, t, gameMode, replaySessionId]);

    // Handle timer for time-attack mode
    useEffect(() => {
        if (!replaySessionId && gameState?.mode === 'time-attack' && gameState.endDate) {
            const endTime = gameState.endDate.getTime();

            const updateTimer = () => {
                const now = Date.now();
                const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

                if (remaining > 0) {
                    const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
                    const seconds = (remaining % 60).toString().padStart(2, '0');
                    setHeaderTime(`${t("remaining-time") || "Time left"}: ${minutes}:${seconds}`);
                } else {
                    setHeaderTime("");
                }
            };

            // Update immediately
            updateTimer();

            // Set up interval to update every 250ms for smooth countdown
            const intervalId = setInterval(updateTimer, 250);

            return () => {
                clearInterval(intervalId);
                setHeaderTime("");
            };
        } else {
            setHeaderTime("");
            return () => {}; // Return empty cleanup function
        }
    }, [gameState, t, replaySessionId]);

    const feedbackTimestampRef = useRef<number>(0);
    const FEEDBACK_DURATION = 1000; // ms to show green/red before showing next region

    // Handle new region from socket
    useEffect(() => {
        if (!replaySessionId && currentRegion && gameMode !== "navigation") {
            // Prepopulate pastRegions with empty entry in time attack mode
            if (gameMode === "time-attack" && currentRegion.askedId !== undefined && atlasRef.current) {
                setPastRegions(prev => [...prev, {
                    id: currentRegion.askedId!,
                    regionId: currentRegion.regionId,
                    atlas: atlasRef.current!.atlas,
                    isCorrect: false,
                    clickedPosition: undefined,
                    clickedRegionName: undefined,
                    score: 0,
                    distance: -1,
                }]);
            }

            // Set the current target region
            currentTarget.current = currentRegion.regionId;
            setCurrentAttempts(currentRegion.attempts);
            currentAttemptsRef.current = currentRegion.attempts;

            if (gameMode === "time-attack"){
                if(currentRegion.askedId !== undefined) setCurrentAskedId(currentRegion.askedId);
                if(currentRegion.totalNumRegions !== undefined) setCurrentTotalNumRegions(currentRegion.totalNumRegions);
            }

            // Delay header update to let the success/failure color be visible first
            const showNewRegionHeader = () => {
                if (!atlasRef.current?.labels) return;
                const prefix = t('find') || 'Find: ';
                let mainText = '';
                if (gameMode === 'time-attack') {
                    const askedId = currentRegion.askedId ?? currentAskedId;
                    const total = currentRegion.totalNumRegions ?? currentTotalNumRegions;
                    mainText = `${askedId}/${total} - ${prefix}${atlasRef.current.labels[currentRegion.regionId]}`;
                } else {
                    mainText = `${prefix}${atlasRef.current.labels[currentRegion.regionId]}`;
                }
                addHeaderMessages([{ text: mainText, minDuration: 500, forceClear: true }]);
            };

            const elapsed = Date.now() - feedbackTimestampRef.current;
            const remaining = FEEDBACK_DURATION - elapsed;
            if (remaining > 50) {
                setTimeout(showNewRegionHeader, remaining);
            } else {
                showNewRegionHeader();
            }
        }
    }, [currentRegion, gameMode, replaySessionId]);

    // Handle guess results from socket
    useEffect(() => {
        if (!replaySessionId && lastGuessResult && gameMode !== "navigation") {
            // Update pastRegions if pastRegionId is provided
            if (lastGuessResult.pastRegionId !== undefined) {
                const clickedVox = lastGuessResult.clickedPosition?.vox;
                const clickedIdx = (clickedVox && atlasRef.current)
                    ? atlasRef.current.getValue(clickedVox[0]!, clickedVox[1]!, clickedVox[2]!)
                    : undefined;
                const clickedRegionName = clickedIdx !== undefined && atlasRef.current
                    ? atlasRef.current.labels?.[clickedIdx] ?? undefined
                    : undefined;
                setPastRegions(prev => prev.map(region =>
                    region.id === lastGuessResult.pastRegionId
                        ? {
                            ...region,
                            isCorrect: lastGuessResult.isCorrect,
                            score: lastGuessResult.scoreIncrement,
                            distance: lastGuessResult.distance,
                            regionCenter: lastGuessResult.regionCenter,
                            regionBoundary: lastGuessResult.regionBoundary,
                            clickedPosition: lastGuessResult.clickedPosition,
                            clickedRegionName
                        }
                        : region
                ));
            }

            // Update UI based on guess result
            feedbackTimestampRef.current = Date.now();
            if (atlasRef.current && currentTarget.current && lastGuessResult.isCorrect) {
                setCurrentCorrects(prev => prev + 1);
                let mainText = atlasRef.current.labels[currentTarget.current] || "";
                if (gameMode === 'time-attack') {
                    mainText = `${currentAskedId}/${currentTotalNumRegions} - ${atlasRef.current.labels[currentTarget.current]}`;
                }
                addHeaderMessage({ text: mainText, minDuration: FEEDBACK_DURATION, color: 'success' });
                if(gameMode === "practice"){
                    setHighlightedRegion(null);
                    unHighlight()
                }
            } else {
                setCurrentErrors(prev => prev + 1);
                setAllHeaderMessagesColor('failure', FEEDBACK_DURATION);
                if(gameMode === "streak"){
                    showNotification(`${t("incorrect")} ${lastGuessResult.consecutiveErrors}/${lastGuessResult.maxErrorsStreak}`, false);
                }
            }
            setCurrentAttempts(lastGuessResult.attempts);
            currentAttemptsRef.current = lastGuessResult.attempts;
        }
    }, [lastGuessResult, replaySessionId]);

    // Handle game end from socket
    useEffect(() => {
        if (!replaySessionId && gameEnded) {
            setHasEnded(true);
            hasEndedRef.current = true;
            setFinalScore(gameEnded.finalScore);
            if (gameEnded.elapsedTime) {
                setFinalElapsed(gameEnded.elapsedTime);
            }

            // Show appropriate end screen based on game mode and reason
            if (gameMode === 'time-attack') {
                // For time attack, show the overlay with final score
                setShowTimeattackOverlay(true);
            } else if (gameMode === 'streak' && gameEnded.reason === 'max-consecutive-errors') {
                setFinalMaxStreak(maxStreakRef.current);
                setShowStreakOverlay(true);
            } else if (gameMode === 'streak' && gameEnded.reason === 'exceeded-max-distance') {
                setFinalMaxStreak(maxStreakRef.current);
                setShowStreakOverlay(true);
                showNotification(t("streak_ended_too_far", { distance: gameEnded.lastDistance }), false);
            } else if (gameEnded.reason === 'completed') {
                const accuracy = gameEnded.attempts ? Math.round((gameEnded.correct / gameEnded.attempts) * 100) : 0;
                setPracticeAccuracy(accuracy);
                setFinalMaxStreak(maxStreakRef.current);
                setShowPracticeOverlay(true);
            } else {
                const accuracy = gameEnded.attempts ? Math.round((gameEnded.correct / gameEnded.attempts) * 100) : 0;
                const minutes = gameEnded.elapsedTime ? Math.floor(gameEnded.elapsedTime / 60) : 0;
                const seconds = gameEnded.elapsedTime ? Math.floor(gameEnded.elapsedTime % 60) : 0;
                showNotification(`${t("game_over", {accuracy, minutes, seconds})}! ${t("final_score")}: ${gameEnded.finalScore}`, true);
            }
        }
    }, [gameEnded, gameMode, t, replaySessionId]);

    // Handle socket errors
    useEffect(() => {
        if (!replaySessionId && error) {
            showNotification(error, false);
        }
    }, [error, replaySessionId]);

    // Handle region highlight from socket
    useEffect(() => {
        if (!replaySessionId && regionHighlight && gameMode === 'practice') {
            setHighlightedRegion(regionHighlight.regionId);
            highlightWrapper(regionHighlight.regionId, false, true);
        }
    }, [regionHighlight, gameMode, replaySessionId]);

    useEffect(() => {
        currentStreakRef.current = currentStreak;
        if (currentStreak > maxStreakRef.current) maxStreakRef.current = currentStreak;
    }, [currentStreak])
    useEffect(() => {
        currentScoreRef.current = currentScore
    }, [currentScore])
    useEffect(() => {
        currentAttemptsRef.current = currentAttempts
    }, [currentAttempts])

    const cleanHeader = () => {
        clearHeaderMessages();
        setHeaderStreak("");
        setHeaderErrors("");
        setHeaderTime("")
    }

    useEffect(() => {
        const cleanGame = () => {
            cleanHeader();
            setHighlightedRegion(null);
            unHighlight();
            usedRegions.current = [];
            setIsGameRunning(false);
            setPastRegions([]);
        }

        if (cleanGameCallbackRef) {
            cleanGameCallbackRef.current = cleanGame; // Set the callback in the ref
        }
    }, [cleanGameCallbackRef]);


    useEffect(() => {
        const resetGameState = () => {
            currentTarget.current = undefined;
            selectedVoxelProp.current = null;
            setCurrentAttempts(0); // Reset attempts for practice mode
            setCurrentScore(0); // Reset score for Time Attack
            setCurrentCorrects(0); // Reset correct count for Practice/Streak
            setCurrentErrors(0); // Reset errors
            setCurrentStreak(0); // Reset streak
            maxStreakRef.current = 0; // Reset max streak
            setCurrentAskedId(0); // Reset asked ID for time-attack
            setMaxScore(null); // Reset max score
            usedRegions.current = []; // Reset used regions for time attack
            clearHeaderMessages(); // Clear all header messages
            setHasEnded(false);
            hasEndedRef.current = false; // Reset the ref value
            setPastRegions([]);
            addHeaderMessage({ 
                text: gameMode === 'navigation' ? t('click_to_identify') : t('not_started'),
                forceClear: true 
            });
            if (gameMode === 'navigation') {
                setHeaderScore(``);
                setHeaderStreak("");
                setHeaderErrors("");
            } else if (gameMode === 'practice') {
                setHeaderScore(``);
                setHeaderErrors("0");
                setHeaderStreak("");
            } else if (gameMode === 'streak') {
                addHeaderMessage({ text: t('correct_label') + ": 0", forceClear: true });
                setHeaderErrors("0");
                setHeaderScore(`0`);
                setHeaderStreak("0");
            } else if (gameMode === 'time-attack') {
                addHeaderMessage({ text: t('score_label') + ": 0", forceClear: true });
                setHeaderErrors("0");
                setHeaderStreak("");
            }
            if (guessButtonRef.current) guessButtonRef.current.disabled = true;
            atlasRef.current?.showShuffledRegions()
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
        const startGameInternal = () => {
            // In replay mode, do not start a real socket game
            if (replaySessionId) return;

            setIsGameRunning(true);
            if (!atlasRef.current) return;

            // Start game using socket instead of REST API
            if (askedAtlas?.atlas) {
                startSocketGame(askedAtlas.atlas, gameMode || 'practice', blindMode);
                consoleLog("verbose", "Socket-based game started for atlas:", askedAtlas.atlas);
            } else {
                console.warn("No atlas selected, cannot start game.");
            }
        }
        if (startGameCallbackRef) {
            startGameCallbackRef.current = startGameInternal; // Set the callback in the ref
        }
    }, [startGameCallbackRef, gameMode, askedAtlas, blindMode, replaySessionId]);

    useEffect(() => {
        const genericKeyPressCallback = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showStreakOverlay) {
                setShowStreakOverlay(false)
            }
            if (e.key === 'Escape' && showTimeattackOverlay) {
                setShowTimeattackOverlay(false)
            }
            if (e.key === 'Escape' && showCacheMonitor) {
                setShowCacheMonitor(false)
            }
            // Toggle cache monitor with Ctrl+Shift+C (development feature)
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                setShowCacheMonitor(prev => !prev);
                e.preventDefault();
            }
        }
        if (genericKeyPressCallbackRef) {
            genericKeyPressCallbackRef.current = genericKeyPressCallback; // Set the callback in the ref
        }
    }, [genericKeyPressCallbackRef, showStreakOverlay, showTimeattackOverlay, showCacheMonitor]);

    useEffect(() => {
        const canvasInteraction = (clickedRegionLocation: CanvasInteractionContent) => {
            if (!isGameRunning || !niivue || !atlasRef.current) return;
            // In navigation mode, if region is locked, ignore canvas clicks
            if (gameMode === 'navigation' && isRegionLocked) return;
            if (clickedRegionLocation && (clickedRegionLocation.idx !== undefined || blindMode)) {
                selectedVoxelProp.current = clickedRegionLocation;
                if (gameMode === 'navigation' && clickedRegionLocation.idx !== undefined) {
                    const regionName = atlasRef.current.labels?.[clickedRegionLocation.idx] || t('no_region_selected');
                    addHeaderMessages([{ text: regionName, minDuration: 500, forceClear: true }]);
                    setHighlightedRegion(clickedRegionLocation.idx);
                    highlightWrapper(clickedRegionLocation.idx, false, true);
                    const currentLabel = atlasRef.current.labels[clickedRegionLocation.idx];
                    if (currentLabel) {
                        showNotification(currentLabel, true, {}, 1500);
                    } 
                    if (tooltip) {
                        setTooltip({ ...tooltip, visible: false });
                    }
                    niivue.opts.crosshairColor = [1, 1, 1, 1];
                    niivue.drawScene();
                    window.history.pushState(null, '', `/singleplayer/navigation/${atlasRef.current.atlas}/${clickedRegionLocation.idx}`);
                    validateGuess(clickedRegionLocation);
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
                    window.history.pushState(null, '', `/singleplayer/navigation/${atlasRef.current.atlas}`);
                    addHeaderMessage({
                        text: t('no_region_selected'),
                        forceClear: true,
                        minDuration: 100
                    });
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
    }, [isGameRunning, canvasInteractionRef, isRegionLocked]);

    // Auto-lock when a region is selected from the search bar
    useEffect(() => {
        if (gameMode !== 'navigation') return;
        const handler = () => setIsRegionLocked(true);
        window.addEventListener('navigation-region-selected', handler);
        return () => window.removeEventListener('navigation-region-selected', handler);
    }, [gameMode, setIsRegionLocked]);


    useEffect(() => {
        const validateGuessInternal = async () => {
            if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current || !atlasRef.current) {
                console.warn('Cannot validate guess:', { selectedVoxelProp, isGameRunning, currentTarget, atlasRef });
                return;
            }

            // Prepopulate pastRegions with empty entry
            if (gameMode === 'practice' || gameMode === "streak") {
                const pastRegionId = pastRegionIdCounter.current++;
                const regionName = atlasRef.current!.labels?.[currentTarget.current!] || t('unknown_region');
                
                setPastRegions(prev => [...prev, {
                    id: pastRegionId,
                    regionId: currentTarget.current!,
                    regionName,
                    atlas: atlasRef.current!.atlas,
                    isCorrect: false,
                    clickedPosition: selectedVoxelProp.current || undefined,
                    clickedRegionName: undefined,
                    score: 0,
                    distance: -1, // Special value to indicate no guess was made
                }]);

                // Use socket to validate guess instead of REST API
                validateGuess(selectedVoxelProp.current, pastRegionId);
            } else if (gameMode === 'time-attack') {
                validateGuess(selectedVoxelProp.current, currentRegion?.askedId);
            } else {
                // Use socket to validate guess instead of REST API
                validateGuess(selectedVoxelProp.current);
            }
        }
        if (validateGuessCallbackRef) {
            validateGuessCallbackRef.current = validateGuessInternal; // Set the callback in the ref
        }
    }, [validateGuessCallbackRef, isGameRunning, gameMode, currentRegion, currentTarget, atlasRef, t]);

    const updateGameScores = () => {
        // Update labels based on mode

        if (gameMode === 'time-attack' || gameMode === 'streak' || gameMode === 'practice') {
            setHeaderErrors(`${currentErrors}`);
        } else {
            setHeaderErrors(``);
        }
        if (gameMode === 'time-attack' || gameMode === 'streak') {
            setHeaderScore(`${currentScore}`);
        } else {
            setHeaderScore(``);
        }
        if (gameMode === 'streak') {
            setHeaderStreak(`${currentStreak}`);
        }
    }
    const updateGameHeader = () => {
        let mainText = '';
        if (gameMode === 'navigation') {
            mainText = highlightedRegion !== null && highlightedRegion !== undefined
                ? atlasRef.current?.labels?.[highlightedRegion] || t('no_region_selected')
                : t('click_to_identify');
        } else if (currentTarget.current !== undefined && atlasRef.current && atlasRef.current.labels && atlasRef.current.labels[currentTarget.current]) {
            // Use 'find' translation key directly
            const prefix = t('find') || 'Find: ';
            // For time attack, display the current question number
            if (gameMode === 'time-attack') {
                mainText = `${currentAskedId}/${currentTotalNumRegions} - ${prefix}${atlasRef.current.labels[currentTarget.current]}`;
            } else {
                if(currentTarget.current !== undefined){
                    mainText = prefix + atlasRef.current.labels[currentTarget.current];
                }
            }
        }

        let messages : AddHeaderMessageOptions[] = []

        // Update header with combined messages
        if (mainText) {
            messages.push({ text: mainText, minDuration: 500, forceClear: gameMode === 'navigation' });
        }

        if(gameMode === 'navigation' && atlasRef.current && atlasRef.current.info && (highlightedRegion !== null || currentTarget.current !== undefined)){
            let atlasInfo = "";
            let infoContent = undefined;
            let infoSource = undefined;
            if(highlightedRegion !== null){
                atlasInfo = atlasRef.current.info[highlightedRegion] || "";
                infoContent = atlasRef.current.infoDetail?.[highlightedRegion] || undefined;
                infoSource = atlasRef.current.infoSource?.[highlightedRegion] || undefined;
            } else if(currentTarget.current !== undefined){
                atlasInfo = atlasRef.current.info[currentTarget.current] || "";
                infoContent = atlasRef.current.infoDetail?.[currentTarget.current] || undefined;
                infoSource = atlasRef.current.infoSource?.[currentTarget.current] || undefined;
            }
            if(atlasInfo !== ""){
                messages.push({ text: atlasInfo, minDuration: 500, fontSize: '0.85em', fontWeight: 'normal',
                    infoContent: infoContent, infoSource: infoSource });
            }
        }
        
        // Add all messages to the header
        addHeaderMessages(messages);
    }


    useEffect(() => {
        if (replaySessionId) return;
        updateGameScores();
    }, [currentScore, currentCorrects, currentErrors, currentStreak,
        gameMode, currentTarget.current, highlightedRegion,
        currentAskedId, currentTotalNumRegions, replaySessionId]);
    useEffect(() => {
        // Don't update header if we're still showing feedback (green/red)
        const elapsed = Date.now() - feedbackTimestampRef.current;
        if (elapsed < FEEDBACK_DURATION) return;
        updateGameHeader();
    }, [currentTarget.current, highlightedRegion, atlasRef.current]);

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

    const myTitle = gameMode ? `NeuroGuessr - ${t(gameMode + "_mode")}` : t('neuroguessr_singleplayer_title')

    return (
        <>
            <title>{myTitle}</title>
            {isLoading && !replaySessionId && <LoadingScreen />}
            {tooltip.visible && <div className="region-tooltip" style={{ position: "absolute", left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}

            <BrainViewer sessionName={sessionName} sessionDate={sessionDate} />

            {showStreakOverlay && !replaySessionId && <div id="streak-end-overlay" className="streak-overlay">
                <div className="overlay-content" ref={streakOverlayRef}>
                    <h2>{t("streak_ended_title")}</h2>
                    <div className="overlay-stats">
                        <div className="overlay-stat-item">
                            <span className="overlay-stat-value">{finalMaxStreak}</span>
                            <span className="overlay-stat-label">{t("max_streak_label")}</span>
                        </div>
                        <div className="overlay-stat-item">
                            <span className="overlay-stat-value" id="final-streak">{finalScore}</span>
                            <span className="overlay-stat-label">{t("streak_ended_score")}</span>
                        </div>
                    </div>
                    {isLoggedIn && userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
                    <div className="overlay-buttons">
                        <button
                            className="eye-button"
                            onClick={() => setShowStreakOverlay(false)}
                            data-umami-event="show review button"
                            data-umami-event-overlay="streak"
                        >
                            {t("review_button") || "Review"}
                        </button>
                        <button id="restart-button-streak"
                            data-umami-event="restart button" data-umami-event-restartsource="streak"
                            className="restart-button" onClick={() => { setShowStreakOverlay(false); resetGameCallbackRef.current(); startGameCallbackRef.current() }}>
                            {t("restart_button") || "↺"}
                        </button>
                        <button id="go-back-menu-button-streak"
                            data-umami-event="go back button" data-umami-event-gobacksource="streak"
                            className="home-button" onClick={() => { navigate("/welcome") }}>
                            {t("home_button")}
                        </button>
                    </div>
                </div>
            </div>}

            {showTimeattackOverlay && !replaySessionId && <div id="time-attack-end-overlay" className="time-attack-overlay">
                <div className="overlay-content" ref={timeattackOverlayRef}>
                    <h2>{t("time_attack_ended_title")}</h2>
                    <div className="overlay-score-block">
                        <span className="overlay-score-value">{Math.round(finalScore)}</span>
                        <span className="overlay-score-label">{t("time_attack_ended_score")}</span>
                    </div>
                    {finalElapsed > 0 && (
                        <div className="overlay-stats">
                            <div className="overlay-stat-item">
                                <span className="overlay-stat-value" id="final-time-attack-time">
                                    {Math.floor(finalElapsed / 60)}:{String(Math.floor(finalElapsed % 60)).padStart(2, '0')}
                                </span>
                                <span className="overlay-stat-label">{t("time_attack_ended_time")}</span>
                            </div>
                        </div>
                    )}
                    <div className="score-progress-bar">
                        <div id="time-attack-score-bar" className="w3-container w3-blue"
                            style={{ width: (maxScore ? (finalScore / maxScore) * 100 : (finalScore / 1000) * 100) + "%" }}></div>
                        <span className="progress-label progress-label-med">{Math.round((maxScore || 1000) * 0.5)}</span>
                        <span className="progress-label progress-label-max">{Math.round(maxScore || 1000)}</span>
                    </div>
                    {isLoggedIn && userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
                    <div className="overlay-buttons">
                        <button
                            className="eye-button"
                            onClick={() => setShowTimeattackOverlay(false)}
                            data-umami-event="show review button"
                            data-umami-event-overlay="time-attack"
                        >
                            {t("review_button") || "Review"}
                        </button>
                        <button id="restart-button-time-attack" className="restart-button"
                            data-umami-event="restart button" data-umami-event-restartsource="time-attack"
                            onClick={() => { setShowTimeattackOverlay(false);
                                resetGameCallbackRef.current();
                                startGameCallbackRef.current() }}>
                            {t("restart_button") || "↺"}
                        </button>
                        <button id="go-back-menu-button-time-attack" className="home-button"
                            data-umami-event="go back button" data-umami-event-gobacksource="time-attack"
                            onClick={() => { navigate("/welcome") }}>
                            {t("home_button")}
                        </button>
                    </div>
                </div>
            </div>}

            {showPracticeOverlay && !replaySessionId && <div id="practice-end-overlay" className="practice-overlay">
                <div className="overlay-content" ref={practiceOverlayRef}>
                    <h2>{gameMode === 'streak' ? t("serie_completed_title") : t("practice_completed_title")}</h2>
                    <div className="overlay-stats">
                        <div className="overlay-stat-item">
                            <span className="overlay-stat-value">{practiceAccuracy}%</span>
                            <span className="overlay-stat-label">{t("accuracy")}</span>
                        </div>
                        {finalElapsed > 0 && (
                            <div className="overlay-stat-item">
                                <span className="overlay-stat-value">
                                    {Math.floor(finalElapsed / 60)}:{String(Math.floor(finalElapsed % 60)).padStart(2, '0')}
                                </span>
                                <span className="overlay-stat-label">{t("time_attack_ended_time")}</span>
                            </div>
                        )}
                        {gameMode === 'streak' && (
                            <>
                                <div className="overlay-stat-item">
                                    <span className="overlay-stat-value">{finalMaxStreak}</span>
                                    <span className="overlay-stat-label">{t("max_streak_label")}</span>
                                </div>
                                <div className="overlay-stat-item">
                                    <span className="overlay-stat-value">{Math.round(finalScore)}</span>
                                    <span className="overlay-stat-label">{t("final_score")}</span>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="overlay-buttons">
                        <button
                            className="eye-button"
                            onClick={() => setShowPracticeOverlay(false)}
                            data-umami-event="show review button"
                            data-umami-event-overlay={gameMode}
                        >
                            {t("review_button")}
                        </button>
                        <button className="restart-button"
                            data-umami-event="restart button" data-umami-event-restartsource={gameMode}
                            onClick={() => { setShowPracticeOverlay(false); resetGameCallbackRef.current(); startGameCallbackRef.current() }}>
                            {gameMode === 'streak' ? t("restart_button") : t("practice_continue_button")}
                        </button>
                        <button className="home-button"
                            data-umami-event="go back button" data-umami-event-gobacksource={gameMode}
                            onClick={() => { navigate("/welcome") }}>
                            {t("home_button")}
                        </button>
                    </div>
                </div>
            </div>}

            <CacheMonitor
                isVisible={showCacheMonitor}
                onClose={() => setShowCacheMonitor(false)}
            />

        </>
    )
}


