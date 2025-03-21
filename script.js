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
        // Add a data attribute to identify this container
        previewContainer.setAttribute('data-original', 'true');
    } else {
        // Remove the original image preview if it exists
        const originalPreview = resultDiv.querySelector('[data-original="true"]');
        if (originalPreview) {
            originalPreview.remove();
        }

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

                // Dispatch event that image processing is complete
                document.dispatchEvent(new CustomEvent('imageProcessed', {
                    detail: { image: processedImg }
                }));

                // Add text editing tools
                addTextTools();
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

// Add this after the addDownloadButton function
function addTextTools() {
    // Create text tools container
    const textTools = document.createElement('div');
    textTools.className = 'text-tools';
    textTools.innerHTML = `
        <h3>Add Text</h3>
        <div class="text-input-group">
            <input type="text" id="text-input" placeholder="Enter your text here" class="text-input">
            <button id="add-text-btn" class="text-btn">Add Text</button>
        </div>
        <div class="text-controls">
            <div class="control-group">
                <label>Font Size:</label>
                <input type="range" id="font-size" min="10" max="72" value="24">
                <span id="font-size-value">24px</span>
            </div>
            <div class="control-group">
                <label>Font Family:</label>
                <select id="font-family">
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="'Courier New', monospace">Courier New</option>
                    <option value="Impact, sans-serif">Impact</option>
                    <option value="'Comic Sans MS', cursive">Comic Sans</option>
                </select>
            </div>
            <div class="control-group">
                <label>Text Color:</label>
                <input type="color" id="text-color" value="#ffffff">
            </div>
            <div class="control-group">
                <label>Bold:</label>
                <input type="checkbox" id="text-bold">
            </div>
            <div class="control-group">
                <label>Italic:</label>
                <input type="checkbox" id="text-italic">
            </div>
        </div>
    `;

    // Add to container
    document.querySelector('.container').insertBefore(
        textTools,
        document.getElementById('result')
    );

    // Initialize text editing canvas
    initTextEditor();
}

// Initialize text editor functionality
function initTextEditor() {
    let textLayer = null;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let editCanvas = null;
    let editCtx = null;
    let baseImage = null;

    // Create edit canvas when processed image is ready
    document.addEventListener('imageProcessed', function(e) {
        const processedImage = e.detail.image;
        baseImage = processedImage;

        // Create edit canvas
        if (!editCanvas) {
            editCanvas = document.createElement('canvas');
            editCanvas.className = 'edit-canvas';
            editCanvas.width = processedImage.width;
            editCanvas.height = processedImage.height;
            editCtx = editCanvas.getContext('2d');

            // Add canvas to the result area
            const editContainer = document.createElement('div');
            editContainer.className = 'edit-container';
            editContainer.appendChild(editCanvas);

            document.getElementById('result').appendChild(editContainer);

            // Add event listeners for canvas interaction
            editCanvas.addEventListener('mousedown', handleMouseDown);
            editCanvas.addEventListener('mousemove', handleMouseMove);
            editCanvas.addEventListener('mouseup', handleMouseUp);
            editCanvas.addEventListener('mouseleave', handleMouseUp);
        }

        // Add default text "Background Removed"
        textLayer = {
            text: "Background Removed",
            x: editCanvas.width / 2,
            y: editCanvas.height - 40, // Position near bottom
            fontSize: 24,
            fontFamily: "Arial, sans-serif",
            color: "#ffffff",
            bold: true,
            italic: false
        };

        // Update the text input field with the default text
        document.getElementById('text-input').value = textLayer.text;

        // Draw base image with default text
        drawCanvas();
    });

    // Add text button click handler
    document.getElementById('add-text-btn').addEventListener('click', function() {
        const text = document.getElementById('text-input').value;
        if (!text) return;

        // Create new text layer
        textLayer = {
            text: text,
            x: editCanvas ? editCanvas.width / 2 : 200,
            y: editCanvas ? editCanvas.height / 2 : 200,
            fontSize: parseInt(document.getElementById('font-size').value),
            fontFamily: document.getElementById('font-family').value,
            color: document.getElementById('text-color').value,
            bold: document.getElementById('text-bold').checked,
            italic: document.getElementById('text-italic').checked
        };

        // Draw canvas with new text
        drawCanvas();
    });

    // Update font size display
    document.getElementById('font-size').addEventListener('input', function() {
        document.getElementById('font-size-value').textContent = this.value + 'px';
        if (textLayer) {
            textLayer.fontSize = parseInt(this.value);
            drawCanvas();
        }
    });

    // Update text properties
    ['font-family', 'text-color', 'text-bold', 'text-italic'].forEach(id => {
        document.getElementById(id).addEventListener('change', function() {
            if (!textLayer) return;

            if (id === 'font-family') textLayer.fontFamily = this.value;
            if (id === 'text-color') textLayer.color = this.value;
            if (id === 'text-bold') textLayer.bold = this.checked;
            if (id === 'text-italic') textLayer.italic = this.checked;

            drawCanvas();
        });
    });

    // Mouse event handlers for dragging text
    function handleMouseDown(e) {
        if (!textLayer) return;

        const rect = editCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if click is on text
        editCtx.font = getFont();
        const textWidth = editCtx.measureText(textLayer.text).width;
        const textHeight = textLayer.fontSize;

        if (x >= textLayer.x - textWidth / 2 &&
            x <= textLayer.x + textWidth / 2 &&
            y >= textLayer.y - textHeight / 2 &&
            y <= textLayer.y + textHeight / 2) {
            isDragging = true;
            dragOffsetX = x - textLayer.x;
            dragOffsetY = y - textLayer.y;
        }
    }

    function handleMouseMove(e) {
        if (!isDragging) return;

        const rect = editCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        textLayer.x = x - dragOffsetX;
        textLayer.y = y - dragOffsetY;

        drawCanvas();
    }

    function handleMouseUp() {
        isDragging = false;
    }

    function getFont() {
        let font = '';
        if (textLayer.bold) font += 'bold ';
        if (textLayer.italic) font += 'italic ';
        font += `${textLayer.fontSize}px ${textLayer.fontFamily}`;
        return font;
    }

    function drawCanvas() {
        if (!editCanvas || !editCtx || !baseImage) return;

        // Clear canvas
        editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);

        // Draw base image
        editCtx.drawImage(baseImage, 0, 0);

        // Draw text if exists
        if (textLayer) {
            editCtx.font = getFont();
            editCtx.fillStyle = textLayer.color;
            editCtx.textAlign = 'center';
            editCtx.textBaseline = 'middle';
            editCtx.fillText(textLayer.text, textLayer.x, textLayer.y);
        }

        // Update download button to use the canvas with text
        updateDownloadButton();
    }

    function updateDownloadButton() {
        // Remove existing download button
        const existingBtn = document.querySelector('.download-btn');
        if (existingBtn) {
            existingBtn.remove();
        }

        // Create new download button with updated image
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download Image';
        downloadBtn.className = 'download-btn';
        downloadBtn.addEventListener('click', () => {
            const link = document.createElement('a');
            link.href = editCanvas.toDataURL('image/png');
            link.download = 'edited-image.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        document.getElementById('result').appendChild(downloadBtn);
    }

    // Add text input event handler for live preview
    document.getElementById('text-input').addEventListener('input', function() {
        if (!textLayer) return;

        // Update text layer with new text
        textLayer.text = this.value;

        // Redraw canvas with updated text
        drawCanvas();
    });
}