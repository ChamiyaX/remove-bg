// Add this at the beginning of your script
const worker = new Worker('worker.js');

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

        // Add download button for processed image
        addDownloadButton(img.src);
    }
}

// Add progress bar HTML
function addProgressBar() {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.innerHTML = `
        <div class="progress-bar">
            <div class="progress" id="progress"></div>
        </div>
        <div class="progress-text" id="progress-text">0%</div>
    `;
    return progressContainer;
}

// Update the removeBackground function
function removeBackground(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Show progress bar
    const progressContainer = addProgressBar();
    document.querySelector('.container').insertBefore(
        progressContainer,
        document.getElementById('result')
    );

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Set up worker message handling
    worker.onmessage = function(e) {
        if (e.data.type === 'progress') {
            // Update progress bar
            document.getElementById('progress').style.width = `${e.data.progress}%`;
            document.getElementById('progress-text').textContent = `${e.data.progress}%`;
        } else if (e.data.type === 'complete') {
            // Process is complete
            ctx.putImageData(e.data.imageData, 0, 0);

            // Create result image
            const processedImg = new Image();
            processedImg.onload = function() {
                showPreview(processedImg, 'Background Removed');
                // Remove progress bar
                progressContainer.remove();
            };
            processedImg.src = canvas.toDataURL();
        }
    };

    // Start processing with worker
    worker.postMessage({
        imageData: imageData,
        width: canvas.width,
        height: canvas.height
    });
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

// Add this function to create a download button
function addDownloadButton(imageUrl) {
    // Create download button
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = 'Download Image';
    downloadBtn.className = 'download-btn';
    downloadBtn.addEventListener('click', () => {
        // Create a temporary link element
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = 'removed-background.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Add button to the result container
    const resultDiv = document.getElementById('result');
    resultDiv.appendChild(downloadBtn);
}