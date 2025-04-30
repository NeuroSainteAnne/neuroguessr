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
  - **Niivue**: web-based visualization tool for neuroimaging [https://github.com/niivue/niivue]

- **Data**:
  - **Brain Atlases**:
    - AAL3
    - Harvard-Oxford 
    - Brodmann (do not work for now)
    - Subcortical 
    - Cerebellum 
    - White matter tracts (Xtract)
    - Thalamus nuclei (low res)
    - Hippocampus & amygdala subfields (low res)
    - White matter (JHU)
  - **JSON Files**: Label mappings for each atlas, used for region identification and display.


## License

This project is licensed under the MIT License - see the [LICENSE] file for details.

## Author 
François Ramon
francois.ramon@ghu-paris.fr 
