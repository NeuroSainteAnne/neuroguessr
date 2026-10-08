import { createContext, RefObject, useContext, useEffect, useRef, useState } from "react";
import { ColorMap, PastRegion } from "../types/types";
import { Niivue, DRAG_MODE } from "@niivue/niivue";
import RegionHistory from "./RegionHistory";
import { AtlasImageProxy, initNiivue, loadAtlasNii, fetchJSON, defineNiiOptions } from "../utils/helper_nii";
import { useApp } from '../context/AppContext';
import atlasFiles from "../utils/atlas_files";
import { navigate } from "vike/client/router";
import { loadNIfTIFromCache } from "../utils/nifti_cache";
import "./BrainViewer.css"
import { consoleLog } from "../utils/logging";
import OptionsDropdown from "./OptionsDropdown";

export const BrainViewer = ({ alternateContent, sessionName, sessionDate }: { alternateContent?: React.ReactNode, sessionName?: string | undefined, sessionDate?: string | undefined }) => {
    const { highlightWrapper, niivue, handleMouseDown, handleMouseMove,
        handleMouseUp, handleTouchStart, handleTouchEnd, handleTouchMove,
        handleCanvasMouseMove, canvasRef, guessButtonRef, scrollBarRef, scrollThumbRef,
        handleScrollStart, handleScrollMove, handleScrollEnd,
        mobileOrientation, setMobileOrientation,
        isLoading, hasEnded, highlightedRegion, handleRecolorization,
        validateGuessHandler, startGameHandler, gameMode, pastRegions, isConnected, isGameRunning,
        isRegionLocked, setIsRegionLocked
    } = useGame();
    const { t, isMobileView } = useApp();
    const optionsOverlayRef = useRef<HTMLDivElement>(null);
    const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false);

    // Block niivue's native canvas listeners when clicking inside the options overlay
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const blockIfOverOptions = (e: MouseEvent) => {
            if (optionsOverlayRef.current && optionsOverlayRef.current.contains(e.target as Node)) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        canvas.addEventListener('mousedown', blockIfOverOptions, true);
        canvas.addEventListener('mouseup', blockIfOverOptions, true);
        canvas.addEventListener('click', blockIfOverOptions, true);
        return () => {
            canvas.removeEventListener('mousedown', blockIfOverOptions, true);
            canvas.removeEventListener('mouseup', blockIfOverOptions, true);
            canvas.removeEventListener('click', blockIfOverOptions, true);
        };
    }, [canvasRef]);

    // Non-passive touchmove on mobile scroll bar to allow preventDefault
    useEffect(() => {
        if (!isMobileView) return;
        const scrollBar = scrollBarRef.current;
        if (!scrollBar) return;
        const prevent = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
        scrollBar.addEventListener('touchmove', prevent, { passive: false });
        return () => scrollBar.removeEventListener('touchmove', prevent);
    }, [isMobileView, scrollBarRef, isLoading]);

    // Ctrl/Cmd + scroll = zoom in navigation mode
    useEffect(() => {
        if (gameMode !== 'navigation' || !niivue) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handleZoomWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
            const currentZoom = niivue.scene.pan2Dxyzmm[3] || 1;
            const newZoom = Math.max(0.3, Math.min(8, currentZoom * zoomDelta));
            niivue.scene.pan2Dxyzmm[3] = newZoom;
            niivue.drawScene();
        };
        canvas.addEventListener('wheel', handleZoomWheel, { capture: true, passive: false });
        return () => canvas.removeEventListener('wheel', handleZoomWheel, true);
    }, [gameMode, niivue, canvasRef]);

    const containerClassName = hasEnded && (gameMode == "time-attack" || gameMode == "streak" || gameMode == "multiplayer")
        ? `canvas-and-scroll-container review-mode${sidebarExpanded ? ' sidebar-expanded' : ' sidebar-normal'}`
        : 'canvas-and-scroll-container';

    const canvasContainerClassName = isMobileView && !hasEnded ? 'canvas-container game-info-mobile' : 'canvas-container';

    return (
        <>
            <div className={containerClassName}>
                    {hasEnded && (gameMode == "time-attack" || gameMode == "streak" || gameMode == "multiplayer") && <RegionHistory pastRegions={pastRegions} niivue={niivue}
                        highlightPastRegion={highlightWrapper} sessionName={sessionName} sessionDate={sessionDate} onToggleSidebar={setSidebarExpanded} sidebarExpanded={sidebarExpanded} />}
                    <div className={canvasContainerClassName} style={{display:((gameMode !== "multiplayer" || (isGameRunning && isConnected) || hasEnded)?"block":"none")}}>
                        <canvas id="gl1"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                            onMouseLeave={handleCanvasMouseMove} ref={canvasRef}></canvas>
                    </div>
                    {!isMobileView && <div className="canvas-options-overlay" ref={optionsOverlayRef}><OptionsDropdown /></div>}
                    {/* Show alternate content when canvas is hidden in multiplayer mode */}
                    {gameMode === "multiplayer" && alternateContent && !hasEnded && (
                        <div className="alternate-content-container">
                            {alternateContent}
                        </div>
                    )}
                    {!isLoading && <div className="button-container">
                        {(gameMode !== "multiplayer" || hasEnded) && !isMobileView && <button
                            data-umami-event="go back button" data-umami-event-gobacksource={gameMode}
                            className="home-button" onClick={() => { navigate("/welcome") }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                            {t("home_button")}
                        </button>}
                        {gameMode === 'navigation' && <button className="return-button" disabled={highlightedRegion === null}
                            data-umami-event="recolorize button"
                            onClick={handleRecolorization}>{isMobileView?t("restore_color_no_esc"):t("restore_color")}</button>}
                        {gameMode === 'navigation' && highlightedRegion !== null && (
                            <button
                                className={`lock-button${isRegionLocked ? ' locked' : ''}`}
                                onClick={() => setIsRegionLocked(l => !l)}
                                title={isRegionLocked ? (t("unlock_region") || "Unlock region") : (t("lock_region") || "Lock region")}
                            >
                                {isRegionLocked
                                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1C9.24 1 7 3.24 7 6v1H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2h-1V6c0-2.76-2.24-5-5-5zm0 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm4-8H8V6c0-2.21 1.79-4 4-4s4 1.79 4 4v2z"/><path d="M8 7h8v1H8z" opacity=".3"/></svg>
                                }
                                {isRegionLocked ? (t("unlock_region") || "Unlock") : (t("lock_region") || "Lock")}
                            </button>
                        )}
                        {((gameMode === "multiplayer" && isGameRunning && isConnected) || (gameMode !== 'navigation')) && !hasEnded && <button className="guess-button" ref={guessButtonRef}
                            data-umami-event="guess button" data-umami-event-guesssource={gameMode}
                            onClick={validateGuessHandler}>
                            <span className="confirm-text">{t("confirm_guess")}</span>
                            {!isMobileView && <span className="space-text">{t("space_key")}</span>}</button>}
                        {hasEnded && gameMode !== "multiplayer" &&
                            <button className="restart-button"
                                data-umami-event="restart button" data-umami-event-gobacksource={gameMode}
                                onClick={() => { startGameHandler() }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                    <path d="M3 3v5h5"/>
                                </svg>
                                {t("restart_button")}
                            </button>}
                    </div>}
                {isMobileView && !isLoading && (
                    <div className="mobile-controls">
                        {/* Custom scroll bar */}
                        <div
                            className="mobile-scroll-bar"
                            ref={scrollBarRef}
                            onMouseDown={handleScrollStart}
                            onTouchStart={handleScrollStart}
                            onMouseMove={handleScrollMove}
                            onTouchMove={handleScrollMove}
                            onMouseUp={handleScrollEnd}
                            onTouchEnd={handleScrollEnd}
                            onMouseLeave={handleScrollEnd}
                        >
                            <div
                                className="mobile-scroll-thumb"
                                ref={scrollThumbRef}
                            />
                        </div>
                        <div className="orientation-buttons">
                            <button
                                className={`orientation-button ${mobileOrientation === "axial" ? "active" : ""}`}
                                onClick={() => setMobileOrientation("axial")}
                            >
                                Axial
                            </button>
                            <button
                                className={`orientation-button ${mobileOrientation === "sagittal" ? "active" : ""}`}
                                onClick={() => setMobileOrientation("sagittal")}
                            >
                                Sagittal
                            </button>
                            <button
                                className={`orientation-button ${mobileOrientation === "coronal" ? "active" : ""}`}
                                onClick={() => setMobileOrientation("coronal")}
                            >
                                Coronal
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}


export function GameProvider({
    children, gameMode, blindMode = false, routedAtlas, routedRegion,
    cleanGameCallbackRef, startGameCallbackRef, resetGameCallbackRef, validateGuessCallbackRef, genericKeyPressCallbackRef, canvasInteractionRef,
    tooltip, setTooltip,
}:
    {
        children: React.ReactNode, gameMode: string, blindMode: boolean, 
        routedAtlas?: string | undefined, routedRegion?: number | undefined
        cleanGameCallbackRef: React.RefObject<() => void>,
        startGameCallbackRef: React.RefObject<() => void>,
        resetGameCallbackRef: React.RefObject<() => void>,
        validateGuessCallbackRef: React.RefObject<() => void>,
        genericKeyPressCallbackRef: React.RefObject<(e: KeyboardEvent) => void>,
        canvasInteractionRef: React.RefObject<(e: { mm: number[]; vox: number[]; idx: number | undefined; } | undefined) => void>,
        tooltip?: { visible: boolean; text: string; x: number; y: number; }
        setTooltip?: React.Dispatch<React.SetStateAction<{ visible: boolean; text: string; x: number; y: number; }>>
    }) {
    const { t, currentLanguage, askedAtlas, askedRegion,
        preloadedBackgroundMNI, viewerOptions,
        isMobileView, setIsMobileView,
        setAskedAtlas, setAskedRegion,
        showNotification, addHeaderMessage } = useApp();

    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [hasEnded, setHasEnded] = useState<boolean>(false);
    const [isGameRunning, setIsGameRunning] = useState<boolean>(false);
    const hasEndedRef = useRef<boolean>(false); // Added ref to track ending state synchronously
    const [selectedRegion, setSelectedRegion] = useState<any>(null);
    const [isConnected, setIsConnected] = useState(false);
    const atlasRef = useRef<AtlasImageProxy | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const currentlyLoadedAtlas = useRef<any>(null);
    const [highlightedRegion, setHighlightedRegion] = useState<number | null>(gameMode === "navigation" ? routedRegion || null : null);
    const [isRegionLocked, setIsRegionLocked] = useState<boolean>(false);
    const [pastRegions, setPastRegions] = useState<PastRegion[]>([]);
    const guessButtonRef = useRef<HTMLButtonElement>(null);
    const selectedVoxelProp = useRef<{ mm: number[], vox: number[], idx: number | undefined } | null>(null);
    const currentTarget = useRef<number | undefined>(gameMode === "navigation" ? routedRegion : undefined);

    // dragging states
    const lastTouchEvent = useRef<React.Touch | undefined>(undefined);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
    const [lastSlicePosition, setLastSlicePosition] = useState<number>(0);
    const [currentAxis, setCurrentAxis] = useState<number>(2)
    const dragSensitivity = 0.01;

    // mobile view specific states
    const [mobileOrientation, setMobileOrientation] = useState<string>("axial"); // "axial", "sagittal", "coronal"
    const mobileOrientationRef = useRef<string>("axial"); // "axial", "sagittal", "coronal"
    const scrollBarRef = useRef<HTMLDivElement>(null);
    const scrollThumbRef = useRef<HTMLDivElement>(null);
    const isScrolling = useRef<boolean>(false);
    const lastScrollPosition = useRef<number>(0);

    const [niivue, setNiivue] = useState<Niivue | null>(null);
    const niivueRef = useRef<Niivue | null>(null)

    useEffect(() => {
        if (!niivue) {
            if (routedAtlas) setAskedAtlas({atlas:routedAtlas, blindMode:blindMode});
            if (routedRegion) setAskedRegion(routedRegion);
            consoleLog("normal", "Creating Niivue...");
            consoleLog("verbose", `Initializing NiiVue with atlas: ${routedAtlas}, region: ${routedRegion}, blindMode: ${blindMode}`);
            const isMobile = window.innerWidth <= 768; // Adjust breakpoint as needed
            setIsMobileView(isMobile);
            const niivueInstance = new Niivue({
                logLevel: "error",
                show3Dcrosshair: true,
                dragMode: DRAG_MODE.none,
                backColor: [0, 0, 0, 1],
                crosshairColor: [1, 1, 1, 1],
                doubleTouchTimeout: 0, // Disable double touch to avoid conflicts
                multiplanarForceRender: !isMobile,
            });
            if (isMobile) niivueInstance.setSliceType(mobileOrientation === "axial"
                ? niivueInstance.sliceTypeAxial
                : mobileOrientation === "sagittal"
                    ? niivueInstance.sliceTypeSagittal
                    : niivueInstance.sliceTypeCoronal);
            setNiivue(niivueInstance);
            niivueRef.current = niivueInstance;
            if (isMobileView) {
                setTimeout(() => configureMobileView(), 0);
            }
        }
        return () => {
            const niivueInstance = niivue;
            setAskedRegion(null)
            setAskedAtlas(undefined)
            cleanGameCallbackRef.current()
            // Clean up Niivue properly
            if (niivueInstance) {
                // Remove all volumes
                while (niivueInstance.volumes.length > 0) {
                    if(niivueInstance.volumes[0]) niivueInstance.removeVolume(niivueInstance.volumes[0]);
                    else break;
                }
                // Remove all meshes
                while (niivueInstance.meshes.length > 0) {
                    if(niivueInstance.meshes[0]) niivueInstance.removeMesh(niivueInstance.meshes[0]);
                    else break
                }
                // Destroy WebGL context if needed
                try {
                    if (niivueInstance.gl) {
                        const loseContext = niivueInstance.gl.getExtension('WEBGL_lose_context');
                        if (loseContext) loseContext.loseContext();
                    }
                } catch (error) {
                    //
                }
                // Force garbage collection hints
                niivueInstance.drawScene = () => { }; // Neutralize any pending animation frames
                niivueInstance.volumes = [];
                niivueInstance.meshes = [];
            }
            // Clear the canvas
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            atlasRef.current = null;
            selectedVoxelProp.current = null;
            currentTarget.current = undefined;
            setNiivue(null);
            niivueRef.current = null
            setIsLoading(true);
        };
    }, []);

    useEffect(() => {
        const checkMobile = () => {
            const isMobile = window.innerWidth <= 768; // Adjust breakpoint as needed
            setIsMobileView(isMobile);
            // If switching to mobile view, ensure NiiVue is configured properly
            if (!niivue) return;
            if (isMobile) {
                configureMobileView();
            } else {
                defineNiiOptions(niivue, atlasRef.current || undefined, viewerOptions);
            }
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [niivue]);

    useEffect(() => {
        if (isMobileView && niivue && !isLoading) {
            updateScrollThumbFromNiivue();
        }
    }, [niivue, isMobileView, isLoading]);

    useEffect(() => { // orientation change handler
        mobileOrientationRef.current = mobileOrientation;
    }, [mobileOrientation]);

    useEffect(() => { // orientation change handler
        if (isMobileView && niivue) {
            configureMobileView();
            // The configureMobileView function now calls updateScrollThumbFromNiivue
        }
    }, [mobileOrientation, isMobileView, niivue]);

    const configureMobileView = () => {
        if (!niivue) return;
        consoleLog("verbose", `Configuring mobile view orientation: ${mobileOrientationRef.current}`);
        // Save current position
        // Configure for single view based on orientation
        niivue.opts.sliceType = mobileOrientationRef.current === "axial"
            ? niivue.sliceTypeAxial
            : mobileOrientationRef.current === "sagittal"
                ? niivue.sliceTypeSagittal
                : niivue.sliceTypeCoronal;
        // Show only one slice
        niivue.opts.multiplanarForceRender = false;

        // Set layout to single view
        niivue.setSliceType(niivue.opts.sliceType);

        // Set to radiological convention
        niivue.opts.isRadiologicalConvention = true;

        // Restore position
        niivue.drawScene();
        setTimeout(() => updateScrollThumbFromNiivue(), 0);
    };

    useEffect(() => {
        if (isMobileView && niivue) {
            configureMobileView();
        }
    }, [mobileOrientation, isMobileView, niivue]);

    const loadInProgressRef = useRef(false);
    useEffect(() => {
        let cancelled = false;

        const doSequentialLoad = async () => {
            // Guard: don't run if already loading
            if (loadInProgressRef.current) return;
            loadInProgressRef.current = true;

            const isMobile = window.innerWidth <= 768;

            setIsLoading(true);
            
            // 1. Wait for Niivue to be ready
            if (!niivue || !canvasRef.current) {
                loadInProgressRef.current = false;
                return;
            }

            await new Promise<void>((resolve) => {
                initNiivue(niivue, canvasRef.current!, viewerOptions, () => {
                    resolve();
                }, isMobile);
            });

            // 2. Wait for atlas and background to be ready
            if (!preloadedBackgroundMNI || !askedAtlas) {
                loadInProgressRef.current = false;
                return;
            }

            if (currentlyLoadedAtlas.current !== askedAtlas.atlas) {
                consoleLog('verbose', `🗺️ Loading atlas and background MNI ${askedAtlas.atlas}`);
                const atlas = atlasFiles[askedAtlas.atlas];
                if (atlas) {
                    atlasRef.current = null;
                    const niiFile = "/atlas/nii/" + atlas.nii;
                    consoleLog('normal', `🗺️ Loading atlas ${askedAtlas.atlas} from cache...`);
                    const altasNv = await loadNIfTIFromCache(niiFile);
                    if (!cancelled) loadAtlasNii(niivue, preloadedBackgroundMNI, altasNv);
                }
                if (!cancelled) {
                    currentlyLoadedAtlas.current = askedAtlas.atlas;
                    consoleLog("verbose", "Loading atlas regions", askedAtlas.atlas);
                    await loadAtlasData();
                }
            }

            // 4. Start game (or restore colors in replay/ended mode)
            if (!cancelled) {
                if (hasEndedRef.current && atlasRef.current) {
                    atlasRef.current.showShuffledRegions();
                } else {
                    consoleLog("normal", "Starting game...");
                    startGameCallbackRef.current();
                }
                setIsLoading(false);
            }

            // 5. Load specific region (navigation mode)
            if (!cancelled && askedRegion) {
                consoleLog("verbose", "Loading region...", askedRegion);
                setHighlightedRegion(askedRegion);
                highlightWrapper(askedRegion, true, gameMode === 'navigation');
                if (atlasRef.current && atlasRef.current.labels[askedRegion]) {
                    showNotification(atlasRef.current.labels[askedRegion], true, {}, 1500);
                }
            }

            loadInProgressRef.current = false;
        };

        doSequentialLoad();

        return () => {
            cancelled = true;
            loadInProgressRef.current = false;
        };
    }, [niivue, preloadedBackgroundMNI, askedAtlas?.atlas, askedAtlas?.blindMode, askedRegion]); // eslint-disable-line react-hooks/exhaustive-deps

    // Apply viewer options changes (display type, radiological, atlas opacity) without reloading
    useEffect(() => {
        if (niivue && atlasRef.current) {
            defineNiiOptions(niivue, atlasRef.current, viewerOptions);
        }
    }, [viewerOptions]);

    const highlightWrapper = (regionId: number, moveToCenter: boolean, allowFibers: boolean = false) => {
        if (atlasRef.current)
            atlasRef.current.highlightRegion(regionId, moveToCenter, allowFibers);
    }
    const unHighlight = () => {
        atlasRef.current?.showShuffledRegions()
    }
    const loadAtlasData = async () => {
        try {
            if (!askedAtlas) return
            const selectedAtlasFiles = atlasFiles[askedAtlas?.atlas];
            if (!selectedAtlasFiles) return
            const jsonData: ColorMap = await fetchJSON("/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);
            if (niivue && niivue.volumes.length > 1 && jsonData && !atlasRef.current) {
                let cmap_en: ColorMap | null = null;
                if (askedAtlas?.atlas === 'xtract') {
                    if (currentLanguage === 'en') {
                        cmap_en = jsonData; // Already in English
                    } else {
                        cmap_en = await fetchJSON("/atlas/descr/en/" + selectedAtlasFiles.json);
                    }
                } else {
                    cmap_en = jsonData; // Already in English
                }
                atlasRef.current = new AtlasImageProxy({
                    niivue,
                    nvImage: niivue.volumes[1],
                    labels: jsonData.labels,
                    info: jsonData.info ? jsonData.info : undefined,
                    infoDetail: jsonData.info_detail ? jsonData.info_detail : undefined,
                    infoSource: jsonData.info_source ? jsonData.info_source : undefined,
                    centers: jsonData.centers ? jsonData.centers : undefined,
                    blindMode: askedAtlas?.blindMode || false,
                    viewerOptions,
                    cmap_en,
                    atlas: askedAtlas.atlas,
                    proposedLut: askedAtlas?.lut || undefined,
                    proposedMapping: askedAtlas?.mapping || undefined,
                    proposedInverseMapping: askedAtlas?.inverseMapping || undefined,
                });
                atlasRef.current.showShuffledRegions();
                atlasRef.current.performAutocenter();
            }
        } catch (error) {
            console.error(`Failed to load atlas data for ${askedAtlas?.atlas}:`, error);
            addHeaderMessage({ text: t('error_loading_data', { atlas: askedAtlas?.atlas }), color: 'failure' });
        }
    }

    const handleRecolorization = () => {
        if (isGameRunning && gameMode === 'navigation' && niivue) {
            atlasRef.current?.showShuffledRegions()
            addHeaderMessage({ text: t('click_to_identify'), color: 'info' });
            selectedVoxelProp.current = null;
            setHighlightedRegion(null);
            setIsRegionLocked(false);
            unHighlight();
            if (setTooltip && tooltip) setTooltip({ ...tooltip, visible: false });
            niivue.opts.crosshairColor = [1, 1, 1, 1]; // Restore crosshair color
            niivue.drawScene();
        }
    }

    const startGameHandler = () => {
        if (niivue) niivue.opts.doubleTouchTimeout = 500; // Reactivate double touch timeout after loading
        resetGameHandler();
        startGameCallbackRef.current()
    }

    const resetGameHandler = () => {
        setHighlightedRegion(null);
        unHighlight();
        resetGameCallbackRef.current();
        // Reset Niivue view if needed
        if (niivue && atlasRef.current) {
            if (!isMobileView) defineNiiOptions(niivue, atlasRef.current, viewerOptions)
            niivue.drawScene();
        }
    }

    const validateGuessHandler = () => {
        if (!niivue) return
        validateGuessCallbackRef.current();
    }

    const handleSpaceBar = () => {
        consoleLog("verbose", "Space bar pressed, isGameRunning:", isGameRunning);
        if (guessButtonRef.current && !guessButtonRef.current.disabled && isGameRunning && gameMode !== 'navigation') {
            validateGuessHandler();
        }
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.code === 'Space' && gameMode !== "navigation") {
                e.preventDefault();
                handleSpaceBar();
            } else if (e.code === 'Escape' && isGameRunning && gameMode === 'navigation') {
                e.preventDefault();
                handleRecolorization()
            } else {
                genericKeyPressCallbackRef.current(e)
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            // Remove event listener
            document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isGameRunning])

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!niivue) return
        // Right mouse button (button 2) for slice scrolling
        if (e.button === 2) {
            e.preventDefault();
            const pos = niivue.getRelativeMousePosition(e.nativeEvent, e.currentTarget);
            if (pos) {
                const x = pos.x * (niivue.uiData.dpr || 1);
                const y = pos.y * (niivue.uiData.dpr || 1);
                const clickedTileIndex = niivue.tileIndex(x, y);
                consoleLog("verbose", "Mouse wheel at position:", pos, "tile index:", clickedTileIndex);

                // Determine which slice type based on the tile
                let axisToModify = 2; // Default to Z-axis (axial)

                // Check the screenSlices array to determine the slice type for this tile
                if (niivue.screenSlices && niivue.screenSlices[clickedTileIndex]) {
                    const sliceInfo = niivue.screenSlices[clickedTileIndex];

                    switch (sliceInfo.axCorSag) {
                        case niivue.sliceTypeAxial:
                            axisToModify = 2; // Z-axis
                            break;
                        case niivue.sliceTypeCoronal:
                            axisToModify = 1; // Y-axis
                            break;
                        case niivue.sliceTypeSagittal:
                            axisToModify = 0; // X-axis
                            break;
                        default:
                            // For render view or other types, don't scroll
                            return;
                    }
                }

                setCurrentAxis(axisToModify); // Add this state variable
                const slicePos = niivue.scene.crosshairPos[axisToModify];
                if (slicePos !== undefined) setLastSlicePosition(slicePos);
                setIsDragging(true);
                setDragStart({ x: e.clientX, y: e.clientY });
            }
            // Disable context menu during drag
            e.currentTarget.oncontextmenu = (e) => e.preventDefault();
        } else {
            // Handle left-click normally
            handleCanvasInteraction(e);
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!niivue) return
        if (isDragging && dragStart) {
            e.preventDefault();
            // Calculate vertical movement
            const deltaY = e.clientY - dragStart.y;

            // Calculate new slice position based on movement
            const sliceIncrement = deltaY * dragSensitivity;

            // Update crosshair position to change slice
            const currentPos = [...niivue.scene.crosshairPos];
            const newSlicePosition = lastSlicePosition + sliceIncrement;

            // Clamp the value between 0 and 1
            currentPos[currentAxis] = Math.max(0, Math.min(1, newSlicePosition));

            // Set new crosshair position
            niivue.setCrosshairColor([1, 1, 1, 1]);
            niivue.scene.crosshairPos = new Float32Array(currentPos);
            niivue.drawScene();
        } else if (gameMode === 'navigation') {
            // Handle normal mouse move for tooltips in navigation mode
            handleCanvasMouseMove(e);
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 2 && isDragging) {
            e.preventDefault();
            setIsDragging(false);
            setDragStart(null);

            // Re-enable context menu
            e.currentTarget.oncontextmenu = null;
        } else if(gameMode !== 'navigation') {
            handleCanvasInteraction(e);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isGameRunning || !canvasRef.current || !niivue || 
                gameMode !== 'navigation' || highlightedRegion !== null || !niivue.volumes[1]) {
            if (tooltip && setTooltip) setTooltip({ ...tooltip, visible: false });
            return;
        }
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.pageX;
        const y = e.clientY - rect.top;
        const pos = niivue.getNoPaddingNoBorderCanvasRelativeMousePosition(e.nativeEvent, niivue.gl.canvas);

        // Check if mouse is within canvas bounds
        if (x >= 0 && x < rect.width && y >= 0 && y < rect.height && pos && atlasRef.current &&
            atlasRef.current.labels && niivue.uiData && niivue.uiData.dpr) {
            const frac = niivue.canvasPos2frac([pos.x * niivue.uiData.dpr, pos.y * niivue.uiData.dpr]);
            if (frac[0] >= 0) {
                const mm = niivue.frac2mm(frac);
                const vox = niivue.volumes[1].mm2vox(Array.from(mm));
                const idx = Math.round(atlasRef.current.getValue(vox[0], vox[1], vox[2]));
                if (isFinite(idx) && idx > 0 && idx in atlasRef.current.labels) { // Ensure valid region ID > 0
                    if (tooltip && setTooltip) setTooltip({
                        visible: true, text: atlasRef.current.labels[idx] || t('unknown_region'),
                        x: e.pageX + 15, y: e.pageY + 15
                    });
                } else {
                    if (tooltip && setTooltip) setTooltip({ ...tooltip, visible: false });
                }
            }
        } else {
            // Mouse is outside canvas, remove tooltip
            if (tooltip && setTooltip) setTooltip({ ...tooltip, visible: false });
        }
    }

    const handleScrollStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (!niivue || !scrollBarRef.current) return;

        isScrolling.current = true;

        // Get initial position
        const clientY = 'touches' in e
            ? (e.touches[0] ? e.touches[0].clientY : undefined)
            : e.clientY;
        if(clientY !== undefined){
            lastScrollPosition.current = clientY;
            updateScrollThumb(clientY);
        }
    };

    // Handle scroll move
    const handleScrollMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (!isScrolling.current || !niivue || !scrollBarRef.current) return;

        const clientY = 'touches' in e
            ? (e.touches[0] ? e.touches[0].clientY : undefined)
            : e.clientY;
        if(clientY !== undefined){
            updateScrollThumb(clientY);
        }
    };

    // Handle scroll end
    const handleScrollEnd = () => {
        isScrolling.current = false;
    };

    // Update scroll thumb position and slice
    const updateScrollThumb = (clientY: number) => {
        if (!scrollBarRef.current || !niivue) return;

        const scrollBar = scrollBarRef.current;
        const rect = scrollBar.getBoundingClientRect();

        // Calculate relative position (0 to 1)
        let relativePos = (clientY - rect.top) / rect.height;
        relativePos = Math.max(0, Math.min(1, relativePos));

        // Update thumb position
        if (scrollThumbRef.current) {
            scrollThumbRef.current.style.top = `${relativePos * 100}%`;
        }

        // Update slice position based on orientation
        const currentPos = [...niivue.scene.crosshairPos];
        let axisToModify = 2; // Z-axis (axial)

        if (mobileOrientation === "sagittal") {
            axisToModify = 0; // X-axis
        } else if (mobileOrientation === "coronal") {
            axisToModify = 1; // Y-axis
        }

        // For axial view, top of scrollbar = bottom of volume
        if (mobileOrientation === "axial") {
            relativePos = 1 - relativePos;
        }

        currentPos[axisToModify] = relativePos;

        // Update crosshair position
        niivue.setCrosshairColor([1, 1, 1, 1]);
        niivue.scene.crosshairPos = new Float32Array(currentPos);
        niivue.drawScene();
    };

    const updateScrollThumbFromNiivue = () => {
        if (!niivue || !scrollThumbRef.current || !scrollBarRef.current) return;
        // Get current crosshair position
        const currentPos = niivue.scene.crosshairPos;
        // Determine which axis to use based on current orientation
        let axisValue = 0;
        if (mobileOrientationRef.current === "axial") {
            axisValue = 1 - currentPos[2]; // Invert for axial view
        } else if (mobileOrientationRef.current === "sagittal") {
            axisValue = currentPos[0];
        } else if (mobileOrientationRef.current === "coronal") {
            axisValue = currentPos[1];
        }
        // Set the thumb position directly
        scrollThumbRef.current.style.top = `${axisValue * 100}%`;
    };


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
        lastTouchEvent.current = undefined;
    };
    const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!niivue || !niivue.gl || !niivue.volumes[1] || !canvasRef.current || !atlasRef.current) return;
        const clickedRegionLocation = atlasRef.current.getClickedRegion(canvasRef.current, e)
        consoleLog("verbose", `Canvas interaction: ${clickedRegionLocation ? `region ${clickedRegionLocation.idx} at ${clickedRegionLocation.mm}` : 'no region'}`);
        if (clickedRegionLocation && (clickedRegionLocation.idx !== undefined || blindMode)) {
            selectedVoxelProp.current = clickedRegionLocation;
        }
        canvasInteractionRef.current(clickedRegionLocation)
    }

    return (
        <GameContext.Provider value={{
            gameMode,

            isLoading, setIsLoading,
            hasEnded, setHasEnded,
            hasEndedRef,
            isConnected, setIsConnected,
            isGameRunning, setIsGameRunning,
            selectedRegion, setSelectedRegion,
            atlasRef,
            canvasRef,
            currentlyLoadedAtlas,
            highlightedRegion, setHighlightedRegion,
            isRegionLocked, setIsRegionLocked,
            pastRegions, setPastRegions,
            guessButtonRef,
            selectedVoxelProp,
            currentTarget,

            lastTouchEvent,
            isDragging, setIsDragging,
            dragStart, setDragStart,
            lastSlicePosition, setLastSlicePosition,
            currentAxis, setCurrentAxis,
            dragSensitivity,
            mobileOrientation, setMobileOrientation,
            mobileOrientationRef,
            scrollBarRef,
            scrollThumbRef,
            isScrolling,
            lastScrollPosition,
            niivue, setNiivue, niivueRef,

            highlightWrapper,
            unHighlight,
            handleRecolorization,

            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            handleTouchStart,
            handleTouchEnd,
            handleTouchMove,
            handleCanvasMouseMove,
            handleScrollStart,
            handleScrollMove,
            handleScrollEnd,

            validateGuessHandler,
            startGameHandler,

            startGameCallbackRef,
        }}>
            {children}
        </GameContext.Provider>
    )
}

// Create the context
type GameContextType = {
    gameMode: string,

    isLoading: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    hasEnded: boolean,
    setHasEnded: React.Dispatch<React.SetStateAction<boolean>>,
    hasEndedRef: React.RefObject<boolean>;
    isConnected: boolean;
    setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
    isGameRunning: boolean;
    setIsGameRunning: React.Dispatch<React.SetStateAction<boolean>>;
    selectedRegion: any;
    setSelectedRegion: React.Dispatch<React.SetStateAction<any>>;
    atlasRef: React.RefObject<AtlasImageProxy | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    currentlyLoadedAtlas: React.RefObject<any>;
    highlightedRegion: number | null;
    setHighlightedRegion: React.Dispatch<React.SetStateAction<number | null>>;
    isRegionLocked: boolean;
    setIsRegionLocked: React.Dispatch<React.SetStateAction<boolean>>;
    pastRegions: PastRegion[],
    setPastRegions: React.Dispatch<React.SetStateAction<PastRegion[]>>;
    guessButtonRef: RefObject<HTMLButtonElement | null>;
    selectedVoxelProp: RefObject<{
        mm: number[];
        vox: number[];
        idx: number | undefined;
    } | null>;
    currentTarget: RefObject<number | undefined>;

    lastTouchEvent: React.RefObject<React.Touch | undefined>;
    isDragging: boolean;
    setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
    dragStart: { x: number; y: number } | null;
    setDragStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
    lastSlicePosition: number;
    setLastSlicePosition: React.Dispatch<React.SetStateAction<number>>;
    currentAxis: number;
    setCurrentAxis: React.Dispatch<React.SetStateAction<number>>;
    dragSensitivity: number;
    mobileOrientation: string;
    setMobileOrientation: React.Dispatch<React.SetStateAction<string>>;
    mobileOrientationRef: React.RefObject<string>;
    scrollBarRef: React.RefObject<HTMLDivElement | null>;
    scrollThumbRef: React.RefObject<HTMLDivElement | null>;
    isScrolling: React.RefObject<boolean>;
    lastScrollPosition: React.RefObject<number>;
    niivue: Niivue | null;
    setNiivue: React.Dispatch<React.SetStateAction<Niivue | null>>;
    niivueRef: React.RefObject<Niivue | null>

    highlightWrapper: (regionId: number, moveToCenter: boolean, allowFibers?: boolean) => void;
    unHighlight: () => void;
    handleRecolorization: () => void;

    handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    handleMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    handleTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchEnd: (e: React.TouchEvent<HTMLCanvasElement>) => void;
    handleTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
    handleCanvasMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    handleScrollStart: (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
    handleScrollMove: (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
    handleScrollEnd: () => void;

    validateGuessHandler: () => void;
    startGameHandler: () => void;

    startGameCallbackRef: RefObject<() => void>;
}
const GameContext = createContext<GameContextType | undefined>(undefined);

// Create a custom hook for using the context
export function useGame() {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within an GameProvider');
    }
    return context;
}