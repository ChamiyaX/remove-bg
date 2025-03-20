self.onmessage = function(e) {
    const { imageData, width, height } = e.data;

    // Process the image in chunks
    const chunkSize = 10000;
    const totalPixels = imageData.data.length / 4;
    let processedPixels = 0;

    // Create initial masks
    const foregroundMask = new Uint8Array(width * height);
    const backgroundMask = new Uint8Array(width * height);

    // Step 1: Initial segmentation
    const { fgColors, bgColors } = analyzeImage(imageData.data, width, height);

    // Step 2: Create edge map with enhanced sensitivity
    const edgeMap = createEdgeMap(imageData.data, width, height);

    // Step 3: Process image with enhanced algorithm
    for (let i = 0; i < imageData.data.length; i += chunkSize * 4) {
        processChunkEnhanced(
            imageData.data,
            foregroundMask,
            backgroundMask,
            edgeMap,
            i,
            Math.min(i + chunkSize * 4, imageData.data.length),
            width,
            height,
            fgColors,
            bgColors
        );

        // Update progress
        processedPixels += chunkSize;
        const progress = Math.min((processedPixels / totalPixels) * 100, 100);
        self.postMessage({ type: 'progress', progress: Math.round(progress) });
    }

    // Step 4: Refine edges and apply smart smoothing
    refineEdges(imageData.data, foregroundMask, backgroundMask, width, height);

    // Send the processed image data back
    self.postMessage({ type: 'complete', imageData: imageData });
};

function analyzeImage(data, width, height) {
    const colorStats = new Map();
    const edgePixels = new Set();

    // Collect color statistics and detect edges
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const color = [data[idx], data[idx + 1], data[idx + 2]];

            // Quantize colors for better grouping
            const key = color.map(c => Math.floor(c / 8) * 8).join(',');
            colorStats.set(key, (colorStats.get(key) || 0) + 1);

            // Check if pixel is on edge
            if (isEdgePixel(data, idx, width)) {
                edgePixels.add(`${x},${y}`);
            }
        }
    }

    // Separate colors into foreground and background
    return separateColors(colorStats, edgePixels, width, height);
}

function isEdgePixel(data, idx, width) {
    const threshold = 30;
    for (let c = 0; c < 3; c++) {
        const diff = Math.abs(data[idx + c] - data[idx + c + width * 4]) +
            Math.abs(data[idx + c] - data[idx + c + 4]);
        if (diff > threshold) return true;
    }
    return false;
}

function separateColors(colorStats, edgePixels, width, height) {
    const sortedColors = Array.from(colorStats.entries())
        .sort((a, b) => b[1] - a[1]);

    // Identify potential background colors (usually more prevalent)
    const bgColors = sortedColors.slice(0, 3)
        .map(([color]) => color.split(',').map(Number));

    // Identify potential foreground colors (usually more varied)
    const fgColors = sortedColors.slice(3, 10)
        .map(([color]) => color.split(',').map(Number));

    return { fgColors, bgColors };
}

function processChunkEnhanced(data, fgMask, bgMask, edgeMap, start, end, width, height, fgColors, bgColors) {
    const colorThreshold = 25;
    const edgeBlend = 4;

    for (let i = start; i < end; i += 4) {
        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);
        const idx = y * width + x;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate color similarity scores
        let bgScore = calculateColorScore(r, g, b, bgColors);
        let fgScore = calculateColorScore(r, g, b, fgColors);

        // Consider edge information
        const edgeStrength = edgeMap[idx] / 255;
        fgScore *= (1 + edgeStrength);

        // Make decision based on scores
        if (bgScore > fgScore) {
            // Likely background pixel
            let alpha = 0;

            // Check edge proximity for smooth transitions
            if (edgeStrength > 0) {
                alpha = Math.round(255 * (1 - edgeStrength));
            }

            data[i + 3] = alpha;
            bgMask[idx] = 1;
        } else {
            // Likely foreground pixel
            data[i + 3] = 255;
            fgMask[idx] = 1;
        }
    }
}

function calculateColorScore(r, g, b, colorSet) {
    let minDiff = Infinity;
    for (const [cr, cg, cb] of colorSet) {
        const diff = Math.sqrt(
            Math.pow(r - cr, 2) +
            Math.pow(g - cg, 2) +
            Math.pow(b - cb, 2)
        );
        minDiff = Math.min(minDiff, diff);
    }
    return 1 / (1 + minDiff);
}

function refineEdges(data, fgMask, bgMask, width, height) {
    const kernelSize = 2;
    const tempData = new Uint8ClampedArray(data);

    for (let y = kernelSize; y < height - kernelSize; y++) {
        for (let x = kernelSize; x < width - kernelSize; x++) {
            const idx = (y * width + x) * 4;

            // Only process border regions
            if (isOnBorder(fgMask, bgMask, x, y, width)) {
                let alphaSum = 0;
                let weightSum = 0;

                // Weighted average of surrounding pixels
                for (let dy = -kernelSize; dy <= kernelSize; dy++) {
                    for (let dx = -kernelSize; dx <= kernelSize; dx++) {
                        const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                        const weight = 1 / (1 + Math.sqrt(dx * dx + dy * dy));
                        alphaSum += tempData[neighborIdx + 3] * weight;
                        weightSum += weight;
                    }
                }

                // Apply refined alpha
                data[idx + 3] = Math.round(alphaSum / weightSum);
            }
        }
    }
}

function isOnBorder(fgMask, bgMask, x, y, width) {
    const idx = y * width + x;
    if (!fgMask[idx] && !bgMask[idx]) return false;

    // Check if pixel has both foreground and background neighbors
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const neighborIdx = (y + dy) * width + (x + dx);
            if (fgMask[neighborIdx] !== fgMask[idx]) return true;
        }
    }
    return false;
}

function createEdgeMap(data, width, height) {
    const edgeMap = new Uint8Array(width * height);
    const sobelThreshold = 30;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            let edgeValue = 0;

            // Calculate edge strength for each channel
            for (let c = 0; c < 3; c++) {
                const gx = -1 * data[idx - width * 4 - 4 + c] +
                    -2 * data[idx - 4 + c] +
                    -1 * data[idx + width * 4 - 4 + c] +
                    1 * data[idx - width * 4 + 4 + c] +
                    2 * data[idx + 4 + c] +
                    1 * data[idx + width * 4 + 4 + c];

                const gy = -1 * data[idx - width * 4 - 4 + c] +
                    -2 * data[idx - width * 4 + c] +
                    -1 * data[idx - width * 4 + 4 + c] +
                    1 * data[idx + width * 4 - 4 + c] +
                    2 * data[idx + width * 4 + c] +
                    1 * data[idx + width * 4 + 4 + c];

                edgeValue += Math.sqrt(gx * gx + gy * gy);
            }

            edgeMap[y * width + x] = edgeValue > sobelThreshold ? 255 : 0;
        }
    }
    return edgeMap;
}