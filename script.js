document.getElementById('remove-bg').addEventListener('click', () => {
    const fileInput = document.getElementById('upload');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please upload an image first.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            // Show preview of original image
            showPreview(img, 'Original Image');

            // Process image to remove background
            removeBackground(img);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// Add event listener for file input to show preview immediately on selection
document.getElementById('upload').addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                showPreview(img, 'Original Image');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

function showPreview(img, label) {
    // Create a canvas for the preview with limited size
    const maxWidth = 300;
    const maxHeight = 300;

    // Calculate scaled dimensions
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
    }

    if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
    }

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = width;
    previewCanvas.height = height;
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.drawImage(img, 0, 0, width, height);

    // Create preview container
    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-container';
    previewContainer.innerHTML = `
        <h3>${label}</h3>
        <div class="preview-image">
            <img src="${previewCanvas.toDataURL()}" alt="${label}">
        </div>
    `;

    // Update result area
    const resultDiv = document.getElementById('result');
    if (label === 'Original Image') {
        // Clear previous results and add original preview
        resultDiv.innerHTML = '';
        resultDiv.appendChild(previewContainer);
    } else {
        // Add processed image preview
        resultDiv.appendChild(previewContainer);
    }
}

function removeBackground(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate dominant background color
    const colorMap = {};
    for (let i = 0; i < data.length; i += 4) {
        const r = Math.floor(data[i] / 10) * 10;
        const g = Math.floor(data[i + 1] / 10) * 10;
        const b = Math.floor(data[i + 2] / 10) * 10;
        const key = `${r},${g},${b}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
    }

    // Find the most common color (likely background)
    let dominantColor = Object.entries(colorMap).reduce((a, b) =>
        (a[1] > b[1] ? a : b))[0].split(',').map(Number);

    // Edge detection with enhanced Sobel
    const edgeData = new Uint8Array(data.length / 4);
    const sobelThreshold = 20; // Adjust for edge sensitivity

    for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
            const idx = (y * canvas.width + x) * 4;

            // Get surrounding pixels
            const surrounding = getSurroundingPixels(x, y, canvas.width, data);

            // Calculate edge strength using multiple channels
            const edgeStrength = calculateEdgeStrength(surrounding);

            // Store edge information with dynamic threshold
            edgeData[y * canvas.width + x] = edgeStrength > sobelThreshold ? 255 : 0;
        }
    }

    // Color difference threshold based on dominant color
    const colorThreshold = 30; // Adjust for color sensitivity
    const edgeBlend = 2; // Pixels around edges to blend

    // Remove background with improved color detection
    for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor((i / 4) / canvas.width);

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate color difference from dominant background
        const colorDiff = Math.sqrt(
            Math.pow(r - dominantColor[0], 2) +
            Math.pow(g - dominantColor[1], 2) +
            Math.pow(b - dominantColor[2], 2)
        );

        // Check for edges with blending
        let isNearEdge = false;
        let edgeDistance = Infinity;

        // Check surrounding pixels for edges
        for (let dy = -edgeBlend; dy <= edgeBlend; dy++) {
            for (let dx = -edgeBlend; dx <= edgeBlend; dx++) {
                const ex = x + dx;
                const ey = y + dy;
                if (ex >= 0 && ex < canvas.width && ey >= 0 && ey < canvas.height) {
                    if (edgeData[ey * canvas.width + ex] > 0) {
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        edgeDistance = Math.min(edgeDistance, distance);
                        isNearEdge = true;
                    }
                }
            }
        }

        // Determine if pixel is background
        const isBackground = colorDiff < colorThreshold;

        // Set transparency with smooth edge blending
        if (isBackground) {
            if (isNearEdge) {
                // Create smooth transition near edges
                const edgeBlendFactor = Math.min(edgeDistance / edgeBlend, 1);
                data[i + 3] = Math.floor(255 * edgeBlendFactor);
            } else {
                data[i + 3] = 0; // Fully transparent
            }
        }
    }

    // Apply the modified image data
    ctx.putImageData(imageData, 0, 0);

    // Create result image
    const processedImg = new Image();
    processedImg.onload = function() {
        showPreview(processedImg, 'Background Removed');
    };
    processedImg.src = canvas.toDataURL();
}

// Helper function to get surrounding pixels
function getSurroundingPixels(x, y, width, data) {
    const pixels = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            pixels.push({
                r: data[idx],
                g: data[idx + 1],
                b: data[idx + 2]
            });
        }
    }
    return pixels;
}

// Helper function to calculate edge strength
function calculateEdgeStrength(pixels) {
    // Sobel kernels for each color channel
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    let edgeStrength = 0;

    // Calculate edge strength for each color channel
    ['r', 'g', 'b'].forEach(channel => {
        let gradX = 0;
        let gradY = 0;

        for (let i = 0; i < 9; i++) {
            gradX += pixels[i][channel] * gx[i];
            gradY += pixels[i][channel] * gy[i];
        }

        // Add weighted contribution from this channel
        edgeStrength += Math.sqrt(gradX * gradX + gradY * gradY);
    });

    return edgeStrength / 3; // Average across channels
}

// Add these controls to your HTML
function addControls() {
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
        <div class="control-group">
            <label>Edge Sensitivity: <span id="edge-value">20</span></label>
            <input type="range" id="edge-sensitivity" min="5" max="50" value="20">
        </div>
        <div class="control-group">
            <label>Color Sensitivity: <span id="color-value">30</span></label>
            <input type="range" id="color-sensitivity" min="10" max="100" value="30">
        </div>
    `;

    document.querySelector('.container').insertBefore(
        controls,
        document.getElementById('result')
    );
}

// Add this CSS to your styles.css