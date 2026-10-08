import React from 'react';
import { ColorMap, DisplayOptions } from '../types/types';
import type { Niivue, NVImage } from '@niivue/niivue';
import { loadJSONFromCache } from './nifti_cache';
import { consoleLog } from './logging';
import { SourceElement } from '../context/AppContext';

export async function fetchJSON(fnm: string): Promise<ColorMap> {
    try {
        // Use cached JSON loading
        return await loadJSONFromCache(fnm);
    } catch (e) {
        console.error(`Fetch failed for ${fnm}:`, e);
        throw new Error(e as string);
    }
}

export const defineNiiOptions = (myniivue: any, myAtlasProxy: AtlasImageProxy | undefined, viewerOptions: DisplayOptions) => {
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
            if(myAtlasProxy){
                myAtlasProxy.setViewerOptions(viewerOptions);
            } 
            else {
                myniivue.setOpacity(1, viewerOptions.displayAtlas ? viewerOptions.displayOpacity : 0);
            }
        }
        myniivue.opts.isRadiologicalConvention = viewerOptions.radiologicalOrientation;
        // Brain (volume 0) opacity
        if (myniivue.volumes.length > 0) {
            myniivue.setOpacity(0, viewerOptions.brainOpacity ?? 1.0);
        }
        // Clip plane
        myniivue.setClipPlane([viewerOptions.clipPlane ?? 2, 270, 0]);
        myniivue.updateGLVolume();
    }
}

export const initNiivue = (myniivue: Niivue, canvas: HTMLCanvasElement, viewerOptions: DisplayOptions, 
                            callback: () => void, overrideOptions = false) => {
    if ((myniivue as any)._isInitialized) {
        if (callback) callback();
        return;
    }
    (myniivue as any)._isInitialized = true;
    consoleLog("normal", "Initializing Niivue...");

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
        myniivue.opts.yoke3Dto2DZoom = true;
        if(!overrideOptions) defineNiiOptions(myniivue, undefined, viewerOptions)
        callback()
    }).catch((error: any) => {
        console.error('Error attaching Niivue to canvas:', error);
    });
}

export const loadAtlasNii = (myniivue: any, preloadedBackgroundMNI: any | null, preloadedAtlas?: any) => {
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
        if (preloadedAtlas) {
            myniivue.addVolume(preloadedAtlas.clone());
        }
        myniivue.setClipPlane([2, 270, 0]);
        myniivue.opts.isSliceMM = true;
    }
}


function shuffleArray<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i] as T;
        a[i] = a[j] as T;
        a[j] = tmp;
    }
    return a;
}

export class AtlasImageProxy {
    public labels: string[];
    public info: string[] | undefined;
    public infoDetail: string[] | undefined;
    public infoSource: SourceElement[][] | undefined;
    public centers?: number[][][] | undefined;
    private data: Float32Array;
    private remappedData?: Float32Array;
    private dims: [number, number, number];
    public validRegions: number[];
    private blindMode: boolean = false;
    private mapping?: Record<number, number>;
    private inverseMapping?: Record<number, number>;
    private niivue: Niivue;
    private shuffleMode: "lut" | "data";
    private cmapLabels?: ColorMap;
    private lut?: Uint8ClampedArray;
    private origVolume: NVImage;
    private regionIndices: Map<number, number[]> = new Map();
    private viewerOptions: DisplayOptions;
    private isShowing: "all-regions" | "highlighted" = "all-regions";
    public atlas: string;
    private cmap_en: ColorMap|null;

    constructor({niivue, nvImage, labels, info, infoDetail, infoSource, centers, proposedLut, proposedMapping, proposedInverseMapping, blindMode = false, viewerOptions, cmap_en, atlas} :
        {niivue: Niivue, nvImage: any, labels: string[], info?: string[] | undefined, infoDetail?: string[] | undefined, infoSource?: SourceElement[][] | undefined, centers?: number[][][] | undefined,
        proposedLut?: ColorMap | undefined, proposedMapping?: Record<number, number> | undefined, 
        proposedInverseMapping?: Record<number, number> | undefined, blindMode: boolean, 
        viewerOptions: DisplayOptions, cmap_en: ColorMap|null, atlas: string}) {
        this.niivue = niivue;
        this.origVolume = nvImage;
        this.labels = labels;
        this.info = info;
        this.infoDetail = infoDetail;
        this.infoSource = infoSource;
        this.centers = centers;
        this.blindMode = blindMode;
        this.shuffleMode = this.labels.length > 254 ? "data" : "lut";
        const meta = nvImage.getImageMetadata();
        this.dims = [meta.nx, meta.ny, meta.nz];
        this.validRegions = [...this.labels.keys() || []].filter(id => id > 0 && Number.isInteger(id));
        this.viewerOptions = viewerOptions;
        this.cmap_en = cmap_en;
        this.atlas = atlas;

        // Get a complete copy of the data
        this.data = new Float32Array(
            nvImage.getVolumeData([0, 0, 0], this.dims, 'float32')[0]
        );

        if (this.shuffleMode === "lut") {
            if (proposedLut) {
                this.cmapLabels = proposedLut;
            } else {
                this.cmapLabels = {
                    "R": Array(1).fill(0).concat(shuffleArray([...Array(256).keys()]).slice(0, this.labels.length - 1)),
                    "G": Array(1).fill(0).concat(shuffleArray([...Array(256).keys()]).slice(0, this.labels.length - 1)),
                    "B": Array(1).fill(0).concat(shuffleArray([...Array(256).keys()]).slice(0, this.labels.length - 1)),
                    "A": Array(1).fill(0).concat(Array((this.labels.length || 1) - 1).fill(255)),
                    "I": [...Array(this.labels.length).keys()],
                    "labels": this.labels || [],
                }
            }
            this.origVolume.setColormapLabel(this.cmapLabels);
            this.lut = this.origVolume.colormapLabel?.lut || new Uint8ClampedArray();
        } else {
            if (proposedMapping && proposedInverseMapping) {
                this.mapping = proposedMapping;
                this.inverseMapping = proposedInverseMapping;
            } else {
                const shuffled = shuffleArray(this.validRegions);
                this.mapping = {};
                this.inverseMapping = {};
                for (let i = 0; i < this.validRegions.length; i++) {
                    const oldId = this.validRegions[i];
                    const newId = shuffled[i];
                    if(oldId !== undefined && newId !== undefined){
                        this.mapping[oldId] = newId;
                        this.inverseMapping[newId] = oldId;
                    }
                }
            }

            const remapBuf = new Float32Array(this.data)
            for (let i = 0; i < this.data.length; i++) {
                const dat = this.data[i]
                if(dat !== undefined) remapBuf[i] = this.mapping[dat] || 0
            }
            this.remappedData = remapBuf;

            this.buildRegionIndices();
        }
    }


    private buildRegionIndices() {
        for (let i = 0; i < this.data.length; i++) {
            const value = this.data[i];
            if (value !== undefined && value > 0) { // Skip background (0)
                if (!this.regionIndices.has(value)) {
                    this.regionIndices.set(value, []);
                }
                this.regionIndices.get(value)!.push(i);
            }
        }
    }

    getRegionIndices(regionId: number): number[] {
        return this.regionIndices.get(regionId) || [];
    }

    public setBlindMode(blind: boolean): void {
        this.blindMode = blind;
    }

    public setViewerOptions(options: DisplayOptions): void {
        this.viewerOptions = options;
        if(this.isShowing == "highlighted" || !this.blindMode){
            this.niivue.setOpacity(1, this.viewerOptions.displayOpacity);
        }
    }

    // The key method you want to preserve
    getValue(x: number, y: number, z: number): number {
        // Bounds checking
        if (x < 0 || y < 0 || z < 0 ||
            x >= this.dims[0] || y >= this.dims[1] || z >= this.dims[2]) {
            return 0;
        }

        // Calculate 1D index from 3D coordinates
        const index = Math.floor(x) +
            Math.floor(y) * this.dims[0] +
            Math.floor(z) * this.dims[0] * this.dims[1];

        return this.data[index] || 0;
    }

    // Forward mm2vox to the original image
    mm2vox(mm: number[]): number[] {
        return this.origVolume.mm2vox(mm) as number[];
    }

    // Add any other methods you need
    getImageMetadata() {
        return this.origVolume.getImageMetadata();
    }
    
    public showShuffledRegions(): void {
        this.isShowing = "all-regions";
        if (this.blindMode) {
            // Hide the atlas by setting opacity to 0
            this.niivue.setOpacity(1, 0);
        } else {
            // Show the atlas with normal opacity
            if (this.shuffleMode === "lut") {
                if (this.cmapLabels) this.origVolume.setColormapLabel(this.cmapLabels);
            } else {
                this.origVolume.setColormap("hsv")
                this.origVolume.setVolumeData([0, 0, 0], this.dims, this.remappedData)
            }
            this.niivue.setOpacity(1, this.viewerOptions.displayOpacity); // Full opacity for non-blind mode

        }
        if (this.niivue.meshes.length > 0) {
            for (let i = 0; i < this.niivue.meshes.length; i++) {
                const thisMesh = this.niivue.meshes[i]
                if(thisMesh !== undefined) this.niivue.removeMesh(thisMesh);
            }
        }
        this.niivue.updateGLVolume();
        this.niivue.drawScene();
    }

    public performAutocenter(){
        if (this.cmap_en?.autocenter?.center) {
            const center = this.cmap_en.autocenter.center;
            if (Array.isArray(center) && center.length === 3) {
                // Perform centering using the provided coordinates
                this.niivue.scene.crosshairPos = this.niivue.vox2frac(new Float32Array(center));
                this.niivue.createOnLocationChange();
                consoleLog("verbose", `Autocentering to coordinates: ${center}`);
            } else {
                console.error("Invalid autocenter coordinates provided in cmap_en.");
            }
        } else {
            this.niivue.scene.crosshairPos = [0.5,0.5,0.5]
        }
        if (this.cmap_en?.autocenter?.zoom && this.cmap_en?.autocenter?.center && this.niivue.volumes[0]?.matRAS) {
            const zoomFactor = this.cmap_en.autocenter.zoom;
            const center = this.cmap_en.autocenter.center;
            const centermm = this.niivue.vox2mm(center, this.niivue.volumes[0].matRAS)
            if (typeof zoomFactor === "number" && zoomFactor > 0) {
                // Adjust the zoom factor
                this.niivue.setPan2Dxyzmm([-centermm[0], -centermm[1], -centermm[2], zoomFactor]);
                consoleLog("verbose", `Zoom adjusted to factor: ${zoomFactor}`);
            } else {
                console.error("Invalid zoom factor provided in cmap_en.");
            }
        } else {
            this.niivue.setPan2Dxyzmm([0, 0, 0, 1]);
        }
    }

    public async highlightRegion(highlightedRegion: number, moveToCenter: boolean = true, allowFibers: boolean = false): Promise<void> {
        consoleLog("verbose", `Highlighting region ${highlightedRegion}, moveToCenter: ${moveToCenter}, allowFibers: ${allowFibers}`);
        this.isShowing = "highlighted";
        this.niivue.setOpacity(1, this.viewerOptions.displayOpacity);

        let useTractography = false;
        let tractUrl = '';
        let tractLabel = '';
        if(this.cmap_en && allowFibers){
            const enLabel = this.cmap_en.labels[highlightedRegion]
            if(enLabel != undefined) tractLabel = enLabel.replace(/\s+/g, '_');
            tractUrl = `/atlas/TOM_trackings/${tractLabel}.tck`;
            consoleLog("verbose", `Checking tractography availability: ${tractUrl}`);
            try {
                const response = await fetch(tractUrl, { method: 'HEAD' });
                if (response.ok) {
                    useTractography = true;
                    consoleLog("verbose", `Tractography available for ${tractLabel}`);
                } else {
                    consoleLog("verbose", `Tractography not available (${response.status}) for ${tractLabel}`);
                }
            } catch (error) {
                consoleLog("verbose", `Tractography not available for ${tractLabel}:`, error);
            }
        }

        let tractographyLoaded = false;
        if(useTractography){
            try {
                await this.niivue.loadMeshes([
                    {
                    url: tractUrl,
                    rgba255: [0, 255, 255, 255]
                    }
                ]);
                if (this.niivue.meshes.length > 0) {
                    const thisMesh = this.niivue.meshes[0];
                    if(thisMesh) {
                        thisMesh.colormap = 'blue';
                        thisMesh.fiberColor = 'Local';
                    }
                }
                tractographyLoaded = true;
                this.niivue.setClipPlane([-0.1, 270, 0]);
            } catch (error) {
                console.error(`Failed to load tractography for ${tractLabel}:`, error);
                this.niivue.setClipPlane([2, 270, 0]);
            }
        } else {
            if (this.niivue.meshes.length > 0) {
                for (let i = 0; i < this.niivue.meshes.length; i++) {
                    const thisMesh = this.niivue.meshes[i];
                    if(thisMesh) this.niivue.removeMesh(thisMesh);
                }
            }
            this.niivue.setClipPlane([2, 270, 0]);
        }
        
    
        if (this.shuffleMode == "lut" && this.lut) {
            const lut = this.lut.slice();
            // Make all regions transparent initially except region 0 if needed
            for (let i = 0; i < lut.length; i += 4) {
                lut[i + 0] = 0;   // R
                lut[i + 1] = 0;   // G
                lut[i + 2] = 0;   // B
                lut[i + 3] = 0;   // A (transparent)
            }
            if(!tractographyLoaded){
                // Highlight the specific region in yellow
                lut[highlightedRegion * 4 + 0] = 255; // R
                lut[highlightedRegion * 4 + 1] = 255; // G
                lut[highlightedRegion * 4 + 2] = 0;   // B (Yellow)
                lut[highlightedRegion * 4 + 3] = 255; // A (Fully Opaque)
            }

            if (this.origVolume.colormapLabel) this.origVolume.colormapLabel.lut = new Uint8ClampedArray(lut);
        }
        if (this.shuffleMode == "data") {
            this.origVolume.setColormapLabel({
                R: [0, 255],
                G: [0, 255],
                B: [0, 0],
                A: [0, 200],
                I: [0, 255],
                labels: ["background", "highlighted"]
            });
            const buf = new Float32Array(this.dims[0] * this.dims[1] * this.dims[2]);
            if(!tractographyLoaded){
                const indices = this.getRegionIndices(highlightedRegion);
                for (const idx of indices) {
                    buf[idx] = 255;
                }
            }
            this.origVolume.setVolumeData([0, 0, 0], this.dims, buf);
        }

        if (moveToCenter && this.centers && this.centers[highlightedRegion]) {
            const center = this.centers[highlightedRegion][0];
            if(center != undefined) this.niivue.scene.crosshairPos = this.niivue.mm2frac(new Float32Array(center));
            this.niivue.createOnLocationChange();
        }
        this.niivue.updateGLVolume();
        this.niivue.drawScene();
    }

    public getClickedRegion(canvasObj: HTMLCanvasElement, e: any) {
        const isTouch = e.type === 'touchstart' || e.type === 'touchend';
        const touch = isTouch ? (e as React.TouchEvent<HTMLCanvasElement>).touches[0] : (e as React.MouseEvent<HTMLCanvasElement>);
        const rect = canvasObj.getBoundingClientRect();
        if(touch === undefined) return;
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        // Check if touch/click is within canvas bounds
        if (x >= 0 && x < rect.width && y >= 0 && y < rect.height) {
            const pos = this.niivue.getNoPaddingNoBorderCanvasRelativeMousePosition(touch as unknown as MouseEvent, this.niivue.gl.canvas);
            if (!pos) return; // If position is not valid, exit early
            const frac = this.niivue.canvasPos2frac([pos.x * (this.niivue.uiData?.dpr ?? 1), pos.y * (this.niivue.uiData?.dpr ?? 1)]);
            const mm = this.niivue.frac2mm(frac);
            const thisVol = this.niivue.volumes[1]
            if(thisVol){
                const vox = thisVol.mm2vox(Array.from(mm));
                let idx = undefined;
                if (frac[0] >= 0) {
                    const tmpidx = Math.round(this.getValue(vox[0], vox[1], vox[2]));
                    if (isFinite(tmpidx) && tmpidx > 0 && tmpidx in (this.labels)) { 
                        idx = tmpidx;
                    }
                }
                return { mm: Array.from(mm) as number[], vox: Array.from(vox) as number[], idx }
            } 
        }
        return undefined;
    }
}
