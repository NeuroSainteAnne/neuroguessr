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

  - HTML5, CSS3, JavaScript (ES6): Core logic for game mechanics, UI interactions, and atlas loading.
  - **Niivue**: WebGL-based library for rendering and interacting with 3D brain imaging data (`.nii.gz` files).

- **Data**:
  - **Brain Atlases**:
    - AAL (`aal.nii.gz`, `aal.json`)
    - Harvard-Oxford (`HarvardOxford-cort-maxprob-thr25-1mm.nii.gz`, `harvard_oxford.json`)
    - Brodmann (`brodmann_grid.nii.gz`, `brodmann.json`)
    - Subcortical (`ICBM2009b_asym-SubCorSeg-1mm_nn_regrid.nii.gz`, `subcortical.json`)
    - Cerebellum (`Cerebellum-MNIfnirt-maxprob-thr25-1mm.nii.gz`, `cerebellum.json`)
    - Base brain model: MNI152 (`mni152.nii.gz`)
  - **JSON Files**: Label mappings for each atlas, used for region identification and display.


## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author 
François Ramon
francois.ramon@ghu-paris.fr 
