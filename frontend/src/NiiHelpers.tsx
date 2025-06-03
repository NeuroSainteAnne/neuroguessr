import { NVImage, SHOW_RENDER, type Niivue } from "@niivue/niivue";

export const defineNiiOptions = (myniivue: Niivue, viewerOptions: DisplayOptions) => {
    if (myniivue) {
        if (viewerOptions.displayType === "Axial") myniivue.setSliceType(myniivue.sliceTypeAxial);
        if (viewerOptions.displayType === "Coronal") myniivue.setSliceType(myniivue.sliceTypeCoronal);
        if (viewerOptions.displayType === "Sagittal") myniivue.setSliceType(myniivue.sliceTypeSagittal);
        if (viewerOptions.displayType === "Render") {
            myniivue.setSliceType(myniivue.sliceTypeRender);
            myniivue.setClipPlane(myniivue.meshes.length > 0 ? [-0.1, 270, 0] : [2, 270, 0]);
        }
        if (viewerOptions.displayType === "MultiPlanar") {
            myniivue.opts.multiplanarShowRender = SHOW_RENDER.NEVER;
            myniivue.setSliceType(myniivue.sliceTypeMultiplanar);
        }
        if (viewerOptions.displayType === "MultiPlanarRender") {
            myniivue.opts.multiplanarShowRender = SHOW_RENDER.ALWAYS;
            myniivue.setSliceType(myniivue.sliceTypeMultiplanar);
        }
        if (myniivue.volumes.length > 1) {
            myniivue.setOpacity(1, viewerOptions.displayAtlas ? viewerOptions.displayOpacity : 0);
        }
        myniivue.opts.isRadiologicalConvention = viewerOptions.radiologicalOrientation;
        myniivue.updateGLVolume();
    }
}

export const initNiivue = (myniivue: Niivue, viewerOptions: DisplayOptions, callback: () => void) => {
    myniivue.attachTo('gl1').then(() => {
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
    })
}

export const loadAtlasNii = (myniivue: Niivue, preloadedBackgroundMNI: NVImage|null, preloadedAtlas?: NVImage) => {
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

export function getClickedRegion(myniivue: Niivue, canvasObj: HTMLCanvasElement, cMap: ColorMap, e: any){
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
    const rect = canvasObj.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Check if touch/click is within canvas bounds
    if (x >= 0 && x < rect.width && y >= 0 && y < rect.height) {
      const pos = myniivue.getNoPaddingNoBorderCanvasRelativeMousePosition(mouseEvt as MouseEvent, myniivue.gl.canvas);
      if (!pos) return; // If position is not valid, exit early
      const frac = myniivue.canvasPos2frac([pos.x * (myniivue.uiData?.dpr ?? 1), pos.y * (myniivue.uiData?.dpr ?? 1)]);
      if (frac[0] >= 0) {
        const mm = myniivue.frac2mm(frac);
        const vox = myniivue.volumes[1].mm2vox(Array.from(mm));
        const idx = Math.round(myniivue.volumes[1].getValue(vox[0], vox[1], vox[2]));
        if (isFinite(idx) && idx > 0 && idx in (cMap?.labels ?? [])) { // Ensure valid region ID > 0
            return {vox: Array.from(vox), idx}
        }
      }
    }
}