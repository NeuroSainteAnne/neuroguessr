import random
import pandas as pd
def generate_random_numbers(n):
    """
    Generate a list of n random integers between 0 and 255.
    If n <= 256: all numbers are unique.
    If n > 256: ensures minimal repetition by sampling all unique values first.
    
    Parameters:
        n (int): Number of random integers to generate.

    Returns:
        List[int]: A list of n random integers between 0 and 255.
    """
    if n <= 256:
        return random.sample(range(256), n)
    else:
        unique_part = random.sample(range(256), 256)
        additional_part = [random.randint(0, 255) for _ in range(n - 256)]
        combined = unique_part + additional_part
        random.shuffle(combined)
        return combined

# Example usage:
random_numbers = generate_random_numbers(37)
print(random_numbers)


df = pd.read_csv("/Users/francoisramon/Downloads/Destrieux.csv")
column_list = df.iloc[:, 1].tolist()

print(column_list)
print(len(column_list))

import json
def print_json_list_lengths(filepath):
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    for key, value in data.items():
        print(f'{key} : {value[1]}')

# Example usage
print_json_list_lengths('/Users/francoisramon/Desktop/These/neuroguessr_web/data/glasser_neuroparc.json')