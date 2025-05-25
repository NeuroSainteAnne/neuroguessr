import type { TFunction } from 'i18next';
import './GameScreen.css'
import './Help.css'
import { useEffect, useRef, useState } from 'react';
import { Niivue, SHOW_RENDER, type NVImage } from '@niivue/niivue';
import atlasFiles from './atlas_files';
import { fetchJSON } from './helper_niivue';

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
};

function GameScreen({ t, callback, currentLanguage, atlasRegions, askedAtlas, gameMode,
  preloadedAtlas, preloadedBackgroundMNI, viewerOptions, loadEnforcer, isLoggedIn }: GameScreenProps) {
  // Time Attack specific constants
  const TOTAL_REGIONS_TIME_ATTACK = 20;
  const MAX_POINTS_PER_REGION = 50; // 1000 total points / 20 regions
  const MAX_PENALTY_DISTANCE = 100; // Arbitrary distance in mm for max penalty (0 points)

  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGameRunning, setIsGameRunning] = useState<boolean>(false);
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [currentCorrects, setCurrentCorrects] = useState<number>(0);
  const [currentErrors, setCurrentErrors] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>("00:00");
  const [currentAttempts, setCurrentAttempts] = useState<number>(0);
  const currentTarget = useRef<number | null>(null);
  const selectedVoxel = useRef<number[] | null>(null);
  const validRegions = useRef<number[]>([]);
  const usedRegions = useRef<number[]>([]);
  const [highlightedRegion, setHighlightedRegion] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const cMap = useRef<ColorMap | null>(null);
  const cLut = useRef<Uint8Array | null>(null);
  const niivue = useRef(new Niivue({
    show3Dcrosshair: true,
    backColor: [0, 0, 0, 1],
    crosshairColor: [1, 1, 1, 1]
  }));
  const startTime = useRef<number | null>(null);
  const timerInterval = useRef<number | null>(null);
  const sessionToken = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const [showHelpOverlay, setShowHelpOverlay] = useState<boolean>(false);
  const helpContentRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLDivElement>(null);
  const [showStreakOverlay, setShowStreakOverlay] = useState<boolean>(false);
  const [showTimeattackOverlay, setTimeattackOverlay] = useState<boolean>(false);

  useEffect(() => {
    initNiivue()
    checkLoading();
  }, [])


  const initNiivue = () => {
    niivue.current.attachTo('gl1').then(() => {
      setIsLoadedNiivue(true);
      niivue.current.setInterpolation(true);
      niivue.current.opts.crosshairGap = 0;
      niivue.current.opts.multiplanarShowRender = SHOW_RENDER.ALWAYS;
      niivue.current.setSliceType(niivue.current.sliceTypeMultiplanar);
      niivue.current.opts.dragMode = niivue.current.dragModes.slicer3D;
      niivue.current.opts.yoke3Dto2DZoom = true;
      niivue.current.opts.isRadiologicalConvention = viewerOptions.radiologicalOrientation;
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
  const loadAtlasData = async () => {
    try {
      if (!askedAtlas) return
      const selectedAtlasFiles = atlasFiles[askedAtlas];
      cMap.current = await fetchJSON("assets/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
      if (niivue.current && niivue.current.volumes.length > 1 && cMap.current) {
        niivue.current.volumes[1].setColormapLabel(cMap.current);
        const numRegions = Object.keys(cMap.current.labels || []).length;
        console.log(`num regions : ${numRegions}`)
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

        if (niivue.current.volumes[1].colormapLabel) niivue.current.volumes[1].colormapLabel.lut = new Uint8ClampedArray(cLut.current.slice());
        niivue.current.setOpacity(1, 0.6);
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
          console.error(`No valid regions found in ${selectedAtlasFiles.name} data.`);
          console.log(`cmap.labels keys:`, Object.keys(cMap.current.labels || []));
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

  const startGame = () => {
    setIsGameRunning(true);
    setCurrentScore(0);
    setCurrentCorrects(0);
    setCurrentErrors(0);
    setCurrentStreak(0);
    setCurrentAttempts(0);
    usedRegions.current = [];

    if (isLoggedIn) {
      console.log("is logged in, starting session"); // TODO
    } else {
      if (gameMode !== "navigation") callback.setHeaderScore(t('correct_label') + ": 0");
    }

    // Start the first round
    selectNewTarget();
    updateGameDisplay();
  }

  const selectNewTarget = () => {
    if (isLoggedIn) {
      // TODO
    } else {
      if (gameMode === 'time-attack' && usedRegions.current && usedRegions.current.length >= TOTAL_REGIONS_TIME_ATTACK) {
        //endTimeAttack(); // Call endTimeAttack to show the window
        return;
      } else if (validRegions.current && validRegions.current.length === 0) {
        console.warn('No valid regions available for target selection');
        //resetGameState();
        return;
      } else if (validRegions.current && usedRegions.current) {
        let availableRegions = validRegions.current.filter(r => !usedRegions.current.includes(r));
        if (availableRegions.length === 0) {
          // This case should ideally not be reached if validRegions had enough regions initially
          console.warn('No available regions for target selection in the remaining set.');
          // As a fallback, you could end the game here if somehow it didn't end after 20
          if (gameMode === 'time-attack') {
            //endTimeAttack();
            return;
          } else {
            // If no more regions in Practice/Streak, end the game
            //resetGameState(); // Or handle as an error in other modes
            return;
          }
        }
        currentTarget.current = availableRegions[Math.floor(Math.random() * availableRegions.length)];
      }
    }
    if (currentTarget.current) {
      if (gameMode === 'time-attack' || gameMode === 'streak') { // Add streak mode here to track used regions
        usedRegions.current.push(currentTarget.current);
      }
      updateGameDisplay(); // Update display with the new target label
      selectedVoxel.current = null; // Reset selected voxel
      setCurrentAttempts(0); // Reset attempts in practice mode
      if (cLut.current && niivue.current) {
        if (niivue.current.volumes[1].colormapLabel) niivue.current.volumes[1].colormapLabel.lut = new Uint8ClampedArray(cLut.current.slice());
        niivue.current.updateGLVolume();
        niivue.current.drawScene(); // Redraw scene to ensure color reset is visible
      }
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
        callback.setHeaderText(`${usedRegions.current.length}/${TOTAL_REGIONS_TIME_ATTACK} - ${prefix}${cMap.current.labels[currentTarget.current]}`);
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
    };
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [showHelpOverlay])

  useEffect(() => {
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
  }, [viewerOptions])

  return (
    <div className="page-container">
      {isLoading && <div className="loading-screen"></div>}
      <canvas id="gl1"></canvas>
      <div className="button-container">
        <button className="return-button">{t("return_button")}</button>
        {gameMode == "navigation" && <button className="return-button">{t("restore_color")}</button>}
        {gameMode != "navigation" && <button className="guess-button" disabled>
          <span className="confirm-text">{t("confirm_guess")}</span>
          <span className="space-text">{t("space_key")}</span></button>}
      </div>

      {showHelpOverlay && <div id="help-overlay" className="help-overlay">
        <div className="help-content" ref={helpContentRef}>
          <button id="close-help" className="close-button" onClick={() => setShowHelpOverlay(false)}>&times;</button>
          <h2>{t("viewer_help_title")}</h2>
          <div id="help-mode-description"
            dangerouslySetInnerHTML={{__html:(() => {
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
            })()}}>
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
        <div className="overlay-content">
          <h2>{t("streak_ended_title")}</h2>
          <p><span>{t("streak_ended_score")}</span><span id="final-streak" className="streak-number">{currentStreak}</span></p>
          <div className="overlay-buttons">
            <button id="go-back-menu-button-streak" className="home-button">
              <i className="fas fa-home"></i>
            </button>
            <button id="restart-button-streak" className="restart-button">
              <i className="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
      </div>}

      { showTimeattackOverlay && <div id="time-attack-end-overlay" className="time-attack-overlay">
        <div className="overlay-content">
          <h2>{t("time_attack_ended_title")}</h2>
          <p><span>{t("time_attack_ended_time")}</span>
            <span id="final-time-attack-time">{currentTime}</span></p>
          <p><span>{t("time_attack_ended_score")}</span></p>
          <div className="score-progress-bar w3-light-grey w3-round">
            <div id="time-attack-score-bar" className="w3-container w3-round w3-blue" style={{ width: "0%" }}></div>
            <span className="progress-label progress-label-750">750</span>
            <span className="progress-label progress-label-1000">1000</span>
          </div>
          <div className="overlay-buttons">
            <button id="go-back-menu-button-time-attack" className="home-button">
              <i className="fas fa-home"></i>
            </button>
            <button id="restart-button-time-attack" className="restart-button">
              <i className="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
      </div>}

    </div>
  )
}

export default GameScreen
