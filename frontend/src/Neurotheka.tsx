import { init, type TFunction } from 'i18next'
import atlasFiles from './atlas_files'
import React, { use, useEffect, useRef, useState } from 'react';
import { Niivue, NVImage, SHOW_RENDER } from '@niivue/niivue';
import { fetchJSON } from './helper_niivue';
import { initNiivue } from './NiiHelpers';
import { useNavigate, useParams } from 'react-router-dom';

function Neurotheka({ t, callback, currentLanguage, atlasRegions, 
  preloadedAtlas, preloadedBackgroundMNI, viewerOptions, loadEnforcer }:
  {
    t: TFunction<"translation", undefined>, currentLanguage: string, callback: AppCallback, atlasRegions: AtlasRegion[],
    preloadedAtlas: NVImage | null, preloadedBackgroundMNI: NVImage | null,
    viewerOptions: DisplayOptions, loadEnforcer: number
  }) {
  const { askedAtlas, askedRegion } = useParams();
  const navigate = useNavigate();
  const niivue = useRef(new Niivue({
    show3Dcrosshair: true,
    backColor: [0, 0, 0, 1],
    crosshairColor: [1, 1, 1, 1],
    logLevel: "warn"
  }));
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showHelpOverlay, setShowHelpOverlay] = useState<boolean>(false);
  const helpContentRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLDivElement>(null);

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
      niivue.current.meshes = [];
      niivue.current.updateGLVolume();

      // Load colormap
      const cmap = await fetchJSON("/assets/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);

      // Reset volumes
      for (let i = 1; i < niivue.current.volumes.length; i++) {
        niivue.current.removeVolume(niivue.current.volumes[i]);
      }
      for (let i = 1; i < niivue.current.meshes.length; i++) {
        niivue.current.removeMesh(niivue.current.meshes[i]);
      }
      let useTractography = false;
      let tractographyLoaded = false;
      let tractLabel = ""
      let tractUrl = ""

      if (askedAtlas === 'xtract' && isFinite(Number(askedRegion)) && askedRegion in cmap.labels) {
        const cmap_en = await fetchJSON("/assets/atlas/descr/en/" + selectedAtlasFiles.json);
        tractLabel = cmap_en.labels[askedRegion].replace(/\s+/g, '_');
        tractUrl = `/assets/atlas/TOM_trackings/${tractLabel}.tck`;
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
      if (niivue.current.volumes.length == 0) {
        niivue.current.addVolume(preloadedBackgroundMNI);
      }
      if (!useTractography) {
        niivue.current.addVolume(preloadedAtlas);
      }

      if (useTractography) {
        try {
          await niivue.current.loadMeshes([
            {
              url: tractUrl,
              rgba255: [0, 255, 255, 255]
            }
          ]);
          if (niivue.current.meshes.length > 0) {
            niivue.current.meshes[0].colormap = 'blue';
            //niivue.current.meshes[0].fiberRadius = 0.2;
            niivue.current.meshes[0].fiberColor = 'Local';
          }
          console.log(`Loaded tractography: ${tractUrl}`);
          tractographyLoaded = true;
          //setupClipPlaneScroll();
        } catch (error) {
          console.error(`Failed to load tractography for ${tractLabel}:`, error);
          callback.setHeaderText(t('error_loading_data', { atlas: selectedAtlasFiles.name }));
          niivue.current.addVolume(preloadedAtlas);
          useTractography = false;
        }
      }

      if (!useTractography && niivue.current.volumes.length > 1) {
        niivue.current.volumes[1].setColormapLabel(cmap);
        const numRegions = Object.keys(cmap.labels).length;
        const clut = new Uint8Array(numRegions * 4);
        for (let i = 0; i < numRegions; i++) {
          if (i === Number(askedRegion) && isFinite(Number(askedRegion)) && askedRegion in cmap.labels) {
            clut[i * 4 + 0] = 43; // R
            clut[i * 4 + 1] = 111; // G
            clut[i * 4 + 2] = 161;   // B
            clut[i * 4 + 3] = 255; // A
          } else {
            clut[i * 4 + 3] = 0; // Transparent
          }
        }
        if (niivue.current.volumes[1] && niivue.current.volumes[1].colormapLabel) {
          niivue.current.volumes[1].colormapLabel.lut = new Uint8ClampedArray(clut);
        }
        niivue.current.setOpacity(1, viewerOptions.displayOpacity);
        niivue.current.updateGLVolume();
      }

      // Set initial clip plane
      niivue.current.setClipPlane(tractographyLoaded ? [-0.1, 270, 0] : [2, 270, 0]);
      niivue.current.opts.isSliceMM = true;

      // Update display
      if (isFinite(Number(askedRegion)) && askedRegion in cmap.labels) {
        callback.setHeaderText(`${cmap.labels[askedRegion] || "Unknown"} (${selectedAtlasFiles.name})`);
      } else {
        callback.setHeaderText(t('error_loading_data', { atlas: selectedAtlasFiles.name }));
        console.error(`Invalid region ID: ${askedRegion}`);
      }

      niivue.current.drawScene();
    } catch (error) {
      console.error(`Failed to update visualization for ${askedAtlas}:`, error);
      callback.setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
      if (niivue.current.volumes.length > 0) {
        niivue.current.drawScene();
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
    initNiivue(niivue.current, viewerOptions, ()=>{setIsLoadedNiivue(true);})
    checkLoading();
  }, [])

  useEffect(() => {
    checkLoading();
    if(askedAtlas && askedRegion){
      callback.launchNeurotheka({atlas: askedAtlas, id: Number(askedRegion)})
    }
  }, [preloadedAtlas, preloadedBackgroundMNI, isLoadedNiivue, askedRegion, askedAtlas, loadEnforcer])

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
    <>
      <link rel="stylesheet" href="/assets/styles/Neurotheka.css" />
      {isLoading && <div className="loading-screen">Chargement...</div>}
      <canvas id="gl1"></canvas>

      <div className="button-container">
        <button id="return-button" className="return-button" 
          onClick={()=>navigate("/welcome")}>{t("return_button")}</button>
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
      
    </>
  )
}

export default Neurotheka