self.onmessage = function(e) {
    const { imageData, width, height } = e.data;

    // Process the image in chunks and report progress
    const chunkSize = 10000;
    const totalPixels = imageData.data.length / 4;
    let processedPixels = 0;

    // Calculate dominant colors (background might have multiple colors)
    const colorMap = calculateDominantColors(imageData.data);
    const dominantColors = findDominantColors(colorMap, 3); // Get top 3 dominant colors

    // Create edge map
    const edgeMap = createEdgeMap(imageData.data, width, height);

    // Process image in chunks
    for (let i = 0; i < imageData.data.length; i += chunkSize * 4) {
        processChunk(
            imageData.data,
            edgeMap,
            i,
            Math.min(i + chunkSize * 4, imageData.data.length),
            width,
            height,
            dominantColors
        );

        // Update progress
        processedPixels += chunkSize;
        const progress = Math.min((processedPixels / totalPixels) * 100, 100);
        self.postMessage({
            type: 'progress',
            progress: Math.round(progress)
        });
    }

    // Final pass for smoothing
    smoothEdges(imageData.data, width, height);

    // Send the processed image data back
    self.postMessage({
        type: 'complete',
        imageData: imageData
    });
};

function calculateDominantColors(data) {
    const colorMap = {};
    for (let i = 0; i < data.length; i += 4) {
        const r = Math.floor(data[i] / 5) * 5;
        const g = Math.floor(data[i + 1] / 5) * 5;
        const b = Math.floor(data[i + 2] / 5) * 5;
        const key = `${r},${g},${b}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
    }
    return colorMap;
}

function findDominantColors(colorMap, count) {
    return Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(entry => entry[0].split(',').map(Number));
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

function processChunk(data, edgeMap, start, end, width, height, dominantColors) {
    const colorThreshold = 35;
    const edgeBlend = 3;

    for (let i = start; i < end; i += 4) {
        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is similar to any dominant color
        let isBackground = false;
        for (const bgColor of dominantColors) {
            const colorDiff = Math.sqrt(
                Math.pow(r - bgColor[0], 2) +
                Math.pow(g - bgColor[1], 2) +
                Math.pow(b - bgColor[2], 2)
            );

            if (colorDiff < colorThreshold) {
                isBackground = true;
                break;
            }
        }

        // Check for edges and their proximity
        let edgeStrength = 0;
        if (isBackground) {
            for (let dy = -edgeBlend; dy <= edgeBlend; dy++) {
                for (let dx = -edgeBlend; dx <= edgeBlend; dx++) {
                    const ex = x + dx;
                    const ey = y + dy;
                    if (ex >= 0 && ex < width && ey >= 0 && ey < height) {
                        if (edgeMap[ey * width + ex] > 0) {
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            edgeStrength = Math.max(edgeStrength,
                                1 - (distance / edgeBlend));
                        }
                    }
                }
            }

            // Set alpha based on edge proximity
            data[i + 3] = Math.round(edgeStrength * 255);
            if (!edgeStrength) {
                data[i + 3] = 0;
            }
        }
    }
}

function smoothEdges(data, width, height) {
    const tempData = new Uint8ClampedArray(data);
    const kernelSize = 2;

    for (let y = kernelSize; y < height - kernelSize; y++) {
        for (let x = kernelSize; x < width - kernelSize; x++) {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] < 255) { // Only process semi-transparent pixels
                let alphaSum = 0;
                let count = 0;

                // Average alpha values in neighborhood
                for (let dy = -kernelSize; dy <= kernelSize; dy++) {
                    for (let dx = -kernelSize; dx <= kernelSize; dx++) {
                        const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                        alphaSum += tempData[neighborIdx + 3];
                        count++;
                    }
                }

                // Apply smoothed alpha
                data[idx + 3] = alphaSum / count;
            }
        }
    }
}