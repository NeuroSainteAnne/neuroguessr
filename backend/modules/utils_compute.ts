import { imageRef } from "./game.ts";

export function getDistance(centers: number[][], coordinates: { mm: number[]; vox: number[]; }, atlasName?: string, targetRegionId?: number): { distance: number; center: number[] | undefined; boundary: number[] | undefined; } {
    const [xMm, yMm, zMm] = coordinates.mm;
    let minDistance = Infinity;
    let nearestCenter: number[] | undefined = undefined;
    let nearestBoundary: number[] | undefined = undefined;

    for (const center of centers) {
        let distance: number;
        let boundaryPoint: number[] | null = null;

        if (atlasName && targetRegionId !== undefined && imageRef[atlasName]) {
            // Find the boundary point where the region begins along the line
            boundaryPoint = findRegionBoundary(coordinates, center, atlasName, targetRegionId);
            if (boundaryPoint) {
                // Calculate distance to the boundary point instead of center
                distance = Math.sqrt(
                    Math.pow(boundaryPoint[0] - xMm, 2) +
                    Math.pow(boundaryPoint[1] - yMm, 2) +
                    Math.pow(boundaryPoint[2] - zMm, 2)
                );
            } else {
                // Fallback to center distance if boundary not found
                distance = Math.sqrt(
                    Math.pow(center[0] - xMm, 2) +
                    Math.pow(center[1] - yMm, 2) +
                    Math.pow(center[2] - zMm, 2)
                );
            }
        } else {
            // Original distance calculation to center
            distance = Math.sqrt(
                Math.pow(center[0] - xMm, 2) +
                Math.pow(center[1] - yMm, 2) +
                Math.pow(center[2] - zMm, 2)
            );
        }

        if (distance < minDistance) {
            minDistance = distance;
            nearestCenter = center;
            nearestBoundary = boundaryPoint || undefined;
        }
    }
    return { distance: minDistance, center: nearestCenter, boundary: nearestBoundary };
}
function findRegionBoundary(guessCoords: { mm: number[]; vox: number[]; }, centerMm: number[], atlasName: string, targetRegionId: number): number[] | null {
    const [guessX, guessY, guessZ] = guessCoords.mm;
    const [centerX, centerY, centerZ] = centerMm;

    // Calculate direction vector from guess to center
    const dirX = centerX - guessX;
    const dirY = centerY - guessY;
    const dirZ = centerZ - guessZ;

    // Calculate total distance
    const totalDistance = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

    if (totalDistance === 0) return null; // Same point


    // Normalize direction vector
    const normX = dirX / totalDistance;
    const normY = dirY / totalDistance;
    const normZ = dirZ / totalDistance;

    // Sample along the line at 0.5mm intervals
    const stepSize = 0.5; // mm
    const numSteps = Math.ceil(totalDistance / stepSize);

    const atlasImage = imageRef[atlasName];

    for (let i = 0; i <= numSteps; i++) {
        const t = (i * stepSize) / totalDistance;
        if (t > 1) break; // Don't go beyond the center


        // Calculate current point along the line
        const currentMm = [
            guessX + t * dirX,
            guessY + t * dirY,
            guessZ + t * dirZ
        ];

        // Convert to voxel coordinates
        const currentVox = atlasImage.mm2vox(currentMm);

        // Check if this voxel belongs to the target region
        const voxelValue = atlasImage.getValue(
            Math.round(currentVox[0]),
            Math.round(currentVox[1]),
            Math.round(currentVox[2])
        );

        if (voxelValue === targetRegionId) {
            // Found the boundary - return this point
            return currentMm;
        }
    }

    // If no boundary found, return null
    return null;
}
