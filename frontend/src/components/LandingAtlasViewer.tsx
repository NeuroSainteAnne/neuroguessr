import React, { useEffect, useRef, useState } from 'react';
import { Niivue } from '@niivue/niivue';
import atlasFiles from '../utils/atlas_files';
import { loadNIfTIFromCache } from '../utils/nifti_cache';
import { fetchJSON } from '../utils/helper_nii';
import { useApp } from '../context/AppContext';

interface LandingAtlasViewerProps {
  atlasKey?: string;
}

const LandingAtlasViewer: React.FC<LandingAtlasViewerProps> = ({ atlasKey = 'harvard-oxford' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const niivueRef = useRef<Niivue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { preloadedBackgroundMNI, nvimageModule } = useApp();

  const effectiveAtlasKey = atlasKey && atlasFiles[atlasKey] ? atlasKey : 'harvard-oxford';

  useEffect(() => {
    // Wait until AppContext has initialized the niivue module and MNI background
    if (!nvimageModule || !preloadedBackgroundMNI) return;

    const loadAtlas = async () => {
      try {
        if (!canvasRef.current) return;

        setIsLoading(true);
        setError(null);

        // Create new Niivue instance with multiplanar render view
        const nv = new Niivue();

        nv.opts.isRadiologicalConvention = true; 
        nv.opts.yoke3Dto2DZoom = true;
        nv.opts.crosshairGap = 0;
        nv.opts.multiplanarShowRender = 1;

        // Attach to canvas
        await nv.attachToCanvas(canvasRef.current);
        niivueRef.current = nv;

        // Use preloaded MNI background from AppContext (already cached)
        nv.addVolume(preloadedBackgroundMNI);

        // Load the selected atlas from cache (niftiCache initialized by AppContext)
        const atlas = atlasFiles[effectiveAtlasKey];
        if (!atlas) {
          setError('Atlas not found');
          return;
        }

        const atlasUrl = `/atlas/nii/${atlas.nii}`;
        const atlasData = await loadNIfTIFromCache(atlasUrl);
        if (atlasData) {
          // Clone to avoid mutating the shared cached NVImage
          const atlasClone = atlasData.clone();
          nv.addVolume(atlasClone);

          // Load and apply colormap for the atlas with proper labels
          try {
            const jsonUrl = `/atlas/descr/en/${atlas.json}`;
            const colorMapData = await fetchJSON(jsonUrl);
            if (colorMapData) {
              // Apply colormap with labels for distinct colors
              atlasClone.setColormapLabel(colorMapData);
            } else {
              nv.setColormap(atlasClone.id, 'hsv');
            }
          } catch (err) {
            console.warn('Could not load colormap:', err);
            nv.setColormap(atlasClone.id, 'hsv');
          }
          // Boost min/max to push colors into brighter range
          atlasClone.cal_min = 0;
          atlasClone.cal_max = 48;
          nv.updateGLVolume();
        }

        // Set multiplanar render view (A+C+S+R)
        nv.setSliceType(nv.sliceTypeMultiplanar);
        nv.opts.multiplanarShowRender = 1;

        // Set opacities for blending
        nv.setOpacity(0, 1.0); // MNI background at full opacity
        nv.setOpacity(1, 0.5); // Atlas at 50% opacity — lighter, pastel look

        nv.setClipPlane([2, 270, 0]);
        nv.updateGLVolume();

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load atlas:', err);
        setError(`Failed to load atlas: ${String(err)}`);
        setIsLoading(false);
      }
    };

    loadAtlas();

    return () => {
      // Cleanup
      if (niivueRef.current) {
        try {
          for (let i = 0; i < niivueRef.current.volumes.length; i++) {
              if(niivueRef.current && niivueRef.current.volumes && niivueRef.current.volumes[i]) {
                const volume = niivueRef.current.volumes[i];
                if (volume) {
                  niivueRef.current.removeVolume(volume);
                }
              }
          }
        } catch (e) {
          console.error('Error cleaning up Niivue:', e);
        }
      }
    };
  }, [effectiveAtlasKey, preloadedBackgroundMNI, nvimageModule]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 10,
            fontSize: '0.9rem',
            color: '#ccc',
          }}
        >
          Loading atlas...
        </div>
      )}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 10,
            fontSize: '0.85rem',
            color: '#f87171',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'grab',
          outline: 'none',
        }}
        id="landing-canvas"
      />
    </div>
  );
};

export default LandingAtlasViewer;
