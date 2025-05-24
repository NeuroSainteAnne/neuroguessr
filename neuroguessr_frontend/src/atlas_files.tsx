const atlasFiles : Record<string, {nii: string, json: string, name: string}> = {
    'harvard-oxford': {
        nii: 'HarvardOxford-cort-maxprob-thr25-1mm.nii.gz',
        json: 'harvard_oxford.json',
        name: 'Harvard-Oxford'
    },
    'tissues': {
        nii: 'mni152_pveseg.nii.gz',
        json: 'tissue.json',
        name: 'Tissue'
    },
    'destrieux': {
        nii: 'remapped_destrieux_stride_uint.nii.gz',
        json: 'destrieux_new.json',
        name: 'Destrieux'
    },
    'desikan': {
        nii: 'remapped_dk_stride.nii.gz',
        json: 'desikan_new.json',
        name: 'Desikan'
    },
    'allen': {
        nii: 'reconstructed_allen_05mm_uint.nii.gz',
        json: 'allen.json',
        name: 'Allen'
    },
    'yeo7': {
        nii: 'Yeo-7-liberal_space-MNI152NLin6_res-1x1x1.nii.gz',
        json: 'yeo7.json',
        name: 'Yeo7'
    },
    'yeo17': {
        nii: 'Yeo-17-liberal_space-MNI152NLin6_res-1x1x1.nii.gz',
        json: 'yeo17.json',
        name: 'Yeo17'
    },
    'subcortical': {
        nii: 'ICBM2009b_asym-SubCorSeg-1mm_nn_regrid.nii.gz',
        json: 'subcortical.json',
        name: 'Subcortical'
    },
    'cerebellum': {
        nii: 'Cerebellum-MNIfnirt-maxprob-thr25-1mm.nii.gz',
        json: 'cerebellum.json',
        name: 'Cerebellum'
    },
    'xtract': {
        nii: 'xtract_web.nii.gz',
        json: 'xtract_labels.json',
        name: 'White Matter'
    },
    'thalamus': {
        nii: 'Thalamus_Nuclei-HCP-MaxProb.nii.gz',
        json: 'thalamus7.json',
        name: 'Thalamus'
    },
    'HippoAmyg': {
        nii: 'HippoAmyg_web.nii.gz',
        json: 'HippoAmyg_labels.json',
        name: 'Hippocampus & Amygdala'
    },
    'JHU': {
        nii: 'JHU_web.nii.gz',
        json: 'JHU_labels.json',
        name: 'JHU'
    },
    'territories': {
        nii: 'ArterialAtlas_stride_round.nii.gz',
        json: 'artery_territories.json',
        name: 'Territories'
    }
};

export default atlasFiles