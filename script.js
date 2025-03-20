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
    // Create a canvas for processing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Improved background removal algorithm
    // This uses edge detection and color difference to better identify background

    // First pass: detect edges
    const edgeData = new Uint8Array(data.length / 4);
    for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
            const idx = (y * canvas.width + x) * 4;

            // Simple Sobel edge detection
            const idx1 = ((y - 1) * canvas.width + (x - 1)) * 4;
            const idx2 = ((y - 1) * canvas.width + x) * 4;
            const idx3 = ((y - 1) * canvas.width + (x + 1)) * 4;
            const idx4 = (y * canvas.width + (x - 1)) * 4;
            const idx5 = (y * canvas.width + (x + 1)) * 4;
            const idx6 = ((y + 1) * canvas.width + (x - 1)) * 4;
            const idx7 = ((y + 1) * canvas.width + x) * 4;
            const idx8 = ((y + 1) * canvas.width + (x + 1)) * 4;

            // Calculate gradient
            const gx = -1 * data[idx1] + 1 * data[idx3] +
                -2 * data[idx4] + 2 * data[idx5] +
                -1 * data[idx6] + 1 * data[idx8];

            const gy = -1 * data[idx1] - 2 * data[idx2] - 1 * data[idx3] +
                1 * data[idx6] + 2 * data[idx7] + 1 * data[idx8];

            // Calculate gradient magnitude
            const g = Math.sqrt(gx * gx + gy * gy);

            // Store edge information
            edgeData[y * canvas.width + x] = g > 30 ? 255 : 0;
        }
    }

    // Second pass: remove background based on color and edges
    for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor((i / 4) / canvas.width);

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is near an edge
        const isEdge = x > 0 && y > 0 && x < canvas.width - 1 && y < canvas.height - 1 &&
            edgeData[y * canvas.width + x] > 0;

        // Check if pixel is likely background (adjust these values as needed)
        const isBackground =
            // Light background detection
            (r > 200 && g > 200 && b > 200) ||
            // Dark background detection
            (r < 30 && g < 30 && b < 30) ||
            // Green screen detection
            (g > r * 1.5 && g > b * 1.5);

        // Set transparency based on background detection and edge proximity
        if (isBackground && !isEdge) {
            data[i + 3] = 0; // Fully transparent
        } else if (isBackground) {
            data[i + 3] = 128; // Semi-transparent for edges
        }
    }

    // Apply the modified image data back to the canvas
    ctx.putImageData(imageData, 0, 0);

    // Create a new image from the processed canvas
    const processedImg = new Image();
    processedImg.onload = function() {
        showPreview(processedImg, 'Background Removed');
    };
    processedImg.src = canvas.toDataURL();
}