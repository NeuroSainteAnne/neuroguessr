const atlasFiles : Record<string, {nii: string, json: string, viewer: string, name: string}> = {
    'harvard-oxford': {
        nii: 'HarvardOxford-cort-maxprob-thr25-1mm.nii.gz',
        json: 'harvard_oxford.json',
        viewer: 'neurotheka.html',
        name: 'Harvard-Oxford'
    },
    'tissues': {
        nii: 'mni152_pveseg.nii.gz',
        json: 'tissue.json',
        viewer: 'neurotheka.html',
        name: 'Tissue'
    },
    'destrieux': {
        nii: 'remapped_destrieux_stride_uint.nii.gz',
        json: 'destrieux_new.json',
        viewer: 'neurotheka.html',
        name: 'Destrieux'
    },
    'desikan': {
        nii: 'remapped_dk_stride.nii.gz',
        json: 'desikan_new.json',
        viewer: 'neurotheka.html',
        name: 'Desikan'
    },
    'allen': {
        nii: 'reconstructed_allen_05mm_uint.nii.gz',
        json: 'allen.json',
        viewer: 'neurotheka.html',
        name: 'Allen'
    },
    'yeo7': {
        nii: 'Yeo-7-liberal_space-MNI152NLin6_res-1x1x1.nii.gz',
        json: 'yeo7.json',
        viewer: 'neurotheka.html',
        name: 'Yeo7'
    },
    'yeo17': {
        nii: 'Yeo-17-liberal_space-MNI152NLin6_res-1x1x1.nii.gz',
        json: 'yeo17.json',
        viewer: 'neurotheka.html',
        name: 'Yeo17'
    },
    'subcortical': {
        nii: 'ICBM2009b_asym-SubCorSeg-1mm_nn_regrid.nii.gz',
        json: 'subcortical.json',
        viewer: 'neurotheka.html',
        name: 'Subcortical'
    },
    'cerebellum': {
        nii: 'Cerebellum-MNIfnirt-maxprob-thr25-1mm.nii.gz',
        json: 'cerebellum.json',
        viewer: 'neurotheka.html',
        name: 'Cerebellum'
    },
    'xtract': {
        nii: 'xtract_web.nii.gz',
        json: 'xtract_labels.json',
        viewer: 'neurotheka.html',
        name: 'White Matter'
    },
    'thalamus': {
        nii: 'Thalamus_Nuclei-HCP-MaxProb.nii.gz',
        json: 'thalamus7.json',
        viewer: 'neurotheka.html',
        name: 'Thalamus'
    },
    'HippoAmyg': {
        nii: 'HippoAmyg_web.nii.gz',
        json: 'HippoAmyg_labels.json',
        viewer: 'neurotheka.html',
        name: 'Hippocampus & Amygdala'
    },
    'JHU': {
        nii: 'JHU_web.nii.gz',
        json: 'JHU_labels.json',
        viewer: 'neurotheka.html',
        name: 'JHU'
    },
    'territories': {
        nii: 'ArterialAtlas_stride_round.nii.gz',
        json: 'artery_territories.json',
        viewer: 'neurotheka.html',
        name: 'Territories'
    }
};

export default atlasFiles