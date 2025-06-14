import React from 'react';
import { ColorMap, DisplayOptions } from '../types';

export async function fetchJSON(fnm: string): Promise<any> {
    try {
        const response = await fetch(fnm);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return await response.json();
    } catch (e) {
        console.error(`Fetch failed for ${fnm}:`, e);
        throw new Error(e as string);
    }
}

export const defineNiiOptions = (myniivue: any, viewerOptions: DisplayOptions) => {
    if (myniivue) {
        if (viewerOptions.displayType === "Axial") myniivue.setSliceType(myniivue.sliceTypeAxial);
        if (viewerOptions.displayType === "Coronal") myniivue.setSliceType(myniivue.sliceTypeCoronal);
        if (viewerOptions.displayType === "Sagittal") myniivue.setSliceType(myniivue.sliceTypeSagittal);
        if (viewerOptions.displayType === "Render") {
            myniivue.setSliceType(myniivue.sliceTypeRender);
            myniivue.setClipPlane(myniivue.meshes.length > 0 ? [-0.1, 270, 0] : [2, 270, 0]);
        }
        if (viewerOptions.displayType === "MultiPlanar") {
            myniivue.opts.multiplanarShowRender = 0;
            myniivue.setSliceType(myniivue.sliceTypeMultiplanar);
        }
        if (viewerOptions.displayType === "MultiPlanarRender") {
            myniivue.opts.multiplanarShowRender = 1;
            myniivue.setSliceType(myniivue.sliceTypeMultiplanar);
        }
        if (myniivue.volumes.length > 1) {
            myniivue.setOpacity(1, viewerOptions.displayAtlas ? viewerOptions.displayOpacity : 0);
        }
        myniivue.opts.isRadiologicalConvention = viewerOptions.radiologicalOrientation;
        myniivue.updateGLVolume();
    }
}

export const initNiivue = (myniivue: any, canvas: HTMLCanvasElement, viewerOptions: DisplayOptions, callback: () => void) => {
    myniivue.attachToCanvas(canvas).then(() => {
        myniivue.setInterpolation(false);
        const myCustomCmap = {
            min: 40,
            max: 80,
            R: [0, 255],   // Red channel values at control points
            G: [0, 255],   // Green channel values at control points
            B: [0, 255],     // Blue channel values at control points
            A: [0, 255], // Alpha values
            I: [40, 80], // Intensity values corresponding to R,G,B,A points
        };
        // 2. Add the colormap to Niivue with a unique name
        myniivue.addColormap('MNI_Cmap', myCustomCmap);
        myniivue.opts.crosshairGap = 0;
        myniivue.opts.dragMode = myniivue.dragModes.slicer3D;
        myniivue.opts.yoke3Dto2DZoom = true;
        defineNiiOptions(myniivue, viewerOptions)
        callback()
    }).catch((error:any) => {
        console.error('Error attaching Niivue to canvas:', error);
  });
}

export const loadAtlasNii = (myniivue: any, preloadedBackgroundMNI: any|null, preloadedAtlas?: any) => {
    if (myniivue) {
        for (let i = 1; i < myniivue.volumes.length; i++) {
            myniivue.removeVolume(myniivue.volumes[i]);
        }
        // Load volumes
        if (myniivue.volumes.length == 0 && preloadedBackgroundMNI) {
            myniivue.addVolume(preloadedBackgroundMNI);
            const firstVolumeId = myniivue.volumes[0].id;
            myniivue.setColormap(firstVolumeId, 'MNI_Cmap');
        }
        if(preloadedAtlas){
            myniivue.addVolume(preloadedAtlas);
        }
        myniivue.setClipPlane([2, 270, 0]);
        myniivue.opts.isSliceMM = true;
    }
}

export function getClickedRegion(myniivue: any, canvasObj: HTMLCanvasElement, cMap: ColorMap, e: any){
    const isTouch = e.type === 'touchstart' || e.type === 'touchend';
    const touch = isTouch ? (e as React.TouchEvent<HTMLCanvasElement>).touches[0] : (e as React.MouseEvent<HTMLCanvasElement>);
    const rect = canvasObj.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Check if touch/click is within canvas bounds
    if (x >= 0 && x < rect.width && y >= 0 && y < rect.height) {
      const pos = myniivue.getNoPaddingNoBorderCanvasRelativeMousePosition(touch as unknown as MouseEvent, myniivue.gl.canvas);
      if (!pos) return; // If position is not valid, exit early
      const frac = myniivue.canvasPos2frac([pos.x * (myniivue.uiData?.dpr ?? 1), pos.y * (myniivue.uiData?.dpr ?? 1)]);
      if (frac[0] >= 0) {
        const mm = myniivue.frac2mm(frac);
        const vox = myniivue.volumes[1].mm2vox(Array.from(mm));
        const idx = Math.round(myniivue.volumes[1].getValue(vox[0], vox[1], vox[2]));
        if (isFinite(idx) && idx > 0 && idx in (cMap?.labels ?? [])) { // Ensure valid region ID > 0
            return {mm: Array.from(mm) as number[], vox: Array.from(vox) as number[], idx}
        }
      }
    }
}

export function highlightRegionFluorescentYellow(highlightedRegion: number, niivue: any, cLut: Uint8ClampedArray|null, 
                                                        cMap: ColorMap|null, moveToCenter: boolean = true) {
    //console.log('highlightRegionFluorescentYellow called with regionId:', highlightedRegion);
    if (cLut && niivue && highlightedRegion && highlightedRegion * 4 < cLut.length) {
      const lut = cLut.slice();
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

      if(moveToCenter && cMap && cMap.centers && cMap.centers[highlightedRegion]){
        const center = cMap.centers[highlightedRegion];
        niivue.scene.crosshairPos = niivue.mm2frac(new Float32Array(center[0]));
        niivue.createOnLocationChange();
      }
      niivue.updateGLVolume();
      niivue.drawScene();
    } else {
      console.error('Cannot highlight region:', {
        clut: !!cLut,
        nv1: !!niivue,
        highlightedRegion,
        lutLength: cLut?.length
      });
    }
  }