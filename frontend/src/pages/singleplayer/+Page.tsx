import React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defineNiiOptions } from '../../utils/helper_nii';
import { useApp } from '../../context/AppContext';
import { LoadingScreen } from '../../components/LoadingScreen';
import { navigate } from 'vike/client/router';
import { consoleLog } from '../../utils/logging';
import { PublishToLeaderboardBox } from '../../components/PublishToLeaderboardBox';
import SearchBar from '../../components/SearchBar';
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
    const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
    const cleanGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Clean game callback not initialized") });
    const startGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Start game callback not initialized") });
    const resetGameCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Reset game callback not initialized") });
    const validateGuessCallbackRef = useRef<(() => void)>(() => { consoleLog("verbose", "Validate guess callback not initialized") });
    const genericKeyPressCallbackRef = useRef<((e: KeyboardEvent) => void)>(() => { consoleLog("verbose", "Generic key press callback not initialized") });
    const canvasInteractionRef = useRef<((e: CanvasInteractionContent) => void)>(() => { consoleLog("verbose", "Canvas interaction callback not initialized") });
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
    canvasInteractionRef: React.RefObject<(e: CanvasInteractionContent) => void>,
}) {
    const { t, askedAtlas, viewerOptions,
        isLoggedIn, userPublishToLeaderboard,
        isMobileView,
        setHeaderText, setHeaderTextMode, setHeaderScore,
        setHeaderStreak, setHeaderErrors, setHeaderTime,
        setShowHelpOverlay, showNotification,
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
    const [currentAttempts, setCurrentAttempts] = useState<number>(0);
    const currentAttemptsRef = useRef<number>(0);
    const usedRegions = useRef<number[]>([]);
    const pastRegionIdCounter = useRef<number>(0);
    const [showStreakOverlay, setShowStreakOverlay] = useState<boolean>(false);
    const streakOverlayRef = useRef<HTMLDivElement>(null);
    const [showTimeattackOverlay, setShowTimeattackOverlay] = useState<boolean>(false);
    const timeattackOverlayRef = useRef<HTMLDivElement>(null);
    const [showCacheMonitor, setShowCacheMonitor] = useState<boolean>(false);

    const {
        setIsGameRunning, setPastRegions, currentTarget, selectedVoxelProp, setHasEnded, hasEndedRef,
        guessButtonRef, atlasRef, isGameRunning, highlightedRegion, highlightWrapper, setHighlightedRegion, unHighlight,
        niivue, canvasRef, isLoading,
    } = useGame();

    // Use socket-based single player game management
    const {
        isConnected,
        gameState,
        currentRegion,
        lastGuessResult,
        gameEnded,
        error,
        startGame: startSocketGame,
        getNextRegion,
        validateGuess
    } = useSinglePlayerSocket();

    // Handle socket connection status
    useEffect(() => {
        if (!isConnected) {
            consoleLog("verbose", "Socket not connected for single player game");
        }
    }, [isConnected]);

    // Handle game state updates from socket
    useEffect(() => {
        if (gameState && gameMode !== "navigation") {
            setCurrentScore(gameState.score);
            setCurrentStreak(gameState.streak);
            setHeaderScore(`${t("score")}: ${gameState.score}`);
            setHeaderStreak(`${gameState.streak}`);
        }
    }, [gameState, t]);

    // Handle new region from socket
    useEffect(() => {
        if (currentRegion && atlasRef.current && gameMode !== "navigation") {
            // Set the current target region
            currentTarget.current = currentRegion.regionId;
            setCurrentAttempts(currentRegion.attempts);
            currentAttemptsRef.current = currentRegion.attempts;
            
            // Highlight region if needed
            if (gameMode === 'practice' && currentRegion.attempts >= 3) {
                setHighlightedRegion(currentRegion.regionId);
            }

            // show notification
            showNotification(`${t("find")} ${atlasRef.current.labels[currentRegion.regionId]}`, true);
        }
    }, [currentRegion, gameMode]);

    // Handle guess results from socket
    useEffect(() => {
        if (lastGuessResult && gameMode !== "navigation") {
            // Update pastRegions if pastRegionId is provided
            if (lastGuessResult.pastRegionId !== undefined) {
                setPastRegions(prev => prev.map(region =>
                    region.id === lastGuessResult.pastRegionId
                        ? {
                            ...region,
                            isCorrect: lastGuessResult.isCorrect,
                            score: lastGuessResult.scoreIncrement,
                            distance: lastGuessResult.distance,
                            regionCenter: lastGuessResult.regionCenter,
                            regionBoundary: lastGuessResult.regionBoundary
                        }
                        : region
                ));
            }

            // Update UI based on guess result
            if (lastGuessResult.isCorrect) {
                setCurrentCorrects(prev => prev + 1);
                // Request next region
                setHeaderTextMode("success");
                setTimeout(() => {
                    setHeaderTextMode("normal");
                }, 500);
            } else {
                setCurrentErrors(prev => prev + 1);
                setHeaderTextMode("failure");
                if(gameMode === "streak"){ 
                    showNotification(`${t("incorrect")} ${lastGuessResult.consecutiveErrors}/${lastGuessResult.maxErrorsStreak}`, false);
                }
            }
            setCurrentAttempts(lastGuessResult.attempts);
            currentAttemptsRef.current = lastGuessResult.attempts;
        }
    }, [lastGuessResult, getNextRegion]);

    // Handle game end from socket
    useEffect(() => {
        if (gameEnded) {
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
                // For streak mode ending due to max consecutive errors, show streak overlay
                setShowStreakOverlay(true);
            } else if (gameMode === 'streak' && gameEnded.reason === 'exceeded-max-distance') {
                // For streak mode ending due to exceeded max distance, show streak overlay and notification
                setShowStreakOverlay(true);
                showNotification(t("streak_ended_too_far", { distance: gameEnded.lastDistance }), false);
            } else {
                // For other modes, show regular end screen
                showNotification(`${t("game_over")}! ${t("final_score")}: ${gameEnded.finalScore}`, true);
            }
        }
    }, [gameEnded, gameMode, t]);

    // Handle socket errors
    useEffect(() => {
        if (error) {
            showNotification(error, false);
        }
    }, [error, showNotification]);

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
    }, [startGameCallbackRef, gameMode, askedAtlas, blindMode]);

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
            if (clickedRegionLocation && (clickedRegionLocation.idx !== undefined || blindMode)) {
                selectedVoxelProp.current = clickedRegionLocation;
                if (gameMode === 'navigation' && clickedRegionLocation.idx !== undefined) {
                    setHeaderText(atlasRef.current.labels?.[clickedRegionLocation.idx] || t('no_region_selected'));
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
        const validateGuessInternal = async () => {
            if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current || !atlasRef.current) {
                console.warn('Cannot validate guess:', { selectedVoxelProp, isGameRunning, currentTarget, atlasRef });
                return;
            }

            // For non-navigation modes, prepopulate pastRegions with empty entry
            if (gameMode !== 'navigation') {
                const pastRegionId = pastRegionIdCounter.current++;
                const regionName = atlasRef.current!.labels?.[currentTarget.current!] || t('unknown_region');
                
                setPastRegions(prev => [...prev, {
                    id: pastRegionId,
                    regionId: currentTarget.current!,
                    regionName,
                    atlas: atlasRef.current!.atlas,
                    isCorrect: false,
                    clickedPosition: selectedVoxelProp.current || undefined,
                    score: 0,
                    distance: -1, // Special value to indicate no guess was made
                }]);

                // Use socket to validate guess instead of REST API
                validateGuess(selectedVoxelProp.current, pastRegionId);
            } else {
                // Use socket to validate guess instead of REST API
                validateGuess(selectedVoxelProp.current);
            }
        }
        if (validateGuessCallbackRef) {
            validateGuessCallbackRef.current = validateGuessInternal; // Set the callback in the ref
        }
    }, [validateGuessCallbackRef, isGameRunning, gameMode, currentTarget, atlasRef, t]);

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
        } else if (currentTarget.current !== undefined && atlasRef.current && atlasRef.current.labels && atlasRef.current.labels[currentTarget.current]) {
            // Use 'find' translation key directly
            const prefix = t('find') || 'Find: ';
            // For time attack, display the current question number
            if (gameMode === 'time-attack') {
                setHeaderText(`${currentAttempts}/18 - ${prefix}${atlasRef.current.labels[currentTarget.current]}`);
            } else {
                if(currentTarget.current !== undefined){
                    setHeaderText(prefix + atlasRef.current.labels[currentTarget.current]);
                }
            }
        } else {
            setHeaderText(''); // No region : cleanup
        }
    }


    useEffect(() => {
        updateGameDisplay();
    }, [currentScore, currentCorrects, currentErrors, currentStreak, gameMode, currentTarget.current, highlightedRegion]);

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
                        <span className="progress-label progress-label-med">{Math.round(1000 * 0.5)}</span>
                        <span className="progress-label progress-label-max">{Math.round(1000 * 1)}</span>
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

            <CacheMonitor 
                isVisible={showCacheMonitor} 
                onClose={() => setShowCacheMonitor(false)} 
            />

        </>
    )
}


