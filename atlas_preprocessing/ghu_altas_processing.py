import nibabel as nib
import numpy as np
from tqdm import tqdm
import pandas as pd
import json

original_ghu = nib.load("unprocessed_atlases/ghu_atlas.nii.gz")
new_ghu_data = np.zeros(original_ghu.shape[0:3], dtype=np.uint8)
print(new_ghu_data.shape)
new_ghu_data[...] = original_ghu.dataobj[...]
new_ghu_data[64:] = new_ghu_data[0:64][::-1]
    
new_ghu = nib.Nifti1Image(new_ghu_data, original_ghu.affine, original_ghu.header)
new_ghu.header.set_intent(1002, (), 'GHU Atlas')
new_ghu.header.set_data_dtype(np.uint8)
nib.save(new_ghu, "processed_atlases/ghu_atlas.nii.gz")

original_csv = pd.read_csv("unprocessed_atlases/ghu_atlas.csv", sep=";")
singlecenter = {
    "R":[0],
    "G":[0],
    "B":[0],
    "I":[0],
    "labels":["Background"]
}
for i in tqdm(range(68)):
    singlecenter["R"].append(i+1)
    singlecenter["G"].append(i+1)
    singlecenter["B"].append(i+1)
    singlecenter["I"].append(i+1)
    singlecenter["labels"].append(original_csv.iloc[i]["Name"])

with open('singlecenter_json/fr/ghu_atlas.json', 'w', encoding='utf-8') as f:
    json.dump(singlecenter, f, ensure_ascii=False, indent=4)