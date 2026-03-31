
export const atlasCategories = [
    "cortical_regions",
    "subcortical_regions",
    "white_matter_tracts",
    "functional_networks",
    "cerebral_arteries"
]

const atlasFiles : Record<string, {nii: string, json: string, name: string, atlas_category:string, difficulty: number, info: boolean}> = {
    'harvard-oxford': {
        atlas_category: 'cortical_regions',
        nii: 'HarvardOxford-cort-maxprob-thr25-1mm.nii.gz',
        json: 'harvard_oxford.json',
        name: 'Harvard-Oxford',
        difficulty: 1,
        info: true
    },
    'tissues': {
        atlas_category: 'cortical_regions',
        nii: 'mni152_pveseg.nii.gz',
        json: 'tissue.json',
        name: 'Tissue',
        difficulty: 0,
        info: false
    },
    'destrieux': {
        atlas_category: 'cortical_regions',
        nii: 'remapped_destrieux_stride_uint.nii.gz',
        json: 'destrieux_new.json',
        name: 'Destrieux',
        difficulty: 3,
        info: false
    },
    'desikan': {
        atlas_category: 'cortical_regions',
        nii: 'remapped_dk_stride.nii.gz',
        json: 'desikan_new.json',
        name: 'Desikan',
        difficulty: 2,
        info: false
    },
    'allen': {
        atlas_category: 'cortical_regions',
        nii: 'reconstructed_allen_05mm_uint.nii.gz',
        json: 'allen.json',
        name: 'Allen',
        difficulty: 4,
        info: false
    },
    'yeo7': {
        atlas_category: 'functional_networks',
        nii: 'Yeo-7-liberal_space-MNI152NLin6_res-1x1x1.nii.gz',
        json: 'yeo7.json',
        name: 'Yeo7',
        difficulty: 1,
        info: false
    },
    'yeo17': {
        atlas_category: 'functional_networks',
        nii: 'Yeo-17-liberal_space-MNI152NLin6_res-1x1x1.nii.gz',
        json: 'yeo17.json',
        name: 'Yeo17',
        difficulty: 2,
        info: false
    },
    'subcortical': {
        atlas_category: 'subcortical_regions',
        nii: 'ICBM2009b_asym-SubCorSeg-1mm_nn_regrid.nii.gz',
        json: 'subcortical.json',
        name: 'Subcortical',
        difficulty: 2,
        info: true
    },
    'cerebellum': {
        atlas_category: 'subcortical_regions',
        nii: 'Cerebellum-MNIfnirt-maxprob-thr25-1mm.nii.gz',
        json: 'cerebellum.json',
        name: 'Cerebellum',
        difficulty: 2,
        info: false
    },
    'thalamus': {
        atlas_category: 'subcortical_regions',
        nii: 'Thalamus_Nuclei-HCP-MaxProb.nii.gz',
        json: 'thalamus7.json',
        name: 'Thalamus',
        difficulty: 3,
        info: false
    },
    'HippoAmyg': {
        atlas_category: 'subcortical_regions',
        nii: 'HippoAmyg_web.nii.gz',
        json: 'HippoAmyg_labels.json',
        name: 'Hippocampus & Amygdala',
        difficulty: 3,
        info: false
    },
    'xtract': {
        atlas_category: 'white_matter_tracts',
        nii: 'xtract_web.nii.gz',
        json: 'xtract_labels.json',
        name: 'White Matter',
        difficulty: 2,
        info: true
    },
    'territories': {
        atlas_category: 'cerebral_arteries',
        nii: 'ArterialAtlas_stride_round.nii.gz',
        json: 'artery_territories.json',
        name: 'Territories',
        difficulty: 2,
        info: false
    },
    'bsa': {
        atlas_category: 'cortical_regions',
        nii: 'bsa_atlas.nii.gz',
        json: 'bsa_atlas.json',
        name: 'BSA Atlas',
        difficulty: 2,
        info: false
    }
};

export default atlasFiles;