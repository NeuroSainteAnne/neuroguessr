import fs from 'fs'
import path from "path";
import { __dirname, htmlRoot } from "./utils.ts";
import { NVImage } from "@niivue/niivue";
import atlasFiles from "../../frontend/src/utils/atlas_files.ts"

export const validRegions : Record<string,number[]> = {}
export const imageRef : Record<string,NVImage> = {}
export const imageMetadata : Record<string,any> = {}
export const regionCenters : Record<string,number[][][]> = {}
for (const atlas in atlasFiles) {
    const atlasJsonPath = path.join(htmlRoot, "frontend", "public", "atlas", "descr", "en", atlasFiles[atlas].json)
    const atlasJson = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf-8'))
    const atlasNiiPath = path.join(htmlRoot, "frontend", "public", "atlas", "nii", atlasFiles[atlas].nii)
    const niiBuffer = await fs.openAsBlob(atlasNiiPath)
    imageRef[atlas] = await NVImage.loadFromFile({file: new File([niiBuffer], atlas)})
    imageMetadata[atlas] = imageRef[atlas].getImageMetadata()
    const myImageData = imageRef[atlas].getVolumeData([0, 0, 0], [imageMetadata[atlas].nx, imageMetadata[atlas].ny, imageMetadata[atlas].nz], 'uint8')[0]
    const dataRegions = [...new Set(myImageData.filter(val => Number(val) > 0).map(val => Math.round(Number(val))))];
    let theseValidRegions = dataRegions.filter(val => atlasJson.labels[val] !== undefined && Number.isInteger(val));
    if (theseValidRegions.length === 0) {
        theseValidRegions = Object.keys(atlasJson.labels)
          .map(Number)
          .filter(val => val > 0 && Number.isInteger(val));
        if (theseValidRegions.length === 0) {
          throw new Error(`No valid regions available for ${atlas}`);
        }
        console.warn(`Fallback to cmap.labels keys for ${atlas}`);
    }
    validRegions[atlas] = theseValidRegions;
    regionCenters[atlas] = atlasJson.centers
}
