import nibabel as nib
import numpy as np
from tqdm import tqdm
import pandas as pd
import json

original_bsa = nib.load("unprocessed_atlases/bsa_atlas.nii.gz")
new_bsa_data = np.zeros(original_bsa.shape[0:3], dtype=np.uint8)
print(new_bsa_data.shape)
for i in tqdm(range(123)):
    new_bsa_data[original_bsa.dataobj[..., i] > 0.5] = i + 1

new_bsa = nib.Nifti1Image(new_bsa_data, original_bsa.affine, original_bsa.header)
new_bsa.header.set_intent(1002, (), 'BSA Atlas')
new_bsa.header.set_data_dtype(np.uint8)
nib.save(new_bsa, "processed_atlases/bsa_atlas.nii.gz")

original_csv = pd.read_csv("unprocessed_atlases/bsa_atlas.csv")
print(original_csv)
singlecenter = {
    "R":[0],
    "G":[0],
    "B":[0],
    "I":[0],
    "labels":["Background"]
}
for i in tqdm(range(123)):
    singlecenter["R"].append(i+1)
    singlecenter["G"].append(i+1)
    singlecenter["B"].append(i+1)
    singlecenter["I"].append(i+1)
    singlecenter["labels"].append(original_csv.iloc[i]["label"])

with open('singlecenter_json/en/bsa_atlas.json', 'w', encoding='utf-8') as f:
    json.dump(singlecenter, f, ensure_ascii=False, indent=4)