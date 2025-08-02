import os
import json
import numpy as np
import nibabel as nib
from nibabel.affines import apply_affine
from scipy.ndimage import label, center_of_mass
from tqdm import tqdm

atlas_files = {
"""    "harvard-oxford": {
        "nii": "HarvardOxford-cort-maxprob-thr25-1mm.nii.gz",
        "json": "harvard_oxford.json",
        "bilateral": True
    },
    "tissues": {
        "nii": "mni152_pveseg.nii.gz",
        "json": "tissue.json",
        "bilateral": True
    },
    "destrieux": {
        "nii": "remapped_destrieux_stride_uint.nii.gz",
        "json": "destrieux_new.json",
        "bilateral": False
    },
    "desikan": {
        "nii": "remapped_dk_stride.nii.gz",
        "json": "desikan_new.json",
        "bilateral": False
    },
    "allen": {
        "nii": "reconstructed_allen_05mm_uint.nii.gz",
        "json": "allen.json",
        "bilateral": False
    },
    "yeo7": {
        "nii": "Yeo-7-liberal_space-MNI152NLin6_res-1x1x1.nii.gz",
        "json": "yeo7.json",
        "bilateral": True
    },
    "yeo17": {
        "atlas_category": "functional_networks",
        "nii": "Yeo-17-liberal_space-MNI152NLin6_res-1x1x1.nii.gz",
        "json": "yeo17.json",
        "bilateral": True
    },
    "subcortical": {
        "nii": "ICBM2009b_asym-SubCorSeg-1mm_nn_regrid.nii.gz",
        "json": "subcortical.json",
        "bilateral": False
    },
    "cerebellum": {
        "nii": "Cerebellum-MNIfnirt-maxprob-thr25-1mm.nii.gz",
        "json": "cerebellum.json",
        "bilateral": False
    },
    "thalamus": {
        "nii": "Thalamus_Nuclei-HCP-MaxProb.nii.gz",
        "json": "thalamus7.json",
        "bilateral": False
    },
    "HippoAmyg": {
        "nii": "HippoAmyg_web.nii.gz",
        "json": "HippoAmyg_labels.json",
        "bilateral": False
    },
    "xtract": {
        "nii": "xtract_web.nii.gz",
        "json": "xtract_labels.json",
        "bilateral": False
    },
    "JHU": {
        "nii": "JHU_web.nii.gz",
        "json": "JHU_labels.json",
        "bilateral": False
    },"""
    "territories": {
        "nii": "ArterialAtlas_stride_round.nii.gz",
        "json": "artery_territories.json",
        "bilateral": False
    }
}

NIFTI_DIR = "./processed_atlases"  
JSON_DIR = "./singlecenter_json"
OUTPUT_DIR = "./multicenter_json"
LANGUAGES = ["en","fr"]


def split_bilateral(data, affine):
    """Splits bilateral atlas at midline (x=0 in MNI space)."""
    # Find midline in voxel coordinates
    x_coords = np.arange(data.shape[0])
    mni_x = apply_affine(affine, np.c_[x_coords, np.zeros_like(x_coords), np.zeros_like(x_coords)])
    mid_idx = np.argmin(np.abs(mni_x[:, 0]))
    left = np.zeros_like(data)
    right = np.zeros_like(data)
    left[:mid_idx, :, :] = data[:mid_idx, :, :]
    right[mid_idx:, :, :] = data[mid_idx:, :, :]
    return left, right

def get_roi_centers(data, bilateral = False, affine = None):
    """Returns a dict: region_label -> list of centers (one per connected component)."""
    centers = [[[0,0,0]]]
    labels = [label for label in np.unique(data) if label != 0]

    if bilateral and affine is not None:
        # Split data at midline
        x_coords = np.arange(data.shape[0])
        mni_x = apply_affine(affine, np.c_[x_coords, np.zeros_like(x_coords), np.zeros_like(x_coords)])
        mid_idx = np.argmin(np.abs(mni_x[:, 0]))
        left_data = np.zeros_like(data)
        right_data = np.zeros_like(data)
        left_data[:mid_idx, :, :] = data[:mid_idx, :, :]
        right_data[mid_idx:, :, :] = data[mid_idx:, :, :]

        for label_val in tqdm(labels):
            # Left hemisphere
            mask_left = (left_data == label_val)
            labeled_left, num_left = label(mask_left)
            left_centers = []
            for i in range(1, num_left + 1):
                com = center_of_mass(mask_left, labeled_left, i)
                sum_vox = np.sum(labeled_left == i)
                if sum_vox > 10:
                    left_centers.append([round(float(x)) for x in com])

            # Right hemisphere
            mask_right = (right_data == label_val)
            labeled_right, num_right = label(mask_right)
            right_centers = []
            for i in range(1, num_right + 1):
                com = center_of_mass(mask_right, labeled_right, i)
                sum_vox = np.sum(labeled_right == i)
                if sum_vox > 10:
                    right_centers.append([float(x) for x in com])

            centers.append(left_centers + right_centers)
    else:
        for label_val in tqdm(labels):
            mask = (data == label_val)
            labeled, num = label(mask)
            label_centers = []
            for i in range(1, num + 1):
                com = center_of_mass(mask, labeled, i)
                sum_vox = np.sum(labeled == i)
                if sum_vox > 10:
                    label_centers.append([float(x) for x in com])
            centers.append(label_centers)

    return centers


for atlas_name, atlas_info in atlas_files.items():
    print(f"Processing {atlas_name}...")
    nii_path = os.path.join(NIFTI_DIR, atlas_info["nii"])

    # Load NIfTI
    img = nib.load(nii_path)
    data = img.get_fdata()
    affine = img.affine
    print(affine)

    # Split bilateral if needed
    centers = {}
    centers = get_roi_centers(data, atlas_info["bilateral"], affine)

    adjusted_centers = []
    for idx, label_centers in enumerate(centers):
        if idx == 0:
            adjusted_centers.append(label_centers)
        else:
            print(label_centers)
            adjusted = [ [int(round(x)) for x in apply_affine(affine, center[0:3])] for center in label_centers ]
            adjusted_centers.append(adjusted)

    for lang in LANGUAGES:
        json_path = os.path.join(JSON_DIR, lang, atlas_info["json"])
        output_json_path = os.path.join(OUTPUT_DIR, lang, atlas_info["json"])
        os.makedirs(os.path.dirname(output_json_path), exist_ok=True)

        # Load JSON
        with open(json_path, "r", encoding="utf-8") as f:
            atlas_json = json.load(f)

        # Update JSON
        atlas_json["centers"] = adjusted_centers

        # Save updated JSON
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(atlas_json, f, indent=2)
        print(f"Saved: {output_json_path}")
