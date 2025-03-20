self.onmessage = function(e) {
    const { imageData, width, height } = e.data;

    // Process the image in chunks and report progress
    const chunkSize = 10000;
    const totalPixels = imageData.data.length / 4;
    let processedPixels = 0;

    // Calculate dominant color
    const colorMap = calculateDominantColor(imageData.data);
    const dominantColor = findDominantColor(colorMap);

    // Process image in chunks
    for (let i = 0; i < imageData.data.length; i += chunkSize * 4) {
        const chunk = processChunk(
            imageData.data,
            i,
            Math.min(i + chunkSize * 4, imageData.data.length),
            width,
            height,
            dominantColor
        );

        // Update progress
        processedPixels += chunkSize;
        const progress = Math.min((processedPixels / totalPixels) * 100, 100);
        self.postMessage({
            type: 'progress',
            progress: Math.round(progress)
        });
    }

    // Send the processed image data back
    self.postMessage({
        type: 'complete',
        imageData: imageData
    });
};

function calculateDominantColor(data) {
    const colorMap = {};
    for (let i = 0; i < data.length; i += 4) {
        const r = Math.floor(data[i] / 10) * 10;
        const g = Math.floor(data[i + 1] / 10) * 10;
        const b = Math.floor(data[i + 2] / 10) * 10;
        const key = `${r},${g},${b}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
    }
    return colorMap;
}

function findDominantColor(colorMap) {
    return Object.entries(colorMap)
        .reduce((a, b) => (a[1] > b[1] ? a : b))[0]
        .split(',')
        .map(Number);
}

function processChunk(data, start, end, width, height, dominantColor) {
    const edgeBlend = 2;
    const colorThreshold = 30;

    for (let i = start; i < end; i += 4) {
        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const colorDiff = Math.sqrt(
            Math.pow(r - dominantColor[0], 2) +
            Math.pow(g - dominantColor[1], 2) +
            Math.pow(b - dominantColor[2], 2)
        );

        if (colorDiff < colorThreshold) {
            data[i + 3] = 0;
        }
    }
    return data;
}