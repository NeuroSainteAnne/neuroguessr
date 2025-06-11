import React, { use } from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { isTokenValid, refreshToken } from '../../utils/helper_login';
import { defineNiiOptions, fetchJSON, getClickedRegion, initNiivue, loadAtlasNii } from '../../utils/helper_nii';
import { useApp } from '../../context/AppContext';
import { ColorMap } from '../../types';
import atlasFiles from '../../utils/atlas_files';
import "./GameScreen.css"
import { Help } from '../../components/Help';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Niivue } from '@niivue/niivue';
import { navigate } from 'vike/client/router';


async function startOnlineSession(isLoggedIn: boolean, token: string, mode: string, atlas: string): Promise<{ sessionToken: string, sessionId: string } | null> {
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
      body: JSON.stringify({ mode, atlas }),
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


export function Page() {
  const { t, currentLanguage, askedAtlas,
      preloadedAtlas, preloadedBackgroundMNI, viewerOptions,
      isLoggedIn, authToken, userPublishToLeaderboard,
    setHeaderText, setHeaderTextMode, setHeaderScore,
    setHeaderStreak, setHeaderErrors, setHeaderTime,
    setShowHelpOverlay,
    setAskedAtlas, pageContext } = useApp();
  // Time Attack specific constants
  const TOTAL_REGIONS_TIME_ATTACK = 18;
  const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
  const MAX_TIME_IN_SECONDS = 100; // nombre de secondes pour le Time Attack
  const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
  const MAX_POINTS_TIMEATTACK = MAX_POINTS_PER_REGION * TOTAL_REGIONS_TIME_ATTACK + MAX_TIME_IN_SECONDS * BONUS_POINTS_PER_SECOND;
  const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
  const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)
  const MAX_ATTEMPTS_BEFORE_HIGHLIGHT = 3; // Number of attempts before highlighting the target region in practice mode
  
  const { routeParams } = pageContext;
  const gameMode = routeParams?.mode;
  const [isNavigationMode, setIsNavigationMode] = useState<boolean>(true);
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGameRunning, setIsGameRunning] = useState<boolean>(false);
  const [currentScore, setCurrentScore] = useState<number>(0);
  const currentScoreRef = useRef<number>(0);
  const [finalScore, setFinalScore] = useState<number>(0);
  const [finalElapsed, setFinalElapsed] = useState<number>(0);
  const [currentCorrects, setCurrentCorrects] = useState<number>(0);
  const [currentErrors, setCurrentErrors] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const currentStreakRef = useRef<number>(0);
  const [finalStreak, setFinalStreak] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>("00:00");
  const [currentAttempts, setCurrentAttempts] = useState<number>(0);
  const currentAttemptsRef = useRef<number>(0);
  const currentTarget = useRef<number | null>(null);
  const selectedVoxelProp = useRef<{mm: number[], vox: number[], idx: number} | null>(null);
  const validRegions = useRef<number[]>([]);
  const usedRegions = useRef<number[]>([]);
  const [highlightedRegion, setHighlightedRegion] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const cMap = useRef<ColorMap | null>(null);
  const cLut = useRef<Uint8ClampedArray | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guessButtonRef = useRef<HTMLButtonElement>(null);
  const startTime = useRef<number | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionToken = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const [showStreakOverlay, setShowStreakOverlay] = useState<boolean>(false);
  const streakOverlayRef = useRef<HTMLDivElement>(null);
  const [showTimeattackOverlay, setShowTimeattackOverlay] = useState<boolean>(false);
  const timeattackOverlayRef = useRef<HTMLDivElement>(null);
  const [forceDisplayUpdate, setForceDisplayUpdate] = useState<number>(0);
  const lastTouchEvent = useRef<React.Touch | null>(null);

  const [niivue, setNiivue] = useState<Niivue|null>(null);
    useEffect(() => {
      setAskedAtlas(routeParams?.atlas);
      setNiivue(new Niivue({
                logLevel: "error",
                show3Dcrosshair: true,
                backColor: [0, 0, 0, 1],
                crosshairColor: [1, 1, 1, 1],
                doubleTouchTimeout: 0 // Disable double touch to avoid conflicts
            }));
      return () => { 
        cleanHeader()
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
          timerInterval.current = null;
        }
      };
    }, []);

  useEffect(() => {
    if(niivue && canvasRef.current){
      initNiivue(niivue, canvasRef.current, viewerOptions, () => {
        setIsLoadedNiivue(true);
      })
    }
  }, [niivue, canvasRef.current])

  useEffect(() => {
    if(isLoadedNiivue){
        checkLoading();
    }
  }, [isLoadedNiivue])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleSpaceBar();
      }
      if (e.code === 'Escape' && isGameRunning && gameMode === 'navigation') {
        e.preventDefault();
        handleRecolorization()
      }
      if (e.key === 'Escape' && showStreakOverlay) {
        setShowStreakOverlay(false)
      }
      if (e.key === 'Escape' && showTimeattackOverlay) {
        setShowTimeattackOverlay(false)
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      // Remove event listener
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isGameRunning])

  const handleSpaceBar = () => {
    if (guessButtonRef.current && !guessButtonRef.current.disabled && isGameRunning && gameMode !== 'navigation') {
      validateGuess();
    }
  }

  function generateRandomInts(quantity: number, max: number) {
    const arr = []
    while (arr.length < quantity) {
      var candidateInt = Math.floor(Math.random() * max) + 1
      if (arr.indexOf(candidateInt) === -1) arr.push(candidateInt)
    }
    return (arr)
  }
  const loadAtlasData = async () => {
    try {
      if (!askedAtlas) return
      const selectedAtlasFiles = atlasFiles[askedAtlas];
      cMap.current = await fetchJSON("/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
      if (niivue && niivue.volumes.length > 1 && cMap.current) {
        niivue.volumes[1].setColormapLabel(cMap.current)
        niivue.volumes[1].setColormapLabel({
          "R": generateRandomInts(cMap.current.labels?.length || 0, 255),
          "G": generateRandomInts(cMap.current.labels?.length || 0, 255),
          "B": generateRandomInts(cMap.current.labels?.length || 0, 255),
          "A": Array(1).fill(0).concat(Array((cMap.current.labels?.length || 0) - 1).fill(255)),
          "I": Array.from(Array(cMap.current.labels?.length || 0).keys()),
          "labels": cMap.current.labels || [],
        });
        cLut.current = niivue.volumes[1].colormapLabel?.lut || new Uint8ClampedArray();
        niivue.setOpacity(1, viewerOptions.displayOpacity);
        niivue.updateGLVolume();

        const atlasData = niivue.volumes[1].getVolumeData();
        const dataRegions = [...new Set((atlasData as unknown as number[]).filter(val => val > 0).map(val => Math.round(val)))];
        validRegions.current = dataRegions.filter(val => cMap.current?.labels?.[val] !== undefined && Number.isInteger(val));

        //console.log(`Atlas: ${selectedAtlasFiles.name}`);
        //console.log(`Atlas Data Sample:`, atlasData.slice(0, 10));
        //console.log(`Data Regions (rounded):`, dataRegions);
        //console.log(`Valid Regions:`, validRegions);
        //if (validRegions.current) console.log(`Valid Region Labels:`, validRegions.current.map(id => cMap.current?.labels?.[id]));

        if (validRegions.current.length === 0) {
          //console.warn(`No valid regions found in ${selectedAtlasFiles.name} data.`);
          validRegions.current = Object.keys(cMap.current.labels || [])
            .map(Number)
            .filter(val => val > 0 && Number.isInteger(val));
          if (validRegions.current.length === 0) {
            throw new Error(`No valid regions available for ${selectedAtlasFiles.name}`);
          }
          //console.warn(`Fallback to cmap.labels keys:`, validRegions);
        }
      }
    } catch (error) {
      console.error(`Failed to load atlas data for ${askedAtlas}:`, error);
      setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
    }
  }
  useEffect(() => {
    checkLoading();
  }, [preloadedAtlas, preloadedBackgroundMNI, isLoadedNiivue, gameMode, askedAtlas])

  const checkLoading = async () => {
    if (preloadedAtlas && preloadedBackgroundMNI && isLoadedNiivue && askedAtlas) {
      loadAtlasNii(niivue, preloadedBackgroundMNI, preloadedAtlas);
      await loadAtlasData();
      startGame();
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }

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
  }

  const resetGameState = () => {
    currentTarget.current = null;
    selectedVoxelProp.current = null;
    setCurrentAttempts(0); // Reset attempts for practice mode
    setCurrentScore(0); // Reset score for Time Attack
    setCurrentCorrects(0); // Reset correct count for Practice/Streak
    setCurrentErrors(0); // Reset errors
    setCurrentStreak(0); // Reset streak
    usedRegions.current = []; // Reset used regions for time attack
    setHighlightedRegion(null);
    setHeaderTextMode("normal"); // Reset header text mode
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
    if (cLut.current && niivue && niivue.volumes.length > 1 && niivue.volumes[1].colormapLabel) {
      niivue.volumes[1].colormapLabel.lut = new Uint8ClampedArray(cLut.current.slice());
      niivue.updateGLVolume();
    }
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
    // Reset Niivue view if needed
    if (niivue) {
      defineNiiOptions(niivue, viewerOptions)
      niivue.drawScene();
    }
  }

  const startGame = () => {
    setIsGameRunning(true);
    resetGameState();
    if(niivue) niivue.opts.doubleTouchTimeout = 500; // Reactivate double touch timeout after loading

    startOnlineSession(isLoggedIn, authToken, gameMode || 'practice', askedAtlas || 'aal').then((session) => {
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
          if (validRegions.current.length >= TOTAL_REGIONS_TIME_ATTACK) {
            validRegions.current.sort(() => 0.5 - Math.random());
            validRegions.current = validRegions.current.slice(0, TOTAL_REGIONS_TIME_ATTACK);
            //console.log(`Selected ${TOTAL_REGIONS_TIME_ATTACK} regions for Time Attack:`, validRegions);
          } else if (validRegions.current.length > 0) {
            console.warn(`Not enough regions for Time Attack (${TOTAL_REGIONS_TIME_ATTACK} required), using all ${validRegions.current.length} available regions.`);
            validRegions.current.sort(() => 0.5 - Math.random()); // Still shuffle available regions
          } else {
            console.error("No valid regions available for Time Attack!");
            setHeaderText(t('no_regions_available') || 'No regions available.');
            return; // Stop game initialization if no regions
          }
        }
        startTimer(); // Start timer for Time Attack
      }
      // Start the first round
      selectNewTarget();
      setForceDisplayUpdate((u) => u + 1);
    })

  }


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
    if (remaining <= 0) {
      if (isLoggedIn) {
        manualClotureGameSession().then((finalScore) => {
          endTimeAttack(finalScore);
        })
      } else {
        endTimeAttack(currentScoreRef.current);
      }
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
    } else if (validRegions.current && usedRegions.current) {
      let availableRegions = validRegions.current.filter(r => !usedRegions.current.includes(r));
      if (gameMode === 'time-attack' && availableRegions.length === 0) {
        // if no region remaining, we'll take a random region
        availableRegions = validRegions.current
      }
      if (availableRegions.length !== 0) {
        regionId = availableRegions[Math.floor(Math.random() * availableRegions.length)];
        if ((gameMode === 'time-attack' || gameMode === 'streak')) { // Add streak mode here to track used regions
          usedRegions.current.push(regionId);
        }
      }
    }

    if (regionId === -1) { // did not found region
      if (gameMode === 'time-attack') {
        // TODO take into account server response = -1
        const remaining = Math.floor(((startTime.current || Date.now()) + MAX_TIME_IN_SECONDS * 1000 - Date.now()) / 1000);
        endTimeAttack(Math.round(currentScoreRef.current + (remaining > 0 ? remaining * BONUS_POINTS_PER_SECOND : 0)));
        return;
      } else if (gameMode === 'streak') {
        setFinalStreak(currentStreakRef.current); // Store the final streak before resetting
        setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
        setShowStreakOverlay(true);
        return;
      } else {
        // If no more regions in Practice, end the game
        resetGameState(); // Or handle as an error in other modes
        return;
      }
    }
    currentTarget.current = regionId

    if (currentTarget.current) {
      setForceDisplayUpdate((u) => u + 1); // Update display with the new target label
      selectedVoxelProp.current = null; // Reset selected voxel
      if (gameMode == "practice") setCurrentAttempts(0); // Reset attempts in practice mode
      if (cLut.current && niivue) {
        if (niivue.volumes[1].colormapLabel) niivue.volumes[1].colormapLabel.lut = new Uint8ClampedArray(cLut.current.slice());
        niivue.updateGLVolume();
        niivue.drawScene(); // Redraw scene to ensure color reset is visible
      }
    }
  }

  useEffect(() => {
    if (highlightedRegion) {
      highlightRegionFluorescentYellow();
    } else { // reset to original color
      if (cLut.current && niivue && niivue.volumes.length > 1 && niivue.volumes[1].colormapLabel) {
        niivue.volumes[1].colormapLabel.lut = cLut.current;
        niivue.updateGLVolume();
        niivue.drawScene();
      }
    }
  }, [highlightedRegion]);


  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Save the last touch event for later use in touchEnd
    if (e.touches.length > 0) {
      lastTouchEvent.current = e.touches[0];
    }
    handleCanvasInteraction(e);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Save the last touch event for later use in touchEnd
    if (e.touches.length > 0) {
      lastTouchEvent.current = e.touches[0];
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // If we have a saved touch event, create a synthetic mouse event
    // and pass it to the handleCanvasInteraction function
    if (lastTouchEvent.current && canvasRef.current && gameMode !== 'navigation') {
      // Create a synthetic event using the last saved touch position
      const syntheticEvent = {
        ...e,
        touches: [lastTouchEvent.current] as unknown as React.TouchList
      } as React.TouchEvent<HTMLCanvasElement>;
      // Call the mouse event handler with our synthetic event
      handleCanvasInteraction(syntheticEvent);
      // Clear the saved touch event
    }
    lastTouchEvent.current = null;
  };

  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!niivue || !niivue.gl || !niivue.volumes[1] || !cMap.current || !isGameRunning || !canvasRef.current) return;
    const clickedRegionLocation = getClickedRegion(niivue, canvasRef.current, cMap.current, e)
    if (clickedRegionLocation) {
      selectedVoxelProp.current = clickedRegionLocation;
      if (gameMode === 'navigation') {
        setHeaderText(cMap.current.labels?.[clickedRegionLocation.idx] || t('no_region_selected'));
        setHighlightedRegion(clickedRegionLocation.idx);
        if (tooltip) {
          setTooltip({ ...tooltip, visible: false });
        }
        niivue.opts.crosshairColor = [1, 1, 1, 1];
        niivue.drawScene();
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
      } else {
        if (guessButtonRef.current) guessButtonRef.current.disabled = true;
      }
    }
  }

  const validateGuess = async () => {
    if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current || !niivue) {
      console.warn('Cannot validate guess:', { selectedVoxelProp, isGameRunning, currentTarget });
      return;
    }
    let guessSuccess = null;
    let isEndgame = false;
    let clickedRegion = null;
    let scoreIncrement = 0;
    let givenFinalScore = 0;
    let performHighlight = false;
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
        isEndgame = !guessSuccess
      }
    }

    let previousScore = currentScoreRef.current;
    scoreIncrement = getUpdatedScore({ isEndgame, guessSuccess, scoreIncrement, performHighlight }).scoreIncrement

    if (isEndgame) {
      performEndGame({ finalScore: isLoggedIn ? givenFinalScore : previousScore + scoreIncrement })
    }
  }

  const getUpdatedScore = ({ isEndgame, guessSuccess, scoreIncrement, performHighlight }:
    { isEndgame: boolean, guessSuccess: boolean, scoreIncrement: number, performHighlight: boolean }): { scoreIncrement: number } => {
    if (!selectedVoxelProp.current || !isGameRunning || !currentTarget.current) {
      console.warn('Cannot update score:', { selectedVoxelProp, isGameRunning, currentTarget });
      return { scoreIncrement };
    }
    const targetName = cMap.current && cMap.current.labels?.[currentTarget.current] ? cMap.current.labels[currentTarget.current] : t('unknown_region');
    const clickedRegionName = cMap.current && cMap.current.labels?.[selectedVoxelProp.current.idx] ? cMap.current.labels[selectedVoxelProp.current.idx] : t('unknown_region');

    if (guessSuccess) {
      // Correct Guess
      setCurrentCorrects((cs) => cs + 1); // Increment correct count for other modes

      if (gameMode === 'time-attack') {
        // Add full points for correct guess
        setCurrentScore((curScore) => curScore + (isLoggedIn ? scoreIncrement : MAX_POINTS_PER_REGION));
      }
      if (gameMode === 'streak') {
        // Increment streak for correct guess
        setCurrentStreak((cs) => cs + (isLoggedIn ? scoreIncrement : 1));
      }
      if (gameMode === 'practice') {
        setCurrentAttempts(0); // Reset attempts on correct guess
      } else {
        setCurrentAttempts((curAttempts) => curAttempts + 1); // Increment attempts 
      }

      setHeaderTextMode("success"); // Indicate correct guess visually
      if (cLut.current && niivue && niivue.volumes.length > 1 && niivue.volumes[1].colormapLabel) {
        niivue.volumes[1].colormapLabel.lut = cLut.current;
        niivue.updateGLVolume();
        niivue.drawScene(); // Redraw scene to ensure color reset is visible
      }
      selectedVoxelProp.current = null; // Reset selected voxel after guess
      if (guessButtonRef.current) guessButtonRef.current.disabled = true; // Disable guess button until next target

      // Move to the next target after a short delay to show feedback
      if (!isEndgame) {
        setTimeout(() => {
          selectNewTarget();
        }, 100);
      }
    } else { // Incorrect Guess
      setCurrentErrors((prevErrors) => prevErrors + 1); // Increment error count
      setCurrentAttempts((curAttempts) => curAttempts + 1); // Increment attempts 

      if (gameMode === 'practice') {
        // Use i18next interpolation for the incorrect message
        const incorrectMessage = t('incorrect_clicked', { region: clickedRegionName });
        setHeaderText(incorrectMessage);
        setHeaderTextMode("failure")

        //console.log(`Incorrect guess: ${clickedRegionName} (ID: ${clickedRegion}), Expected: ${targetName} (ID: ${currentTarget})`);

        //console.log(currentAttempts, MAX_ATTEMPTS_BEFORE_HIGHLIGHT);
        if ((!isLoggedIn && currentAttemptsRef.current >= MAX_ATTEMPTS_BEFORE_HIGHLIGHT - 1) || 
            (isLoggedIn && performHighlight)) {
          setHighlightedRegion(currentTarget.current); // Highlight target region after max attempts
        }
        // Increased timeout duration to make the incorrect message visible longer
        setTimeout(() => {
          // Restore the "Find: [Target Region]" message using the 'find' key
          const findPrefix = t('find') || 'Find: ';
          setHeaderText(findPrefix + targetName);
          setHeaderTextMode("normal")
        }, 3000); // Increased delay to 3 seconds
      } else if (gameMode === 'time-attack') {
        // *** MODIFIED FOR TIME ATTACK: Calculate and add partial score for incorrect guess ***
        if (!isLoggedIn && cMap.current && cMap.current.labels && cMap.current.centers) {
          const correctCenters = cMap.current.centers ? cMap.current.centers[currentTarget.current] : null;
          const proposedCenter = selectedVoxelProp.current.mm;

          if (correctCenters && proposedCenter) {
            // Calculate Euclidean distance between centers
            let minDistance = Infinity;
            for (const center of correctCenters) {
              const centerDistance = Math.sqrt(
                Math.pow(center[0] - proposedCenter[0], 2) +
                Math.pow(center[1] - proposedCenter[1], 2) +
                Math.pow(center[2] - proposedCenter[2], 2)
              );
              if (centerDistance < minDistance) {
                minDistance = centerDistance;
              }
            }

            // Calculate score based on distance
            if (minDistance <= MAX_PENALTY_DISTANCE) {
              scoreIncrement = Math.floor((1 - (minDistance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
            } else {
              scoreIncrement = 0; // No points for too far away
            }

            /*console.log(`Time Attack Error:`);
            console.log(`  Target Region ID: ${currentTarget} (${targetName}), Clicked Region ID: ${clickedRegion} (${clickedRegionName})`);
            console.log(`  Correct Center: ${correctCenter}`);
            console.log(`  Clicked Center: ${clickedCenter}`);
            console.log(`  Calculated Distance: ${distance.toFixed(2)} mm`);
            console.log(`  Points earned for this error: ${scoreIncrement.toFixed(2)}`);*/
            // ***************************************************************************

          } else {
            console.warn(`Center data missing for region ${currentTarget} or ${selectedVoxelProp.current}. Cannot calculate distance-based score.`);
            // Option: award minimal points or 0 if center data is missing
            scoreIncrement = 0; // Award 0 points if centers are missing
          }
        }

        setCurrentScore((score) => score + scoreIncrement); // Add points earned for this attempt to the total score

        // Display temporary incorrect message and points earned
        const incorrectMsgPrefix = t('incorrect_prefix') || 'Incorrect! It\'s ';
        const pointsMsg = Math.round(scoreIncrement) > 0 ? ` (+${scoreIncrement.toFixed(1)} pts)` : ' (+0 pts)';
        setHeaderText(incorrectMsgPrefix + clickedRegionName + '!' + pointsMsg);
        setHeaderTextMode("failure"); // Indicate incorrect guess visually

        // Automatically move to the next target after a short delay
        if (!isEndgame) {
          setTimeout(() => {
            selectNewTarget();
          }, 100);
        }
      }

      selectedVoxelProp.current = null;
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;

      // Only update game display for score/error/streak *after* the incorrect message timeout in practice mode
      if (gameMode !== 'practice') {
        setForceDisplayUpdate((u) => u + 1);
      }
    }
    return { scoreIncrement }
  }

  function performEndGame({ finalScore }: { finalScore: number }) {
    if (gameMode === 'streak') {
      setFinalStreak(currentStreakRef.current); // Store the final streak before resetting
      setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
      setShowStreakOverlay(true);
      setHeaderTextMode("failure"); // Indicate streak ended visually
      setIsGameRunning(false);
    }
    if (gameMode === 'time-attack') {
      if (!isLoggedIn) {
        const remaining = Math.floor(((startTime.current || Date.now()) + MAX_TIME_IN_SECONDS * 1000 - Date.now()) / 1000);
        finalScore = Math.round(currentScoreRef.current + (remaining > 0 ? remaining * BONUS_POINTS_PER_SECOND : 0))
      }
      endTimeAttack(finalScore)
    } else if (gameMode === 'streak') {
      setFinalStreak(currentStreakRef.current); // Store the final streak before resetting
      setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
      setShowStreakOverlay(true);
      return;
    }
  }


  function highlightRegionFluorescentYellow() {
    if (gameMode === 'navigation' && highlightedRegion === 0) return;
    //console.log('highlightRegionFluorescentYellow called with regionId:', highlightedRegion);
    if (cLut.current && niivue && highlightedRegion && highlightedRegion * 4 < cLut.current.length) {
      const lut = cLut.current.slice();
      // Make all regions transparent initially except region 0 if needed
      for (let i = 0; i < lut.length; i += 4) {
        lut[i + 0] = 0;   // R
        lut[i + 1] = 0;   // G
        lut[i + 2] = 0;   // B
        lut[i + 3] = 0;   // A (transparent)
      }
      // Highlight the specific region in yellow
      lut[highlightedRegion * 4 + 0] = 255; // R
      lut[highlightedRegion * 4 + 1] = 255; // G
      lut[highlightedRegion * 4 + 2] = 0;   // B (Yellow)
      lut[highlightedRegion * 4 + 3] = 255; // A (Fully Opaque)

      if (niivue.volumes[1].colormapLabel) niivue.volumes[1].colormapLabel.lut = new Uint8ClampedArray(lut);

      if(gameMode !== 'navigation' && cMap.current && cMap.current.centers && cMap.current.centers[highlightedRegion]){
        const center = cMap.current.centers[highlightedRegion];
        niivue.scene.crosshairPos = niivue.mm2frac(new Float32Array(center[0]));
        niivue.createOnLocationChange();
      }
      niivue.updateGLVolume();
      niivue.drawScene();
    } else {
      console.error('Cannot highlight region:', {
        clut: !!cLut.current,
        nv1: !!niivue,
        highlightedRegion,
        lutLength: cLut.current?.length
      });
    }
  }

  const handleRecolorization = () => {
    if (isGameRunning && gameMode === 'navigation' && niivue) {
      if (cLut.current && niivue && niivue.volumes.length > 1 && niivue.volumes[1].colormapLabel) {
        niivue.volumes[1].colormapLabel.lut = cLut.current;
        niivue.updateGLVolume();
        niivue.drawScene();
      }
      setHeaderText(t('click_to_identify'));
      selectedVoxelProp.current = null;
      setHighlightedRegion(null);
      if (tooltip) {
        setTooltip({ ...tooltip, visible: false });
      }
      niivue.opts.crosshairColor = [1, 1, 1, 1]; // Restore crosshair color
      niivue.drawScene();
    }
  }

  const updateGameDisplay = () => {
    // Update labels based on mode
    if (gameMode === 'time-attack') {
      setHeaderScore(t('score_label') + `: ${Math.round(currentScore)}`); // Display rounded score for Time Attack
    } else if (gameMode === 'streak' || gameMode === 'practice') {
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
        ? cMap.current?.labels?.[highlightedRegion] || t('no_region_selected')
        : t('click_to_identify'));
    } else if (currentTarget.current !== null && cMap.current && cMap.current.labels && cMap.current.labels[currentTarget.current]) {
      // Use 'find' translation key directly
      const prefix = t('find') || 'Find: ';
      // For time attack, display the current question number
      if (gameMode === 'time-attack') {
        setHeaderText(`${currentAttempts}/${TOTAL_REGIONS_TIME_ATTACK} - ${prefix}${cMap.current.labels[currentTarget.current]}`);
      } else {
        setHeaderText(prefix + cMap.current.labels[currentTarget.current]);
      }
      //console.log(`Displaying target: ${cMap.current.labels[currentTarget.current]} (ID: ${currentTarget.current})`);
    } else {
      setHeaderText(''); // No region : cleanup
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isGameRunning || !canvasRef.current || !niivue || gameMode !== 'navigation' || highlightedRegion !== null) {
      setTooltip({ ...tooltip, visible: false });
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.pageX;
    const y = e.clientY - rect.top;
    const pos = niivue.getNoPaddingNoBorderCanvasRelativeMousePosition(e.nativeEvent, niivue.gl.canvas);

    // Check if mouse is within canvas bounds
    if (x >= 0 && x < rect.width && y >= 0 && y < rect.height && pos && cMap.current && cMap.current.labels && niivue.uiData && niivue.uiData.dpr) {
      const frac = niivue.canvasPos2frac([pos.x * niivue.uiData.dpr, pos.y * niivue.uiData.dpr]);
      if (frac[0] >= 0) {
        const mm = niivue.frac2mm(frac);
        const vox = niivue.volumes[1].mm2vox(Array.from(mm));
        const idx = Math.round(niivue.volumes[1].getValue(vox[0], vox[1], vox[2]));
        if (isFinite(idx) && idx > 0 && idx in cMap.current.labels) { // Ensure valid region ID > 0
          setTooltip({
            visible: true, text: cMap.current.labels[idx] || t('unknown_region'),
            x: x + 10, y: y + 10
          });
        } else {
          setTooltip({ ...tooltip, visible: false });
        }
      }
    } else {
      // Mouse is outside canvas, remove tooltip
      setTooltip({ ...tooltip, visible: false });
    }
  }

  useEffect(() => {
    updateGameDisplay();
  }, [currentScore, currentCorrects, currentErrors, currentStreak, gameMode, currentTarget.current, highlightedRegion, forceDisplayUpdate]);

  useEffect(() => {
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
  }, [showStreakOverlay, showTimeattackOverlay])

  useEffect(() => {
    defineNiiOptions(niivue, viewerOptions)
  }, [viewerOptions])
  
  useLayoutEffect(() => {
  if (niivue && canvasRef.current && !isLoading) {
      // Niivue expects the canvas to be sized by CSS, but sometimes needs a manual resize event
      niivue.resizeListener();
    }
  }, [niivue, isLoading]);

  useEffect(()=>{
    setIsNavigationMode(gameMode === 'navigation');
  }, [gameMode])

  const myTitle = gameMode ? `NeuroGuessr - ${t(gameMode+"_mode")}` : t('neuroguessr_singleplayer_title')

  return (
    <>
      <title>{myTitle}</title>
      {isLoading && <LoadingScreen />}
      {tooltip.visible && <div className="region-tooltip" style={{ position: "absolute", left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}

      <div className="canvas-container">
        <canvas id="gl1" onClick={handleCanvasInteraction} 
          onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove}
          onMouseMove={handleCanvasMouseMove} onMouseLeave={handleCanvasMouseMove} ref={canvasRef}></canvas>
      </div>
      <div className="button-container">
        <a className="return-button" href="/welcome">{t("return_button")}</a>
        {isNavigationMode && <button className="return-button" 
            data-umami-event="go back" data-umami-event-gobacksource={gameMode}
            onClick={handleRecolorization}>{t("restore_color")}</button>}
        {!isNavigationMode && <button className="guess-button" ref={guessButtonRef} 
            data-umami-event="guess button" data-umami-event-guesssource={gameMode}
            onClick={validateGuess}>
          <span className="confirm-text">{t("confirm_guess")}</span>
          <span className="space-text">{t("space_key")}</span></button>}
      </div>

      {showStreakOverlay && <div id="streak-end-overlay" className="streak-overlay">
        <div className="overlay-content" ref={streakOverlayRef}>
          <h2>{t("streak_ended_title")}</h2>
          <p><span>{t("streak_ended_score")}</span><span id="final-streak" className="streak-number">{finalStreak}</span></p>
          {userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
          <div className="overlay-buttons">
            <button id="go-back-menu-button-streak" 
                data-umami-event="go back button" data-umami-event-gobacksource="streak" 
                className="home-button" onClick={() => { navigate("/welcome") }}>
              <i className="fas fa-home"></i>
            </button>
            <button id="restart-button-streak" 
                data-umami-event="restart button" data-umami-event-restartsource="streak" 
                className="restart-button" onClick={() => { setShowStreakOverlay(false); startGame() }}>
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
          {userPublishToLeaderboard === null && <PublishToLeaderboardBox />}
          <div className="score-progress-bar w3-light-grey w3-round">
            <div id="time-attack-score-bar" className="w3-container w3-round w3-blue"
              style={{ width: (finalScore / 1000) * 100 + "%" }}>{finalScore}</div>
            <span className="progress-label progress-label-med">{Math.round(MAX_POINTS_TIMEATTACK * 0.5)}</span>
            <span className="progress-label progress-label-max">{Math.round(MAX_POINTS_TIMEATTACK * 1)}</span>
          </div>
          <div className="overlay-buttons">
            <button id="go-back-menu-button-time-attack" className="home-button" 
                data-umami-event="go back button" data-umami-event-gobacksource="time-attack" 
                onClick={() => { navigate("/welcome") }}>
              <i className="fas fa-home"></i>
            </button>
            <button id="restart-button-time-attack" className="restart-button" 
                data-umami-event="restart button" data-umami-event-gobacksource="time-attack" 
                onClick={() => { setShowTimeattackOverlay(false); startGame() }}>
              <i className="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
      </div>}

    </>
  )
}

const PublishToLeaderboardBox = () => {
  const { t, updateToken } = useApp();
  const [published, setPublished] = useState<boolean | null>(null);
  const [publishErrorText, setPublishErrorText] = useState<string>("");
  const handleClick = async (val: boolean) => {
    setPublished(val);
    try {
      // Send the data to the server
      const response = await fetch('/api/config-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publishToLeaderboard: val }),
      });
      const result = await response.json();
      if (response.ok) {
        updateToken(result.token);
      } else {
        setPublishErrorText(result.message);
      }
    } catch (error) {
      // Handle network or other errors
      console.error('Error updating publish mode:', error);
      setPublishErrorText(t('server_error'))
    }
  }
  return (
    <>
      <h2>{t("publish_to_leaderboard_header")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("publish_to_leaderboard_explanation") }}></p>
      <div style={{ margin: "1em 0", display: "flex", flexDirection: "row", gap: 2, justifyContent: "center" }}>
        <button
          type="button" className="publish-btn"
          data-umami-event="publish button" data-umami-event-publishchoice="yes" 
          style={{
            padding: "0.5em 1.5em",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={() => handleClick(true)}
        >
          {t("publish_yes")}
        </button>
        <button
          type="button" className="publish-btn"
          data-umami-event="publish button" data-umami-event-publishchoice="no" 
          style={{
            padding: "0.5em 1.5em",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
          onClick={() => handleClick(false)}
        >
          {t("publish_no")}
        </button>
      </div>
      {publishErrorText && <div style={{ color: "red" }}>
        {publishErrorText}
      </div>}
    </>
  )
}

