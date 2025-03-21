self.onmessage = function(e) {
    const { imageData, width, height } = e.data;

    // Update progress
    self.postMessage({ type: 'progress', progress: 5 });

    // Step 1: Create a grayscale version for analysis
    const grayscale = createGrayscale(imageData.data, width, height);
    self.postMessage({ type: 'progress', progress: 10 });

    // Step 2: Detect edges using Canny-like algorithm
    const edges = detectEdges(imageData.data, width, height);
    self.postMessage({ type: 'progress', progress: 20 });

    // Step 3: Analyze color distribution
    const { foregroundColors, backgroundColors } = analyzeColorDistribution(imageData.data, width, height, edges);
    self.postMessage({ type: 'progress', progress: 30 });

    // Step 4: Create initial mask using color and edge information
    const mask = createInitialMask(imageData.data, width, height, foregroundColors, backgroundColors, edges);
    self.postMessage({ type: 'progress', progress: 50 });

    // Step 5: Refine mask using graph-cut like algorithm
    const refinedMask = refineMask(mask, imageData.data, width, height);
    self.postMessage({ type: 'progress', progress: 70 });

    // Step 6: Apply mask to image with smart edge handling
    applyMaskToImage(imageData.data, refinedMask, width, height);
    self.postMessage({ type: 'progress', progress: 90 });

    // Step 7: Final edge refinement
    refineEdges(imageData.data, width, height);

    // Send the processed image data back
    self.postMessage({ type: 'complete', imageData: imageData });
};

function createGrayscale(data, width, height) {
    const grayscale = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Convert to grayscale using luminance formula
        grayscale[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return grayscale;
}

function detectEdges(data, width, height) {
    const grayscale = createGrayscale(data, width, height);
    const edges = new Uint8Array(width * height);

    // Step 1: Apply Gaussian blur to reduce noise
    const blurred = applyGaussianBlur(grayscale, width, height);

    // Step 2: Compute gradient magnitude and direction
    const { magnitude, direction } = computeGradient(blurred, width, height);

    // Step 3: Non-maximum suppression
    const suppressed = nonMaximumSuppression(magnitude, direction, width, height);

    // Step 4: Hysteresis thresholding
    hysteresisThresholding(suppressed, edges, width, height, 20, 50);

    return edges;
}

function applyGaussianBlur(grayscale, width, height) {
    const result = new Uint8Array(width * height);
    const kernel = [
        [2, 4, 5, 4, 2],
        [4, 9, 12, 9, 4],
        [5, 12, 15, 12, 5],
        [4, 9, 12, 9, 4],
        [2, 4, 5, 4, 2]
    ];
    const kernelSum = 159;

    for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
            let sum = 0;

            for (let ky = 0; ky < 5; ky++) {
                for (let kx = 0; kx < 5; kx++) {
                    const pixelPos = (y + ky - 2) * width + (x + kx - 2);
                    sum += grayscale[pixelPos] * kernel[ky][kx];
                }
            }

            result[y * width + x] = Math.round(sum / kernelSum);
        }
    }

    return result;
}

function computeGradient(grayscale, width, height) {
    const magnitude = new Uint8Array(width * height);
    const direction = new Uint8Array(width * height);

    // Sobel operators
    const sobelX = [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
    ];
    const sobelY = [
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1]
    ];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0;
            let gy = 0;

            for (let ky = 0; ky < 3; ky++) {
                for (let kx = 0; kx < 3; kx++) {
                    const pixelPos = (y + ky - 1) * width + (x + kx - 1);
                    gx += grayscale[pixelPos] * sobelX[ky][kx];
                    gy += grayscale[pixelPos] * sobelY[ky][kx];
                }
            }

            // Calculate gradient magnitude
            const mag = Math.sqrt(gx * gx + gy * gy);
            magnitude[y * width + x] = Math.min(255, Math.round(mag));

            // Calculate gradient direction (0, 45, 90, 135 degrees)
            const angle = Math.atan2(gy, gx) * 180 / Math.PI;
            if ((angle >= -22.5 && angle < 22.5) || (angle >= 157.5 || angle < -157.5)) {
                direction[y * width + x] = 0; // 0 degrees
            } else if ((angle >= 22.5 && angle < 67.5) || (angle >= -157.5 && angle < -112.5)) {
                direction[y * width + x] = 45; // 45 degrees
            } else if ((angle >= 67.5 && angle < 112.5) || (angle >= -112.5 && angle < -67.5)) {
                direction[y * width + x] = 90; // 90 degrees
            } else {
                direction[y * width + x] = 135; // 135 degrees
            }
        }
    }

    return { magnitude, direction };
}

function nonMaximumSuppression(magnitude, direction, width, height) {
    const result = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const dir = direction[idx];
            const mag = magnitude[idx];

            let neighbor1, neighbor2;

            // Check neighbors based on gradient direction
            if (dir === 0) { // East-West
                neighbor1 = magnitude[idx - 1];
                neighbor2 = magnitude[idx + 1];
            } else if (dir === 45) { // Northeast-Southwest
                neighbor1 = magnitude[(y - 1) * width + (x + 1)];
                neighbor2 = magnitude[(y + 1) * width + (x - 1)];
            } else if (dir === 90) { // North-South
                neighbor1 = magnitude[(y - 1) * width + x];
                neighbor2 = magnitude[(y + 1) * width + x];
            } else { // Northwest-Southeast
                neighbor1 = magnitude[(y - 1) * width + (x - 1)];
                neighbor2 = magnitude[(y + 1) * width + (x + 1)];
            }

            // Keep pixel if it's a local maximum
            if (mag >= neighbor1 && mag >= neighbor2) {
                result[idx] = mag;
            } else {
                result[idx] = 0;
            }
        }
    }

    return result;
}

function hysteresisThresholding(suppressed, edges, width, height, lowThreshold, highThreshold) {
    // First pass: mark strong edges
    const strongEdges = new Set();
    const weakEdges = [];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const val = suppressed[idx];

            if (val >= highThreshold) {
                edges[idx] = 255;
                strongEdges.add(idx);
            } else if (val >= lowThreshold) {
                weakEdges.push(idx);
            } else {
                edges[idx] = 0;
            }
        }
    }

    // Second pass: trace weak edges connected to strong edges
    const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

    for (const weakIdx of weakEdges) {
        const x = weakIdx % width;
        const y = Math.floor(weakIdx / width);
        let isConnected = false;

        // Check 8-connected neighbors
        for (let i = 0; i < 8; i++) {
            const nx = x + dx[i];
            const ny = y + dy[i];

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const neighborIdx = ny * width + nx;
                if (strongEdges.has(neighborIdx)) {
                    isConnected = true;
                    break;
                }
            }
        }

        edges[weakIdx] = isConnected ? 255 : 0;
    }
}

function analyzeColorDistribution(data, width, height, edges) {
    // Create color clusters
    const colorClusters = new Map();
    const edgePixels = new Set();

    // Identify edge pixels
    for (let i = 0; i < edges.length; i++) {
        if (edges[i] > 0) {
            edgePixels.add(i);
        }
    }

    // Analyze colors
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;

        // Skip edge pixels for color analysis
        if (edgePixels.has(idx)) continue;

        const r = Math.floor(data[i] / 8) * 8;
        const g = Math.floor(data[i + 1] / 8) * 8;
        const b = Math.floor(data[i + 2] / 8) * 8;
        const key = `${r},${g},${b}`;

        if (!colorClusters.has(key)) {
            colorClusters.set(key, {
                count: 0,
                color: [r, g, b],
                pixels: []
            });
        }

        const cluster = colorClusters.get(key);
        cluster.count++;

        // Store pixel positions (limit to avoid memory issues)
        if (cluster.pixels.length < 1000) {
            const x = idx % width;
            const y = Math.floor(idx / width);
            cluster.pixels.push([x, y]);
        }
    }

    // Sort clusters by frequency
    const sortedClusters = Array.from(colorClusters.values())
        .sort((a, b) => b.count - a.count);

    // Determine foreground and background colors
    const backgroundColors = [];
    const foregroundColors = [];

    // Analyze spatial distribution of top clusters
    const topClusters = sortedClusters.slice(0, Math.min(10, sortedClusters.length));

    for (const cluster of topClusters) {
        const isPeripheral = isClusterPeripheral(cluster.pixels, width, height);

        if (isPeripheral) {
            backgroundColors.push(cluster.color);
        } else {
            foregroundColors.push(cluster.color);
        }
    }

    // Ensure we have at least some colors in each category
    if (backgroundColors.length === 0 && topClusters.length > 0) {
        backgroundColors.push(topClusters[0].color);
    }

    if (foregroundColors.length === 0 && topClusters.length > 1) {
        foregroundColors.push(topClusters[1].color);
    }

    return { foregroundColors, backgroundColors };
}

function isClusterPeripheral(pixels, width, height) {
    if (pixels.length === 0) return false;

    const borderThreshold = 0.6; // 60% of pixels need to be near border
    let borderPixels = 0;
    const borderDistance = Math.min(width, height) * 0.1; // 10% of image dimension

    for (const [x, y] of pixels) {
        if (x < borderDistance || x > width - borderDistance ||
            y < borderDistance || y > height - borderDistance) {
            borderPixels++;
        }
    }

    return borderPixels / pixels.length > borderThreshold;
}

function createInitialMask(data, width, height, foregroundColors, backgroundColors, edges) {
    const mask = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const i = idx * 4;

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Check if pixel is on an edge
            if (edges[idx] > 0) {
                mask[idx] = 128; // Mark as uncertain
                continue;
            }

            // Calculate color similarity to foreground and background
            let minFgDist = Number.MAX_VALUE;
            let minBgDist = Number.MAX_VALUE;

            for (const fgColor of foregroundColors) {
                const dist = colorDistance([r, g, b], fgColor);
                minFgDist = Math.min(minFgDist, dist);
            }

            for (const bgColor of backgroundColors) {
                const dist = colorDistance([r, g, b], bgColor);
                minBgDist = Math.min(minBgDist, dist);
            }

            // Assign to foreground or background based on color similarity
            if (minFgDist < minBgDist) {
                mask[idx] = 255; // Foreground
            } else {
                mask[idx] = 0; // Background
            }
        }
    }

    return mask;
}

function colorDistance(color1, color2) {
    return Math.sqrt(
        Math.pow(color1[0] - color2[0], 2) +
        Math.pow(color1[1] - color2[1], 2) +
        Math.pow(color1[2] - color2[2], 2)
    );
}

function refineMask(mask, data, width, height) {
    const refined = new Uint8Array(mask);
    const iterations = 3;

    for (let iter = 0; iter < iterations; iter++) {
        // Create a copy of the current mask
        const current = new Uint8Array(refined);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;

                // Skip definite foreground/background
                if (current[idx] === 0 || current[idx] === 255) continue;

                // Count foreground and background neighbors
                let fgCount = 0;
                let bgCount = 0;

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;

                        const nx = x + dx;
                        const ny = y + dy;
                        const nidx = ny * width + nx;

                        if (current[nidx] === 255) fgCount++;
                        if (current[nidx] === 0) bgCount++;
                    }
                }

                // Decide based on neighborhood
                if (fgCount > bgCount) {
                    refined[idx] = 255;
                } else if (bgCount > fgCount) {
                    refined[idx] = 0;
                }
                // If equal, leave as uncertain
            }
        }
    }

    // Final pass to resolve any remaining uncertain pixels
    for (let i = 0; i < refined.length; i++) {
        if (refined[i] === 128) {
            // Check surrounding pixels in a larger neighborhood
            const x = i % width;
            const y = Math.floor(i / width);
            let fgCount = 0;
            let bgCount = 0;

            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;

                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nidx = ny * width + nx;
                        if (refined[nidx] === 255) fgCount++;
                        if (refined[nidx] === 0) bgCount++;
                    }
                }
            }

            refined[i] = fgCount >= bgCount ? 255 : 0;
        }
    }

    return refined;
}

function applyMaskToImage(data, mask, width, height) {
    for (let i = 0; i < mask.length; i++) {
        const alpha = mask[i];
        data[i * 4 + 3] = alpha;
    }
}

function refineEdges(data, width, height) {
    const tempData = new Uint8ClampedArray(data);
    const kernelSize = 2;

    for (let y = kernelSize; y < height - kernelSize; y++) {
        for (let x = kernelSize; x < width - kernelSize; x++) {
            const idx = (y * width + x) * 4;

            // Only process semi-transparent pixels
            if (data[idx + 3] > 0 && data[idx + 3] < 255) {
                let alphaSum = 0;
                let weightSum = 0;

                for (let dy = -kernelSize; dy <= kernelSize; dy++) {
                    for (let dx = -kernelSize; dx <= kernelSize; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        const nidx = (ny * width + nx) * 4;

                        // Calculate weight based on color similarity and distance
                        const colorSimilarity = 1 - (
                            Math.abs(tempData[idx] - tempData[nidx]) +
                            Math.abs(tempData[idx + 1] - tempData[nidx + 1]) +
                            Math.abs(tempData[idx + 2] - tempData[nidx + 2])
                        ) / 765;

                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const weight = colorSimilarity / (1 + distance);

                        alphaSum += tempData[nidx + 3] * weight;
                        weightSum += weight;
                    }
                }

                // Apply weighted average alpha
                data[idx + 3] = Math.round(alphaSum / weightSum);
            }
        }
    }
}