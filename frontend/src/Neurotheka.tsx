import { init, type TFunction } from 'i18next'
import './Neurotheka.css'
import './Help.css'
import atlasFiles from './atlas_files'
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchJSON } from './helper_niivue';
import { initNiivue } from './NiiHelpers';
import { LoadingScreen } from './App';

function Neurotheka({ t, callback, currentLanguage, atlasRegions, askedRegion, askedAtlas,
  preloadedAtlas, preloadedBackgroundMNI, viewerOptions, loadEnforcer, niivue, niivueModule }:
  {
    t: TFunction<"translation", undefined>, currentLanguage: string, callback: AppCallback, atlasRegions: AtlasRegion[],
    askedRegion: number | null, askedAtlas: string | null,
    preloadedAtlas: any | null, preloadedBackgroundMNI: any | null,
    viewerOptions: DisplayOptions, loadEnforcer: number,
    niivue: any, niivueModule: any
  }) {
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showHelpOverlay, setShowHelpOverlay] = useState<boolean>(false);
  const helpContentRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
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

  async function updateVisualization() {
    if (!askedRegion || !askedAtlas || !preloadedBackgroundMNI || !preloadedAtlas || !isLoadedNiivue) {
      console.error("Invalid regionId or atlas");
      return;
    }
    try {
      const selectedAtlasFiles = atlasFiles[askedAtlas];

      // Clear existing meshes
      niivue.meshes = [];
      niivue.updateGLVolume();

      // Load colormap
      const cmap = await fetchJSON("assets/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);

      // Reset volumes
      for (let i = 1; i < niivue.volumes.length; i++) {
        niivue.removeVolume(niivue.volumes[i]);
      }
      for (let i = 1; i < niivue.meshes.length; i++) {
        niivue.removeMesh(niivue.meshes[i]);
      }
      let useTractography = false;
      let tractographyLoaded = false;
      let tractLabel = ""
      let tractUrl = ""

      if (askedAtlas === 'xtract' && isFinite(askedRegion) && askedRegion in cmap.labels) {
        const cmap_en = await fetchJSON("assets/atlas/descr/en/" + selectedAtlasFiles.json);
        tractLabel = cmap_en.labels[askedRegion].replace(/\s+/g, '_');
        tractUrl = `assets/atlas/TOM_trackings/${tractLabel}.tck`;
        try {
          const response = await fetch(tractUrl, { method: 'HEAD' });
          if (response.ok) {
            useTractography = true;
          }
        } catch (error) {
          console.log(`Tractography not available for ${tractLabel}:`, error);
        }
      }

      // Load volumes
      if (niivue.volumes.length == 0) {
        niivue.addVolume(preloadedBackgroundMNI);
      }
      if (!useTractography) {
        niivue.addVolume(preloadedAtlas);
      }

      if (useTractography) {
        try {
          await niivue.loadMeshes([
            {
              url: tractUrl,
              rgba255: [0, 255, 255, 255]
            }
          ]);
          if (niivue.meshes.length > 0) {
            niivue.meshes[0].colormap = 'blue';
            //niivue.meshes[0].fiberRadius = 0.2;
            niivue.meshes[0].fiberColor = 'Local';
          }
          console.log(`Loaded tractography: ${tractUrl}`);
          tractographyLoaded = true;
          //setupClipPlaneScroll();
        } catch (error) {
          console.error(`Failed to load tractography for ${tractLabel}:`, error);
          callback.setHeaderText(t('error_loading_data', { atlas: selectedAtlasFiles.name }));
          niivue.addVolume(preloadedAtlas);
          useTractography = false;
        }
      }

      if (!useTractography && niivue.volumes.length > 1) {
        niivue.volumes[1].setColormapLabel(cmap);
        const numRegions = Object.keys(cmap.labels).length;
        const clut = new Uint8Array(numRegions * 4);
        for (let i = 0; i < numRegions; i++) {
          if (i === askedRegion && isFinite(askedRegion) && askedRegion in cmap.labels) {
            clut[i * 4 + 0] = 43; // R
            clut[i * 4 + 1] = 111; // G
            clut[i * 4 + 2] = 161;   // B
            clut[i * 4 + 3] = 255; // A
          } else {
            clut[i * 4 + 3] = 0; // Transparent
          }
        }
        if (niivue.volumes[1] && niivue.volumes[1].colormapLabel) {
          niivue.volumes[1].colormapLabel.lut = new Uint8ClampedArray(clut);
        }
        niivue.setOpacity(1, viewerOptions.displayOpacity);
        niivue.updateGLVolume();
      }

      // Set initial clip plane
      niivue.setClipPlane(tractographyLoaded ? [-0.1, 270, 0] : [2, 270, 0]);
      niivue.opts.isSliceMM = true;

      // Update display
      if (isFinite(askedRegion) && askedRegion in cmap.labels) {
        callback.setHeaderText(`${cmap.labels[askedRegion] || "Unknown"} (${selectedAtlasFiles.name})`);
      } else {
        callback.setHeaderText(t('error_loading_data', { atlas: selectedAtlasFiles.name }));
        console.error(`Invalid region ID: ${askedRegion}`);
      }

      niivue.drawScene();
    } catch (error) {
      console.error(`Failed to update visualization for ${askedAtlas}:`, error);
      callback.setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
      if (niivue.volumes.length > 0) {
        niivue.drawScene();
      }
    }
  }

  const checkLoading = () => {
    if (preloadedAtlas && preloadedBackgroundMNI && isLoadedNiivue) {
      setIsLoading(false);
      updateVisualization();
    } else {
      setIsLoading(true);
    }
  }

  useEffect(() => {
    initNiivue(niivue, viewerOptions, ()=>{setIsLoadedNiivue(true);})
    checkLoading();
  }, [])

  useEffect(() => {
    checkLoading();
  }, [preloadedAtlas, preloadedBackgroundMNI, isLoadedNiivue, askedRegion, askedAtlas, loadEnforcer])

  useEffect(() => {
    if (niivue) {
      if (viewerOptions.displayType === "Axial") niivue.setSliceType(niivue.sliceTypeAxial);
      if (viewerOptions.displayType === "Coronal") niivue.setSliceType(niivue.sliceTypeCoronal);
      if (viewerOptions.displayType === "Sagittal") niivue.setSliceType(niivue.sliceTypeSagittal);
      if (viewerOptions.displayType === "Render") {
        niivue.setSliceType(niivue.sliceTypeRender);
        niivue.setClipPlane(niivue.meshes.length > 0 ? [-0.1, 270, 0] : [2, 270, 0]);
      }
      if (viewerOptions.displayType === "MultiPlanar") {
        niivue.opts.multiplanarShowRender = niivueModule.SHOW_RENDER.NEVER;
        niivue.setSliceType(niivue.sliceTypeMultiplanar);
      }
      if (viewerOptions.displayType === "MultiPlanarRender") {
        niivue.opts.multiplanarShowRender = niivueModule.SHOW_RENDER.ALWAYS;
        niivue.setSliceType(niivue.sliceTypeMultiplanar);
      }
      if (niivue.volumes.length > 1) {
        niivue.setOpacity(1, viewerOptions.displayAtlas ? viewerOptions.displayOpacity : 0);
      }
      niivue.opts.isRadiologicalConvention = viewerOptions.radiologicalOrientation;
      niivue.updateGLVolume();
    }
  }, [viewerOptions])

  useLayoutEffect(() => {
  if (niivue && canvasRef.current && !isLoading) {
    // Niivue expects the canvas to be sized by CSS, but sometimes needs a manual resize event
    niivue.resizeListener();
  }
}, [niivue, isLoading]);

  return (
    <div className="page-container">
      {isLoading && <LoadingScreen />}
      <canvas id="gl1" ref={canvasRef}></canvas>

      <div className="button-container">
        <button id="return-button" className="return-button" 
          onClick={()=>callback.gotoPage("welcome")}>{t("return_button")}</button>
      </div>

      {showHelpOverlay && <div id="help-overlay" className="help-overlay">
        <div className="help-content" ref={helpContentRef}>
          <button id="close-help" className="close-button" onClick={() => setShowHelpOverlay(false)}>&times;</button>
          <h2>{t("help_title")}</h2>
          <section>
            <h3>{t("neurotheka_principle_title")}</h3>
            <p>{t("neurotheka_principle_text")}</p>
          </section>
          <section>
            <h3>{t("neurotheka_navigation_title")}</h3>
            <p>{t("neurotheka_navigation_text")}</p>
          </section>
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
      
    </div>


  )
}

export default Neurotheka