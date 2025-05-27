import type { TFunction } from 'i18next';
import './GameScreen.css'
import './Help.css'
import { useEffect, useRef, useState } from 'react';
import { Niivue, SHOW_RENDER, type NVImage } from '@niivue/niivue';
import atlasFiles from './atlas_files';
import { fetchJSON } from './helper_niivue';
import { isTokenValid, refreshToken } from './helper_login';

type GameScreenProps = {
  t: TFunction<"translation", undefined>;
  callback: AppCallback;
  currentLanguage: string;
  atlasRegions: AtlasRegion[];
  askedAtlas: string | null;
  gameMode: string | null;
  preloadedAtlas: NVImage | null;
  preloadedBackgroundMNI: NVImage | null;
  viewerOptions: DisplayOptions;
  loadEnforcer: number;
  isLoggedIn: boolean;
  authToken: string;
};
type ColorMap = {
  R: number[];
  G: number[];
  B: number[];
  A: number[];
  I: number[];
  min?: number;
  max?: number;
  labels?: string[];
  centers?: number[][];
};

async function startOnlineSession(token: string, mode: string, atlas: string): Promise<{ sessionToken: string, sessionId: string } | null> {
  // Check if the player is logged in
  if (!token) {
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
      alert(result.message || "Failed to start game session.");
      return null;
    }

    const result = await response.json();
    return { sessionToken: result.sessionToken, sessionId: result.sessionId };
  } catch (error) {
    console.error("Error starting online game session:", error);
    alert("An error occurred while starting online game session. Please try again later.");
    return null;
  }
}


function GameScreen({ t, callback, currentLanguage, atlasRegions, askedAtlas, gameMode,
  preloadedAtlas, preloadedBackgroundMNI, viewerOptions, loadEnforcer, isLoggedIn, authToken }: GameScreenProps) {
  // Time Attack specific constants
  const TOTAL_REGIONS_TIME_ATTACK = 18;
  const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
  const MAX_TIME_IN_SECONDS = 100; // nombre de secondes pour le Time Attack
  const BONUS_POINTS_PER_SECOND = 1; // nombre de points bonus par seconde restante (max 100*10 = 1000 points)
  const MAX_POINTS_TIMEATTACK = MAX_POINTS_PER_REGION * TOTAL_REGIONS_TIME_ATTACK + MAX_TIME_IN_SECONDS * BONUS_POINTS_PER_SECOND;
  const MAX_POINTS_WITH_PENALTY = 30 // 30 points max if clicked outside the region
  const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)
  const MAX_ATTEMPTS_BEFORE_HIGHLIGHT = 3; // Number of attempts before highlighting the target region in practice mode

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
  const currentTarget = useRef<number | null>(null);
  const selectedVoxel = useRef<number[] | null>(null);
  const validRegions = useRef<number[]>([]);
  const usedRegions = useRef<number[]>([]);
  const [highlightedRegion, setHighlightedRegion] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const cMap = useRef<ColorMap | null>(null);
  const cLut = useRef<Uint8ClampedArray | null>(null);
  const niivue = useRef(new Niivue({
    show3Dcrosshair: true,
    backColor: [0, 0, 0, 1],
    crosshairColor: [1, 1, 1, 1]
  }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guessButtonRef = useRef<HTMLButtonElement>(null);
  const startTime = useRef<number | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionToken = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const [showHelpOverlay, setShowHelpOverlay] = useState<boolean>(false);
  const helpContentRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLDivElement>(null);
  const [showStreakOverlay, setShowStreakOverlay] = useState<boolean>(false);
  const streakOverlayRef = useRef<HTMLDivElement>(null);
  const [showTimeattackOverlay, setShowTimeattackOverlay] = useState<boolean>(false);
  const timeattackOverlayRef = useRef<HTMLDivElement>(null);
  const [forceDisplayUpdate, setForceDisplayUpdate] = useState<number>(0);

  useEffect(() => {
    initNiivue()
    checkLoading();
  }, [])

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
      if (e.key === 'Escape' && showHelpOverlay) {
        setShowHelpOverlay(false)
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


  const initNiivue = () => {
    niivue.current.attachTo('gl1').then(() => {
      setIsLoadedNiivue(true);
      niivue.current.setInterpolation(true);
      niivue.current.opts.crosshairGap = 0;
      niivue.current.opts.dragMode = niivue.current.dragModes.slicer3D;
      niivue.current.opts.yoke3Dto2DZoom = true;
      defineNiiOptions()
    })
  }
  const loadAtlasNii = () => {
    if (niivue.current && askedAtlas && preloadedAtlas && preloadedBackgroundMNI) {
      for (let i = 1; i < niivue.current.volumes.length; i++) {
        niivue.current.removeVolume(niivue.current.volumes[i]);
      }
      // Load volumes
      if (niivue.current.volumes.length == 0) {
        niivue.current.addVolume(preloadedBackgroundMNI);
      }
      niivue.current.addVolume(preloadedAtlas);
      niivue.current.setClipPlane([2, 270, 0]);
      niivue.current.opts.isSliceMM = true;
    }
  }
  function generateRandomInts(quantity: number, max: number){
    const arr = []
    while(arr.length < quantity){
      var candidateInt = Math.floor(Math.random() * max) + 1
      if(arr.indexOf(candidateInt) === -1) arr.push(candidateInt)
    }
    return(arr)
  }
  const loadAtlasData = async () => {
    try {
      if (!askedAtlas) return
      const selectedAtlasFiles = atlasFiles[askedAtlas];
      cMap.current = await fetchJSON("assets/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
      if (niivue.current && niivue.current.volumes.length > 1 && cMap.current) {
        niivue.current.volumes[1].setColormapLabel(cMap.current)
        niivue.current.volumes[1].setColormapLabel({
          "R":generateRandomInts(cMap.current.labels?.length || 0, 255),
          "G":generateRandomInts(cMap.current.labels?.length || 0, 255),
          "B":generateRandomInts(cMap.current.labels?.length || 0, 255),
          "A":Array(1).fill(0).concat(Array((cMap.current.labels?.length || 0)-1).fill(255)),
          "I":Array.from(Array(cMap.current.labels?.length || 0).keys()),
          "labels":cMap.current.labels || [],
        });
        cLut.current = niivue.current.volumes[1].colormapLabel?.lut || new Uint8ClampedArray();
        /*const numRegions = Object.keys(cMap.current.labels || []).length;
        console.log(`num regions : ${numRegions}`, cMap.current.labels?.length, cMap.current.R.length, selectedAtlasFiles.json)
        cLut.current = new Uint8Array(numRegions * 4);

        if (askedAtlas === 'aal') {
          cLut.current[0] = Math.floor(Math.random() * 256);
          cLut.current[1] = Math.floor(Math.random() * 256);
          cLut.current[2] = Math.floor(Math.random() * 256);
          cLut.current[3] = 255;
          cLut.current[4] = Math.floor(Math.random() * 256);
          cLut.current[5] = Math.floor(Math.random() * 256);
          cLut.current[6] = Math.floor(Math.random() * 256);
          cLut.current[7] = 255;
        }
        else if (askedAtlas === 'glasser') {
          //   console.log('Atlas cmap.labels:', cmap.labels);
        } else {
          cLut.current[0] = 0;
          cLut.current[1] = 0;
          cLut.current[2] = 0;
          cLut.current[3] = 0;
          cLut.current[4] = Math.floor(Math.random() * 256);
          cLut.current[5] = Math.floor(Math.random() * 256);
          cLut.current[6] = Math.floor(Math.random() * 256);
          cLut.current[7] = 255;
        }
        for (let i = 2; i < numRegions; i++) {
          cLut.current[i * 4 + 0] = Math.floor(Math.random() * 256);
          cLut.current[i * 4 + 1] = Math.floor(Math.random() * 256);
          cLut.current[i * 4 + 2] = Math.floor(Math.random() * 256);
          cLut.current[i * 4 + 3] = 255;
        }

        if (niivue.current.volumes[1].colormapLabel) niivue.current.volumes[1].colormapLabel.lut = new Uint8ClampedArray(cLut.current.slice()); */
        niivue.current.setOpacity(1, viewerOptions.displayOpacity);
        niivue.current.updateGLVolume();

        const atlasData = niivue.current.volumes[1].getVolumeData();
        const dataRegions = [...new Set((atlasData as unknown as number[]).filter(val => val > 0).map(val => Math.round(val)))];
        validRegions.current = dataRegions.filter(val => cMap.current?.labels?.[val] !== undefined && Number.isInteger(val));

        console.log(`Atlas: ${selectedAtlasFiles.name}`);
        console.log(`Atlas Data Sample:`, atlasData.slice(0, 10));
        console.log(`Data Regions (rounded):`, dataRegions);
        console.log(`Valid Regions:`, validRegions);
        if (validRegions.current) console.log(`Valid Region Labels:`, validRegions.current.map(id => cMap.current?.labels?.[id]));

        if (validRegions.current.length === 0) {
          console.warn(`No valid regions found in ${selectedAtlasFiles.name} data.`);
          validRegions.current = Object.keys(cMap.current.labels || [])
            .map(Number)
            .filter(val => val > 0 && Number.isInteger(val));
          if (validRegions.current.length === 0) {
            throw new Error(`No valid regions available for ${selectedAtlasFiles.name}`);
          }
          console.warn(`Fallback to cmap.labels keys:`, validRegions);
        }
      }
    } catch (error) {
      console.error(`Failed to load atlas data for ${askedAtlas}:`, error);
      callback.setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
    }
  }
  useEffect(() => {
    checkLoading();
  }, [preloadedAtlas, preloadedBackgroundMNI, isLoadedNiivue, gameMode, askedAtlas, loadEnforcer])

  const checkLoading = async () => {
    if (preloadedAtlas && preloadedBackgroundMNI && isLoadedNiivue) {
      setIsLoading(false);
      loadAtlasNii();
      await loadAtlasData();
      startGame();
    } else {
      setIsLoading(true);
    }
  }

  useEffect(()=>{
    currentStreakRef.current = currentStreak
  }, [currentStreak])
  useEffect(()=>{
    currentScoreRef.current = currentScore
  }, [currentScore])

  const resetGameState = () => {
    currentTarget.current = null;
    selectedVoxel.current = null;
    setCurrentAttempts(0); // Reset attempts for practice mode
    setCurrentScore(0); // Reset score for Time Attack
    setCurrentCorrects(0); // Reset correct count for Practice/Streak
    setCurrentErrors(0); // Reset errors
    setCurrentStreak(0); // Reset streak
    usedRegions.current = []; // Reset used regions for time attack
    setHighlightedRegion(null);
    callback.setHeaderTextMode("normal"); // Reset header text mode
    callback.setHeaderText(gameMode === 'navigation' ? t('click_to_identify') : t('not_started'));
    if (gameMode === 'navigation') {
      callback.setHeaderScore("");
      callback.setHeaderStreak("");
      callback.setHeaderErrors("");
    } else if (gameMode === 'practice') {
      callback.setHeaderScore(t('correct_label') + ": 0");
      callback.setHeaderErrors("0");
      callback.setHeaderStreak("");
    } else if (gameMode === 'streak') {
      callback.setHeaderScore(t('correct_label') + ": 0");
      callback.setHeaderErrors("0");
      callback.setHeaderStreak("0");
    } else if (gameMode === 'time-attack') {
      callback.setHeaderScore(t('score_label') + ": 0");
      callback.setHeaderErrors("0");
      callback.setHeaderStreak("");
    }
    if (guessButtonRef.current) guessButtonRef.current.disabled = true;
    if (cLut.current && niivue.current && niivue.current.volumes.length > 1 && niivue.current.volumes[1].colormapLabel) {
      niivue.current.volumes[1].colormapLabel.lut = new Uint8ClampedArray(cLut.current.slice());
      niivue.current.updateGLVolume();
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
    if (niivue.current) {
      defineNiiOptions()
      niivue.current.drawScene();
    }
  }

  const startGame = () => {
    setIsGameRunning(true);
    resetGameState();

    startOnlineSession(authToken, gameMode || 'practice', askedAtlas || 'aal').then((session) => {
      if (session) {
        sessionToken.current = session.sessionToken;
        sessionId.current = session.sessionId;
        console.log("Online session started:", session);
      } else {
        console.warn("Failed to start online session, proceeding in offline mode.");
      }
      console.log("is logged in, starting session"); // TODO
    }).catch((error) => {
      console.error("Error starting online session:", error);
    }).finally(() => {
      if (gameMode === 'time-attack') {
        if (!sessionToken.current) { // logic for local game
          // Shuffle validRegions and take the first 20 for Time Attack
          if (validRegions.current.length >= TOTAL_REGIONS_TIME_ATTACK) {
            validRegions.current.sort(() => 0.5 - Math.random());
            validRegions.current = validRegions.current.slice(0, TOTAL_REGIONS_TIME_ATTACK);
            console.log(`Selected ${TOTAL_REGIONS_TIME_ATTACK} regions for Time Attack:`, validRegions);
          } else if (validRegions.current.length > 0) {
            console.warn(`Not enough regions for Time Attack (${TOTAL_REGIONS_TIME_ATTACK} required), using all ${validRegions.current.length} available regions.`);
            validRegions.current.sort(() => 0.5 - Math.random()); // Still shuffle available regions
          } else {
            console.error("No valid regions available for Time Attack!");
            callback.setHeaderText(t('no_regions_available') || 'No regions available.');
            return; // Stop game initialization if no regions
          }
        }
        startTimer(); // Start timer for Time Attack
      }
      // Start the first round
      selectNewTarget();
      setForceDisplayUpdate((u)=>u+1);
    })

  }


  function startTimer() {
    startTime.current = Date.now();
    refreshTimer()
    timerInterval.current = setInterval(() => {
      refreshTimer()
    }, 500);
  }

  const refreshTimer = () => {
    const remaining = Math.floor(((startTime.current || Date.now()) + MAX_TIME_IN_SECONDS * 1000 - Date.now()) / 1000);
    //const elapsed = Math.floor((Date.now() - (startTime.current || 0)) / 1000);
    const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
    const seconds = (remaining % 60).toString().padStart(2, '0');
    callback.setHeaderTime(`${minutes}:${seconds}`);
    if (remaining <= 0) endTimeAttack(currentScoreRef.current); // Call endTimeAttack to show the window // TODO CALL SERVER IF CONNECTED
  }

  function endTimeAttack(givenFinalScore: number) {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const elapsed = Math.floor((Date.now() - (startTime.current || 0)) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = (elapsed % 60).toString().padStart(2, '0');

    setFinalScore(givenFinalScore);
    setFinalElapsed(elapsed);
    setShowTimeattackOverlay(true); // Show Time Attack end overlay

    callback.setHeaderTextMode("success")

    // Stop the game
    setIsGameRunning(false)
    selectedVoxel.current = null;
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
    } else {
      if (gameMode === 'time-attack' && usedRegions.current && usedRegions.current.length >= TOTAL_REGIONS_TIME_ATTACK) {
        regionId = -1;
      } else if (validRegions.current && validRegions.current.length === 0) {
        regionId = -1;
      } else if (validRegions.current && usedRegions.current) {
        let availableRegions = validRegions.current.filter(r => !usedRegions.current.includes(r));
        console.log("avail", availableRegions.length)
        if (availableRegions.length !== 0) {
          regionId = availableRegions[Math.floor(Math.random() * availableRegions.length)];
          if ((gameMode === 'time-attack' || gameMode === 'streak')) { // Add streak mode here to track used regions
            usedRegions.current.push(regionId);
          }
        }
      }
    }
    if(regionId === -1){ // did not found region
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
      setForceDisplayUpdate((u)=>u+1); // Update display with the new target label
      selectedVoxel.current = null; // Reset selected voxel
      if(gameMode == "practice") setCurrentAttempts(0); // Reset attempts in practice mode
      if (cLut.current && niivue.current) {
        if (niivue.current.volumes[1].colormapLabel) niivue.current.volumes[1].colormapLabel.lut = new Uint8ClampedArray(cLut.current.slice());
        niivue.current.updateGLVolume();
        niivue.current.drawScene(); // Redraw scene to ensure color reset is visible
      }
    }
  }

  useEffect(() => {
    if (highlightedRegion) {
      highlightRegionFluorescentYellow();
    } else { // reset to original color
      if (cLut.current && niivue.current && niivue.current.volumes.length > 1 && niivue.current.volumes[1].colormapLabel) {
        niivue.current.volumes[1].colormapLabel.lut = cLut.current;
        niivue.current.updateGLVolume();
        niivue.current.drawScene();
      }
    }
  }, [highlightedRegion]);

  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!niivue.current || !niivue.current.gl || !niivue.current.volumes[1] || !cMap.current || !isGameRunning || !canvasRef.current) return;
    const isTouch = e.type === 'touchstart';
    const touch = isTouch ? (e as React.TouchEvent<HTMLCanvasElement>).touches[0] : (e as React.MouseEvent<HTMLCanvasElement>);
    const mouseEvt = isTouch
      ? ({
        ...e, layerX: (e as React.TouchEvent<HTMLCanvasElement>).touches[0].clientX,
        layerY: (e as React.TouchEvent<HTMLCanvasElement>).touches[0].clientY,
        offsetX: (e as React.TouchEvent<HTMLCanvasElement>).touches[0].clientX,
        offsetY: (e as React.TouchEvent<HTMLCanvasElement>).touches[0].clientY
      } as unknown as MouseEvent)
      : e;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Check if touch/click is within canvas bounds
    if (x >= 0 && x < rect.width && y >= 0 && y < rect.height) {
      const pos = niivue.current.getNoPaddingNoBorderCanvasRelativeMousePosition(mouseEvt as MouseEvent, niivue.current.gl.canvas);
      if (!pos) return; // If position is not valid, exit early
      const frac = niivue.current.canvasPos2frac([pos.x * (niivue.current.uiData?.dpr ?? 1), pos.y * (niivue.current.uiData?.dpr ?? 1)]);
      if (frac[0] >= 0) {
        const mm = niivue.current.frac2mm(frac);
        const vox = niivue.current.volumes[1].mm2vox(Array.from(mm));
        const idx = Math.round(niivue.current.volumes[1].getValue(vox[0], vox[1], vox[2]));
        if (isFinite(idx) && idx > 0 && idx in (cMap.current?.labels ?? [])) { // Ensure valid region ID > 0
          selectedVoxel.current = Array.from(vox);
          if (gameMode === 'navigation') {
            callback.setHeaderText(cMap.current.labels?.[idx] || t('no_region_selected'));
            setHighlightedRegion(idx);
            if (tooltip) {
              setTooltip({ ...tooltip, visible: false });
            }
            niivue.current.opts.crosshairColor = [1, 1, 1, 1];
            niivue.current.drawScene();
          } else {
            if (guessButtonRef.current) {
              guessButtonRef.current.disabled = false;
            }
            niivue.current.opts.crosshairColor = [1, 1, 1, 1];
            niivue.current.drawScene();
          }
          console.log(`Clicked voxel: ${vox}, Region ID: ${idx}, Region Name: ${cMap.current.labels?.[idx] || t('unknown_region')}`);
        } else { // invalid region selected
          selectedVoxel.current = null;
          if (gameMode === 'navigation') {
            callback.setHeaderText(t('no_region_selected'));
            setHighlightedRegion(null);
          } else {
            if (guessButtonRef.current) guessButtonRef.current.disabled = true;
          }
          console.log(`Clicked voxel: ${vox}, Invalid or background region ID: ${idx}`);
        }
      }
    }
  }

  const validateGuess = async () => {
    if (!selectedVoxel.current || !isGameRunning || !currentTarget.current) {
      console.warn('Cannot validate guess:', { selectedVoxel, isGameRunning, currentTarget });
      return;
    }
    let guessSuccess = null;
    let isEndgame = false;
    let clickedRegion = null;
    let scoreIncrement = 0;
    let givenFinalScore = 0;
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
            coordinates: selectedVoxel.current
          }),
        });
        const result = await response.json();
        guessSuccess = result.isCorrect;
        isEndgame = result.endgame;
        clickedRegion = result.voxelValue;
        scoreIncrement = result.scoreIncrement;
        givenFinalScore = result.finalScore
      } catch (error) {
        console.error("Error occured during region validation:", error);
        return false;
      }
    } else {
      clickedRegion = Math.round(niivue.current.volumes[1].getValue(selectedVoxel.current[0], selectedVoxel.current[1], selectedVoxel.current[2]));
      guessSuccess = clickedRegion === currentTarget.current;
    }

    const targetName = cMap.current && cMap.current.labels?.[currentTarget.current] ? cMap.current.labels[currentTarget.current] : t('unknown_region');
    const clickedRegionName = clickedRegion && cMap.current && cMap.current.labels?.[clickedRegion] ? cMap.current.labels[clickedRegion] : t('unknown_region');

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

      callback.setHeaderTextMode("success"); // Indicate correct guess visually
      if (cLut.current && niivue.current && niivue.current.volumes.length > 1 && niivue.current.volumes[1].colormapLabel) {
        niivue.current.volumes[1].colormapLabel.lut = cLut.current;
        niivue.current.updateGLVolume();
        niivue.current.drawScene(); // Redraw scene to ensure color reset is visible
      }
      selectedVoxel.current = null; // Reset selected voxel after guess
      if (guessButtonRef.current) guessButtonRef.current.disabled = true; // Disable guess button until next target

      // Move to the next target after a short delay to show feedback
      setTimeout(() => {
        selectNewTarget();
      }, 100);

    } else { // Incorrect Guess
      setCurrentErrors((prevErrors) => prevErrors + 1); // Increment error count
      setCurrentAttempts((curAttempts) => curAttempts + 1); // Increment attempts 

      if (gameMode === 'practice') {
        // Use i18next interpolation for the incorrect message
        const incorrectMessage = t('incorrect', { region: clickedRegionName });
        callback.setHeaderText(incorrectMessage);
        callback.setHeaderTextMode("failure")

        console.log(`Incorrect guess: ${clickedRegionName} (ID: ${clickedRegion}), Expected: ${targetName} (ID: ${currentTarget})`);


        console.log(currentAttempts, MAX_ATTEMPTS_BEFORE_HIGHLIGHT);
        if (currentAttempts >= MAX_ATTEMPTS_BEFORE_HIGHLIGHT - 1) {
          setHighlightedRegion(currentTarget.current); // Highlight target region after max attempts
        }
        // Increased timeout duration to make the incorrect message visible longer
        setTimeout(() => {
          // Restore the "Find: [Target Region]" message using the 'find' key
          const findPrefix = t('find') || 'Find: ';
          callback.setHeaderText(findPrefix + targetName);
          callback.setHeaderTextMode("normal")
        }, 3000); // Increased delay to 3 seconds

      } else if (gameMode === 'time-attack') {
        // *** MODIFIED FOR TIME ATTACK: Calculate and add partial score for incorrect guess ***
        if (!isLoggedIn && cMap.current && cMap.current.labels && cMap.current.centers) {
          const correctCenter = cMap.current.centers ? cMap.current.centers[currentTarget.current] : null;
          const clickedCenter = cMap.current.centers && clickedRegion ? cMap.current.centers[clickedRegion] : null;

          if (correctCenter && clickedCenter) {
            // Calculate Euclidean distance between centers
            const distance = Math.sqrt(
              Math.pow(correctCenter[0] - clickedCenter[0], 2) +
              Math.pow(correctCenter[1] - clickedCenter[1], 2) +
              Math.pow(correctCenter[2] - clickedCenter[2], 2)
            );
            
            // Calculate score based on distance
            if (distance <= MAX_PENALTY_DISTANCE) {
                scoreIncrement = Math.floor((1 - (distance / MAX_PENALTY_DISTANCE)) * MAX_POINTS_WITH_PENALTY);
            } else {
                scoreIncrement = 0; // No points for too far away
            }

            console.log(`Time Attack Error:`);
            console.log(`  Target Region ID: ${currentTarget} (${targetName}), Clicked Region ID: ${clickedRegion} (${clickedRegionName})`);
            console.log(`  Correct Center: ${correctCenter}`);
            console.log(`  Clicked Center: ${clickedCenter}`);
            console.log(`  Calculated Distance: ${distance.toFixed(2)} mm`);
            console.log(`  Points earned for this error: ${scoreIncrement.toFixed(2)}`);
            // ***************************************************************************

          } else {
            console.warn(`Center data missing for region ${currentTarget} or ${clickedRegion}. Cannot calculate distance-based score.`);
            // Option: award minimal points or 0 if center data is missing
            scoreIncrement = 0; // Award 0 points if centers are missing
          }
        }

        setCurrentScore((score) => score + scoreIncrement); // Add points earned for this attempt to the total score

        // Display temporary incorrect message and points earned
        const incorrectMsgPrefix = t('incorrect_prefix') || 'Incorrect! It\'s ';
        const pointsMsg = Math.round(scoreIncrement) > 0 ? ` (+${scoreIncrement.toFixed(1)} pts)` : ' (+0 pts)';
        callback.setHeaderText(incorrectMsgPrefix + clickedRegionName + '!' + pointsMsg);
        callback.setHeaderTextMode("failure"); // Indicate incorrect guess visually

        setForceDisplayUpdate((u)=>u+1); // Update display immediately after incorrect guess

        // Automatically move to the next target after a short delay
        setTimeout(() => {
          selectNewTarget();
        }, 100); // Adjust delay as needed

      } else if (gameMode === 'streak') {
        // Streak ends on incorrect guess
        setFinalStreak(currentStreakRef.current); // Store the final streak before resetting
        setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
        // The streak label will be updated by updateGameDisplay called below

        // Display Streak End Overlay instead of redirecting
        setShowStreakOverlay(true);

        callback.setHeaderTextMode("failure"); // Indicate streak ended visually

        // Stop the game
        setIsGameRunning(false);

        // Do not call selectNewTarget or redirect automatically here
      }

      selectedVoxel.current = null;
      if (guessButtonRef.current) guessButtonRef.current.disabled = true;

      // Only update game display for score/error/streak *after* the incorrect message timeout in practice mode
      if (gameMode !== 'practice') {
        setForceDisplayUpdate((u)=>u+1);
      }
    }

    if(isEndgame){
      if(gameMode === 'time-attack'){
        if(!isLoggedIn){
          const remaining = Math.floor(((startTime.current || Date.now()) + MAX_TIME_IN_SECONDS * 1000 - Date.now()) / 1000);
          givenFinalScore = Math.round(currentScoreRef.current + (remaining > 0 ? remaining * BONUS_POINTS_PER_SECOND : 0))
        }
        endTimeAttack(givenFinalScore)
      } else if (gameMode === 'streak') {
        setFinalStreak(currentStreakRef.current); // Store the final streak before resetting
        setCurrentStreak(0); // Reset streak on incorrect guess in streak mode
        setShowStreakOverlay(true);
        return;
      }
    }
  }


  function highlightRegionFluorescentYellow() {
    if (gameMode === 'navigation' && highlightedRegion === 0) return;
    console.log('highlightRegionFluorescentYellow called with regionId:', highlightedRegion);
    if (cLut.current && niivue.current && highlightedRegion && highlightedRegion * 4 < cLut.current.length) {
      const lut = cLut.current.slice();
      // Make all regions transparent initially except region 0 if needed
      for (let i = 0; i < lut.length / 4; i++) {
        if (i !== 0 || (askedAtlas === 'aal' || askedAtlas === 'glasser' || askedAtlas === 'destrieux' || askedAtlas === 'schaefer')) {
          lut[i * 4 + 3] = 0; // Make transparent
        }
      }
      // Highlight the specific region in yellow
      lut[highlightedRegion * 4 + 0] = 255; // R
      lut[highlightedRegion * 4 + 1] = 255; // G
      lut[highlightedRegion * 4 + 2] = 0;   // B (Yellow)
      lut[highlightedRegion * 4 + 3] = 255; // A (Fully Opaque)

      if (niivue.current.volumes[1].colormapLabel) niivue.current.volumes[1].colormapLabel.lut = new Uint8ClampedArray(lut);
      niivue.current.updateGLVolume();
      niivue.current.drawScene();
    } else {
      console.error('Cannot highlight region:', {
        clut: !!cLut.current,
        nv1: !!niivue.current,
        highlightedRegion,
        lutLength: cLut.current?.length
      });
    }
  }

  const handleRecolorization = () => {
    if (isGameRunning && gameMode === 'navigation') {
      if (cLut.current && niivue.current && niivue.current.volumes.length > 1 && niivue.current.volumes[1].colormapLabel) {
        niivue.current.volumes[1].colormapLabel.lut = cLut.current;
        niivue.current.updateGLVolume();
        niivue.current.drawScene();
      }
      callback.setHeaderText(t('click_to_identify'));
      selectedVoxel.current = null;
      setHighlightedRegion(null);
      if (tooltip) {
        setTooltip({ ...tooltip, visible: false });
      }
      niivue.current.opts.crosshairColor = [1, 1, 1, 1]; // Restore crosshair color
      niivue.current.drawScene();
    }
  }

  const updateGameDisplay = () => {
    // Update labels based on mode
    if (gameMode === 'time-attack') {
      callback.setHeaderScore(t('score_label') + `: ${Math.round(currentScore)}`); // Display rounded score for Time Attack
    } else if (gameMode === 'streak' || gameMode === 'practice') {
      callback.setHeaderScore(t('correct_label') + `: ${currentCorrects}`); // Display correct count for other modes
    }

    if (gameMode === 'time-attack' || gameMode === 'streak' || gameMode === 'practice') {
      callback.setHeaderErrors(`${currentErrors}`);
    }
    if (gameMode === 'streak') {
      callback.setHeaderStreak(`${currentStreak}`);
    }

    if (gameMode === 'navigation') {
      callback.setHeaderText(highlightedRegion
        ? cMap.current?.labels?.[highlightedRegion] || t('no_region_selected')
        : t('click_to_identify'));
    } else if (currentTarget.current !== null && cMap.current && cMap.current.labels && cMap.current.labels[currentTarget.current]) {
      // Use 'find' translation key directly
      const prefix = t('find') || 'Find: ';
      // For time attack, display the current question number
      if (gameMode === 'time-attack') {
        callback.setHeaderText(`${currentAttempts}/${TOTAL_REGIONS_TIME_ATTACK} - ${prefix}${cMap.current.labels[currentTarget.current]}`);
      } else {
        callback.setHeaderText(prefix + cMap.current.labels[currentTarget.current]);
      }
      console.log(`Displaying target: ${cMap.current.labels[currentTarget.current]} (ID: ${currentTarget.current})`);
    } else {
      // Use 'find' translation key directly
      callback.setHeaderText(t('find') + t('unknown_region')); // Use translated "Find:" and "Unknown"
      console.error(`No label for currentTarget ${currentTarget}`, cMap.current?.labels);
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isGameRunning || !canvasRef.current || !niivue.current || gameMode !== 'navigation' || highlightedRegion !== null){
      setTooltip({ ...tooltip, visible: false });
      return;
    } 
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.pageX;
    const y = e.clientY - rect.top;
    const pos = niivue.current.getNoPaddingNoBorderCanvasRelativeMousePosition(e as unknown as MouseEvent, niivue.current.gl.canvas);

    // Check if mouse is within canvas bounds
    if (x >= 0 && x < rect.width && y >= 0 && y < rect.height && pos && cMap.current && cMap.current.labels && niivue.current.uiData && niivue.current.uiData.dpr) {
      const frac = niivue.current.canvasPos2frac([pos.x * niivue.current.uiData.dpr, pos.y * niivue.current.uiData.dpr]);
      if (frac[0] >= 0) {
        const mm = niivue.current.frac2mm(frac);
        const vox = niivue.current.volumes[1].mm2vox(Array.from(mm));
        const idx = Math.round(niivue.current.volumes[1].getValue(vox[0], vox[1], vox[2]));
        if (isFinite(idx) && idx > 0 && idx in cMap.current.labels) { // Ensure valid region ID > 0
          setTooltip({visible: true, text: cMap.current.labels[idx] || t('unknown_region'),
             x:x+10, y: y+10});
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
    const handleClick = (event: MouseEvent) => {
      if (
        showHelpOverlay &&
        helpContentRef.current &&
        helpButtonRef.current &&
        !helpButtonRef.current.contains(event.target as Node) &&
        !helpContentRef.current.contains(event.target as Node)
      ) {
        setShowHelpOverlay(false);
      }
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
  }, [showHelpOverlay])

  const defineNiiOptions = () => {
    if (niivue.current) {
      if (viewerOptions.displayType === "Axial") niivue.current.setSliceType(niivue.current.sliceTypeAxial);
      if (viewerOptions.displayType === "Coronal") niivue.current.setSliceType(niivue.current.sliceTypeCoronal);
      if (viewerOptions.displayType === "Sagittal") niivue.current.setSliceType(niivue.current.sliceTypeSagittal);
      if (viewerOptions.displayType === "Render") {
        niivue.current.setSliceType(niivue.current.sliceTypeRender);
        niivue.current.setClipPlane(niivue.current.meshes.length > 0 ? [-0.1, 270, 0] : [2, 270, 0]);
      }
      if (viewerOptions.displayType === "MultiPlanar") {
        niivue.current.opts.multiplanarShowRender = SHOW_RENDER.NEVER;
        niivue.current.setSliceType(niivue.current.sliceTypeMultiplanar);
      }
      if (viewerOptions.displayType === "MultiPlanarRender") {
        niivue.current.opts.multiplanarShowRender = SHOW_RENDER.ALWAYS;
        niivue.current.setSliceType(niivue.current.sliceTypeMultiplanar);
      }
      if (niivue.current.volumes.length > 1) {
        niivue.current.setOpacity(1, viewerOptions.displayAtlas ? viewerOptions.displayOpacity : 0);
      }
      niivue.current.opts.isRadiologicalConvention = viewerOptions.radiologicalOrientation;
      niivue.current.updateGLVolume();
    }
  }

  useEffect(() => {
    defineNiiOptions()
  }, [viewerOptions])

  return (
    <div className="page-container">
      {tooltip.visible && <div className="region-tooltip" style={{ position: "absolute", left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}

      {isLoading && <div className="loading-screen"></div>}
      <canvas id="gl1" onClick={handleCanvasInteraction} onTouchStart={handleCanvasInteraction}
        onMouseMove={handleCanvasMouseMove} onMouseLeave={handleCanvasMouseMove} ref={canvasRef}></canvas>
      <div className="button-container">
        <button className="return-button" onClick={() => callback.gotoPage("welcome")}>{t("return_button")}</button>
        {gameMode == "navigation" && <button className="return-button" onClick={handleRecolorization}>{t("restore_color")}</button>}
        {gameMode != "navigation" && <button className="guess-button" ref={guessButtonRef} onClick={validateGuess}>
          <span className="confirm-text">{t("confirm_guess")}</span>
          <span className="space-text">{t("space_key")}</span></button>}
      </div>

      {showHelpOverlay && <div id="help-overlay" className="help-overlay">
        <div className="help-content" ref={helpContentRef}>
          <button id="close-help" className="close-button" onClick={() => setShowHelpOverlay(false)}>&times;</button>
          <h2>{t("viewer_help_title")}</h2>
          <div id="help-mode-description"
            dangerouslySetInnerHTML={{
              __html: (() => {
                switch (gameMode) {
                  case 'navigation':
                    return t('viewer_help_navigation');
                  case 'practice':
                    return t('viewer_help_practice');
                  case 'streak':
                    return t('viewer_help_streak');
                  case 'time-attack':
                    return t('viewer_help_time_attack');
                  default:
                    return t('viewer_help_general');
                }
              })()
            }}>
          </div>
          <section>
            <h3>{t("viewer_controls_title")}</h3>
            <p>{t("viewer_controls_text")}</p>
          </section>
        </div>
      </div>}

      <div ref={helpButtonRef}>
        <button id="help-button" className="help-button" onClick={() => setShowHelpOverlay(true)}>
          <i className="fas fa-question"></i>
        </button>
      </div>


      {showStreakOverlay && <div id="streak-end-overlay" className="streak-overlay">
        <div className="overlay-content" ref={streakOverlayRef}>
          <h2>{t("streak_ended_title")}</h2>
          <p><span>{t("streak_ended_score")}</span><span id="final-streak" className="streak-number">{finalStreak}</span></p>
          <div className="overlay-buttons">
            <button id="go-back-menu-button-streak" className="home-button" onClick={() => callback.gotoPage("welcome")}>
              <i className="fas fa-home"></i>
            </button>
            <button id="restart-button-streak" className="restart-button" onClick={() => { setShowStreakOverlay(false); startGame() }}>
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
          <div className="score-progress-bar w3-light-grey w3-round">
            <div id="time-attack-score-bar" className="w3-container w3-round w3-blue"
              style={{ width: (finalScore / 1000) * 100 + "%" }}>{finalScore}</div>
            <span className="progress-label progress-label-med">{Math.round(MAX_POINTS_TIMEATTACK * 0.5)}</span>
            <span className="progress-label progress-label-max">{Math.round(MAX_POINTS_TIMEATTACK * 1)}</span>
          </div>
          <div className="overlay-buttons">
            <button id="go-back-menu-button-time-attack" className="home-button" onClick={() => callback.gotoPage("welcome")}>
              <i className="fas fa-home"></i>
            </button>
            <button id="restart-button-time-attack" className="restart-button" onClick={() => { setShowTimeattackOverlay(false); startGame() }}>
              <i className="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
      </div>}

    </div>
  )
}

export default GameScreen
