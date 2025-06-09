import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import "./Neurotheka.css";
import { useApp } from '../../context/AppContext';
import atlasFiles from '../../utils/atlas_files';
import { fetchJSON } from '../../helper_niivue';
import { initNiivue } from '../../utils/helper_nii';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Help } from '../../components/Help';
import { Niivue, SHOW_RENDER } from '@niivue/niivue';

function Neurotheka() {
  const { t, currentLanguage, askedAtlas, askedRegion,
          preloadedAtlas, preloadedBackgroundMNI, viewerOptions, setAskedAtlas, setAskedRegion, pageContext,
        setHeaderText } = useApp();
  const [isLoadedNiivue, setIsLoadedNiivue] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const currentlyLoadedAtlas = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [niivue, setNiivue] = useState<Niivue|null>(null);

    useEffect(() => {
      const { routeParams } = pageContext;
      setAskedAtlas(routeParams?.atlas);
      setAskedRegion(parseInt(routeParams?.region));

      setNiivue(new Niivue({
                logLevel: "error",
                show3Dcrosshair: true,
                backColor: [0, 0, 0, 1],
                crosshairColor: [1, 1, 1, 1]
            }));
      return () => { 
        setHeaderText("");
      };
    }, []);

  async function updateVisualization() {
    if (!askedRegion || !askedAtlas || !preloadedBackgroundMNI || !preloadedAtlas || !isLoadedNiivue || !niivue) {
      console.error("Invalid regionId or atlas");
      return;
    }
    try {
      const selectedAtlasFiles = atlasFiles[askedAtlas];

      // Clear existing meshes
      niivue.meshes = [];

      // Load colormap
      const cmap = await fetchJSON("/atlas/descr" + "/" + currentLanguage + "/" + selectedAtlasFiles.json);

      // Reset volumes
      if(preloadedAtlas != currentlyLoadedAtlas.current){
        for (let i = 1; i < niivue.volumes.length; i++) {
          niivue.removeVolume(niivue.volumes[i]);
        }
      }
      for (let i = 1; i < niivue.meshes.length; i++) {
        niivue.removeMesh(niivue.meshes[i]);
      }
      let useTractography = false;
      let tractographyLoaded = false;
      let tractLabel = ""
      let tractUrl = ""

      if (askedAtlas === 'xtract' && isFinite(Number(askedRegion)) && askedRegion in cmap.labels) {
        const cmap_en = await fetchJSON("/atlas/descr/en/" + selectedAtlasFiles.json);
        tractLabel = cmap_en.labels[askedRegion].replace(/\s+/g, '_');
        tractUrl = `/atlas/TOM_trackings/${tractLabel}.tck`;
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
        const firstVolumeId = niivue.volumes[0].id;
        niivue.setColormap(firstVolumeId, 'MNI_Cmap');
      }
      if (!useTractography && preloadedAtlas != currentlyLoadedAtlas.current) {
        niivue.addVolume(preloadedAtlas);
        currentlyLoadedAtlas.current = preloadedAtlas;
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
          setHeaderText(t('error_loading_data', { atlas: selectedAtlasFiles.name }));
          niivue.addVolume(preloadedAtlas);
          useTractography = false;
        }
      }

      if (!useTractography && niivue.volumes.length > 1) {
        niivue.volumes[1].setColormapLabel(cmap);
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
        if (niivue.volumes[1] && niivue.volumes[1].colormapLabel) {
          niivue.volumes[1].colormapLabel.lut = new Uint8ClampedArray(clut);
        }
        niivue.setOpacity(1, viewerOptions.displayOpacity);
      }

      // Set initial clip plane
      niivue.setClipPlane(tractographyLoaded ? [-0.1, 270, 0] : [2, 270, 0]);
      niivue.opts.isSliceMM = true;

      // set crosshair position
      let center = cmap.centers ? cmap.centers[askedRegion] : [0,0,0]
      niivue.scene.crosshairPos = niivue.mm2frac(center);
      niivue.createOnLocationChange()
      niivue.updateGLVolume();

      // Update display
      if (isFinite(Number(askedRegion)) && askedRegion in cmap.labels) {
        setHeaderText(`${cmap.labels[askedRegion] || "Unknown"} (${selectedAtlasFiles.name})`);
      } else {
        setHeaderText(t('error_loading_data', { atlas: selectedAtlasFiles.name }));
        console.error(`Invalid region ID: ${askedRegion}`);
      }

      niivue.drawScene();
    } catch (error) {
      console.error(`Failed to update visualization for ${askedAtlas}:`, error);
      setHeaderText(t('error_loading_data', { atlas: askedAtlas }));
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
    if(niivue && canvasRef.current){
      initNiivue(niivue, canvasRef.current, viewerOptions, ()=>{setIsLoadedNiivue(true);})
      checkLoading();
    }
  }, [niivue, canvasRef.current])

  useEffect(() => {
    checkLoading();
  }, [preloadedAtlas, preloadedBackgroundMNI, isLoadedNiivue, askedRegion, askedAtlas])

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
        niivue.opts.multiplanarShowRender = SHOW_RENDER.NEVER;
        niivue.setSliceType(niivue.sliceTypeMultiplanar);
      }
      if (viewerOptions.displayType === "MultiPlanarRender") {
        niivue.opts.multiplanarShowRender = SHOW_RENDER.ALWAYS;
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

  const myTitle = t("neuroglossaire_title");
  return (
    <>
      <title>{myTitle}</title>
      {isLoading && <LoadingScreen />}
      <canvas id="gl1" ref={canvasRef}></canvas>

      <div className="button-container">
        <a id="return-button" className="return-button"  href="/welcome">{t("return_button")}</a>
      </div>

      <Help />
      
    </>
  )
}

export default Neurotheka