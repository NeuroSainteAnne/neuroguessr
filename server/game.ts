import { db } from "./database_init.ts";
import jwt from "jsonwebtoken";
import fs from 'fs'
import path from "path";
import { __dirname, htmlRoot } from "./utils.ts";
import { NVImage } from "@niivue/niivue";
var config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

const atlasFiles = {
    'aal': { nii: '/neuroguessr_web/data/aal.nii.gz', json: '/neuroguessr_web/data/aal.json', json_fr: '/neuroguessr_web/data/aal_fr.json', name: 'AAL' },
    'harvard-oxford': { nii: '/neuroguessr_web/data/HarvardOxford-cort-maxprob-thr25-1mm.nii.gz', json: '/neuroguessr_web/data/harvard_oxford.json', json_fr: '/neuroguessr_web/data/harvard_oxford_fr.json', name: 'Harvard-Oxford' },
    'tissues': { nii: '/neuroguessr_web/data/mni152_pveseg.nii.gz', json: '/neuroguessr_web/data/tissue.json', json_fr: '/neuroguessr_web/data/tissue_fr.json', name: 'Tissue' },
    // 'hemisphere': { nii: '/neuroguessr_web/data/Hemispheric_space-MNI152NLin6_res-1x1x1.nii.gz', json: '/neuroguessr_web/data/hemisphere.json', json_fr: '/neuroguessr_web/data/hemisphere_fr.json', name: 'Hemisphere' },
    'brodmann': { nii: '/neuroguessr_web/data/brodmann_grid.nii.gz', json: '/neuroguessr_web/data/brodmann.json', json_fr: '/neuroguessr_web/data/brodmann_fr.json', name: 'Brodmann' },
    'glasser': { nii: '/neuroguessr_web/data/HCP-MMP1_on_MNI152_ICBM2009a_nlin_hd.nii.gz', json: '/neuroguessr_web/data/glasser_neuroparc.json', json_fr: '/neuroguessr_web/data/glasser_neuroparc_fr.json', name: 'Glasser' },
    // 'destrieux': { nii: '/neuroguessr_web/data/aparc.a2009s+aseg_stride.nii.gz', json: '/neuroguessr_web/data/destrieux_labs.json', json_fr: '/neuroguessr_web/data/destrieux_labs_fr.json', name: 'Destrieux' },
    'schaefer': { nii: '/neuroguessr_web/data/Schaefer2018_100Parcels_7Networks_order_FSLMNI152_1mm.nii.gz', json: '/neuroguessr_web/data/schaefer100.json', json_fr: '/neuroguessr_web/data/schaefer100_fr.json', name: 'Schaefer' },     
    'yeo7': { nii: '/neuroguessr_web/data/Yeo-7-liberal_space-MNI152NLin6_res-1x1x1.nii.gz', json: '/neuroguessr_web/data/yeo7.json', json_fr: '/neuroguessr_web/data/yeo7_fr.json', name: 'Yeo7' },
    'yeo17': { nii: '/neuroguessr_web/data/Yeo-17-liberal_space-MNI152NLin6_res-1x1x1.nii.gz', json: '/neuroguessr_web/data/yeo17.json', json_fr: '/neuroguessr_web/data/yeo17_fr.json', name: 'Yeo17' },
    'subcortical': { nii: '/neuroguessr_web/data/ICBM2009b_asym-SubCorSeg-1mm_nn_regrid.nii.gz', json: '/neuroguessr_web/data/subcortical.json', json_fr: '/neuroguessr_web/data/subcortical_fr.json', name: 'Subcortical' },
    'cerebellum': { nii: '/neuroguessr_web/data/Cerebellum-MNIfnirt-maxprob-thr25-1mm.nii.gz', json: '/neuroguessr_web/data/cerebellum.json', json_fr: '/neuroguessr_web/data/cerebellum_fr.json', name: 'Cerebellum' },
    'xtract': { nii: '/neuroguessr_web/data/xtract_web.nii.gz', json: '/neuroguessr_web/data/xtract_labels.json', json_fr: '/neuroguessr_web/data/xtract_labels_fr.json', name: 'White Matter'},
    'thalamus': { nii: '/neuroguessr_web/data/Thalamus_Nuclei-HCP-MaxProb.nii.gz', json: '/neuroguessr_web/data/thalamus7.json', json_fr: '/neuroguessr_web/data/thalamus7_fr.json', name: 'Thalamus'},
    'HippoAmyg': { nii: '/neuroguessr_web/data/HippoAmyg_web.nii.gz', json: '/neuroguessr_web/data/HippoAmyg_labels.json', json_fr: '/neuroguessr_web/data/HippoAmyg_labels_fr.json', name: 'Hippocampus & Amygdala' },
    'JHU': { nii: '/neuroguessr_web/data/JHU_web.nii.gz', json: '/neuroguessr_web/data/JHU_labels.json', json_fr: '/neuroguessr_web/data/JHU_labels_fr.json', name: 'JHU' },
    'territories' : { nii: '/neuroguessr_web/data/ArterialAtlas_stride_round.nii.gz', json: '/neuroguessr_web/data/artery_territories.json', json_fr: '/neuroguessr_web/data/artery_territories_fr.json', name: 'Territories' }
};

const validRegions = {}
const imageRef : Record<string,NVImage> = {}
const imageMetadata : Record<string,any> = {}
for (const atlas in atlasFiles) {
    const atlasJsonPath = path.join(htmlRoot, atlasFiles[atlas].json.replace("/neuroguessr_web/",""))
    const atlasJson = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf-8'))
    const atlasNiiPath = path.join(htmlRoot, atlasFiles[atlas].nii.replace("/neuroguessr_web/",""))
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
}

export const startGameSession = async (req, res) => {
    try {
        const { mode, atlas } = req.body;
        const userId = req.user._id; // Extract user ID from the authenticated user

        // Validate the required fields
        if (!mode || !atlas) {
            return res.status(400).send({ message: "Mode and atlas are required to start a session." });
        }

        // Generate a session token
        const sessionToken = jwt.sign({ userId, mode, atlas }, config.jwt_secret, { expiresIn: "1h" });

        // Save the session to the database
        const insertSessionStmt = db.prepare(`
            INSERT INTO gamesessions (userId, token, mode, atlas)
            VALUES (?, ?, ?, ?)
        `);
        const result = insertSessionStmt.run(userId, sessionToken, mode, atlas);

        // Respond with the session token
        res.status(200).send({
            message: "Game session started successfully.",
            sessionToken,
            sessionId: result.lastInsertRowid
        });
    } catch (error) {
        console.error("Error starting game session:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

export const getNextRegion = async (req, res) => {
    const { sessionId, sessionToken } = req.body;
    // Validate the session token
    const getSessionStmt = db.prepare(`SELECT * FROM gamesessions WHERE id = ? AND token = ?`);
    const session = getSessionStmt.get(sessionId, sessionToken);
    if (!session) {
        return res.status(403).send({ message: "Invalid session or token mismatch" });
    }
    // Get the atlas length
    const atlasValidRegions = validRegions[session.atlas];
    if (!atlasValidRegions) {
        return res.status(400).send({ message: "Invalid atlas specified in the session." });
    }
    let randomRegionId = null
    if(session.mode == "time-attack"){
        // we have to select region that has not already been answered
        const getSessionStmt = db.prepare(`SELECT * FROM gameprogress WHERE sessionId = ? AND isCorrect = 1`);
        const answeredRegions = getSessionStmt.all(sessionId);
        const answeredRegionIds = answeredRegions.map(region => region.regionId);
        const remainingRegionIds = atlasValidRegions.filter(regionId => !answeredRegionIds.includes(regionId));
        if (remainingRegionIds.length === 0) {
            return res.status(200).send({ message: "No more regions available to guess.", regionId: -1 });
        }
        // Select a random region from the remaining regions
        const randomIndex = Math.floor(Math.random() * remainingRegionIds.length);
        randomRegionId = remainingRegionIds[randomIndex];
    } else if (session.mode == "streak") {
        // Select a random region from the remaining regions
        const randomIndex = Math.floor(Math.random() * atlasValidRegions.length);
        randomRegionId = atlasValidRegions[randomIndex];
    }
    if(randomRegionId !== null){
        const insertProgressStmt = db.prepare(`
            INSERT INTO gameprogress (sessionId, sessionToken, regionId, timeTaken, isActive, isCorrect, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        insertProgressStmt.run(sessionId, sessionToken, randomRegionId, 0, 1, 0);
        res.status(200).send({
            message: "Next region selected successfully.",
            regionId: randomRegionId,
        });
    }
}


export const validateRegion = async (req, res) => {
    const { sessionId, sessionToken, coordinates } = req.body;
    // Validate the session token
    const getSessionStmt = db.prepare(`SELECT * FROM gamesessions WHERE id = ? AND token = ?`);
    const session = getSessionStmt.get(sessionId, sessionToken);
    if (!session) {
        return res.status(403).send({ message: "Invalid session or token mismatch" });
    }
    // Retrieve the active gameprogress entry
    const getActiveProgressStmt = db.prepare(`
        SELECT * FROM gameprogress WHERE sessionId = ? AND isActive = 1 LIMIT 1
    `);
    const activeProgress = getActiveProgressStmt.get(sessionId);
    if (!activeProgress) {
        return res.status(400).send({ message: "No active region to validate." });
    }
    const { regionId } = activeProgress;
    // Validate the coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 3) {
        return res.status(400).send({ message: "Invalid coordinates provided." });
    }
    const [x, y, z] = coordinates;
    // Get the atlas data for the session
    const atlasImage = imageRef[session.atlas];
    const atlasMetadata = imageMetadata[session.atlas];
    if (x < 0 || x >= atlasMetadata.nx || y < 0 || y >= atlasMetadata.ny || z < 0 || z >= atlasMetadata.nz) {
        return res.status(400).send({ message: "Coordinates are out of bounds." });
    }
    const voxelValue = atlasImage.getValue(x, y, z);
    // Check if the voxel value matches the active region ID
    const isCorrect = voxelValue === regionId;
    const updateProgressStmt = db.prepare(`
        UPDATE gameprogress
        SET isActive = ?, isCorrect = ?, timeTaken = ?, createdAt = datetime('now')
        WHERE id = ?
    `);
    const timeTaken = Math.floor((Date.now() - new Date(activeProgress.createdAt).getTime()) / 1000); // Time in seconds
    updateProgressStmt.run(isCorrect ? 0 : 1, isCorrect ? 1 : 0, timeTaken, activeProgress.id);

    let endgame = false
    if(!isCorrect && session.mode == "streak"){
        endgame = true
    } else if(isCorrect && session.mode == "time-attack"){
        const getAnsweredRegionsStmt = db.prepare(`SELECT COUNT(*) as count FROM gameprogress WHERE sessionId = ? AND isCorrect = 1`);
        const answeredRegions = getAnsweredRegionsStmt.get(sessionId);
        if(answeredRegions.count >= validRegions[session.atlas].length){
            endgame = true
        }
    }
    // Respond with the result
    res.status(200).send({
        message: isCorrect ? "Correct guess!" : "Incorrect guess.",
        isCorrect,
        endgame,
        regionId,
        voxelValue,
    });
}