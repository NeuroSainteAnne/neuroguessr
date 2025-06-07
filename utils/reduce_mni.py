# -*- coding: utf-8 -*-
"""
Created on Tue Jun  3 19:17:29 2025

@author: alamazy
"""
import nibabel as nib
import numpy as np
from nilearn.image import resample_img, crop_img

input_path = "../frontend/src/atlas/mni152.nii.gz"
output_path = "../frontend/src/atlas/mni152_downsampled.nii.gz"
new_voxel_size = 1.2  # or 4.0, etc.
target_dtype = np.uint8

# ---- LOAD IMAGE ----
img = nib.load(input_path)
print(f"Original shape: {img.shape}, dtype: {img.get_data_dtype()}, affine:\n{img.affine}")

# ---- DOWNSAMPLE ----
orig_affine = img.affine.copy()
orig_zooms = img.header.get_zooms()[:3]

# Compute new affine: scale the diagonal, keep the translation
scale = new_voxel_size / orig_zooms[0]  # assumes isotropic
new_affine = orig_affine.copy()
new_affine[:3, :3] *= scale

resampled = resample_img(img, target_affine=new_affine, interpolation='linear')

# Crop
cropped = crop_img(resampled)

# Change dtype
data = cropped.get_fdata().astype(target_dtype)
new_img = nib.Nifti1Image(data, cropped.affine, cropped.header)
new_img.set_data_dtype(target_dtype)
new_img.to_filename(output_path)
print(f"Saved: {output_path}")