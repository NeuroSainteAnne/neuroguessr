# NeuroGuessr Web

## Overview

NeuroGuessr Web is an interactive web application designed to help learning brain anatomy. 

## Features

- **Atlas Selection**: Choose from multiple brain atlases (AAL, Harvard-Oxford, Brodmann, Subcortical, Cerebellum ...).
- **Game Modes**:
  - **Practice**: attempts to find regions with feedback.
  - **Streak**: Count consecutive correct guesses until a mistake.
  - **Time Attack**: Find all regions of an atlas in a minimal time
- **Visualization**: Interactive brain viewer with axial, coronal, sagittal slices, and 3D rendering.


## Website

  - HTML, CSS, JavaScript 
  - **Niivue**: web-based visualization tool for neuroimaging [https://github.com/niivue/niivue]

- **Data**:
  - **Brain Atlases**:
    - Tissue classes
    - Harvard-Oxford : Probabilistic atlases covering 48 cortical and 21 subcortical structural areas, derived from structural data and segmentation (doi:10.1016/j.schres.2005.11.020, 10.1016/j.neuroimage.2006.01.021, 10.1176/appi.ajp.162.7.1256, 10.1016/j.biopsych.2006.06.027)
    - Destrieux Atlas, Sulcal-gyral parcellation (Ref : doi:10.1016/j.neuroimage.2010.06.010)
    - Allen Humain Brain Reference : 141 manually delineated regions per hemisphere (Ref : 10.1002/cne.24080)
    - Subcortical Registration of  basal ganglia, red nucleus, amygdala, and hippocampus (Ref : https://www.nature.com/articles/s41597-019-0217-0)
    - Cerebellum Cerebellar Atlas in MNI152 space after normalization with FNIRT (FSL)
    - Thalamus nuclei 
    - Hippocampus & amygdala subfields
    - Resting state functional networks : (Thomas Yeo, 7 and 17 networks)
    - White matter tracts (Xtract, FSL)
    - White matter (JHU) : "Tract probability maps in stereotaxic spaces: Analyses of white matter anatomy and tract-specific quantification". DOI https://doi.org/10.1016/j.neuroimage.2007.07.053
    - Arterial Atlas : "an atlas of brain arterial territories based on lesion distributions in 1,298 acute stroke patients. The atlas covers supra- and infra-tentorial regions and contains hierarchical segmentation levels created by a fusion of vascular and classical anatomical criteria. This deformable 3D digital atlas can be readily used by the clinical and research communities, enabling automatic and highly reproducible exploration of large-scaled data.". https://www.nature.com/articles/s41597-0
  - **JSON Files**: Label mappings for each atlas, used for region identification and display.

## Usage

1. Install prerequisites

- Install [Node.js](https://nodejs.org/en/download). Neuroguessr has been tested with node 22.11 and node 24.0
- Install [Postgresql](https://www.postgresql.org/download) and create a database. Don't worry, the tables will be created automatically at first launch

2. Configure your server

- copy `backend/config-example.json` to `backend/config.json` and change parameters accordingly
- copy `frontend/config-example.json` to `frontend/config.json` and change parameters accordingly
- (HTTPS only) Put your server certificates in `server/server.crt` and `server/server.key`

3. Run the following commands:

```
npm install
npm run build-frontend
npm run start-backend
```

## License

This project is licensed under the MIT License - see the [LICENSE] file for details.

## Authors 
François Ramon
francois.ramon@ghu-paris.fr 
Joseph Benzakoun 
j.benzakoun@ghu-paris.fr
