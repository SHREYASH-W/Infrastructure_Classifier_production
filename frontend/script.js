document.addEventListener('DOMContentLoaded', function () {
    // Cache DOM elements
    const elements = {
        dropZone: document.getElementById('dropZone'),
        imageUpload: document.getElementById('imageUpload'),
        imagePreview: document.getElementById('imagePreview'),
        previewSection: document.getElementById('previewSection'),
        classifyBtn: document.getElementById('classifyBtn'),
        loadingContainer: document.getElementById('loadingContainer'),
        resultSection: document.getElementById('result'),
        removeImageBtn: document.getElementById('removeImage')
    };

    // Constants
    const CONFIG = {
        API_URL: 'https://infrastructure-classifier-production.onrender.com/predict', // Add /predict here
        MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
        NOTIFICATION_DURATION: 3000,
        ACCEPTED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/webp']
    };

    const CLASS_DESCRIPTIONS = [
        "Bad Infrastructure (Type A)",
        "Bad Infrastructure (Type B)",
        "Good Infrastructure (Type A)",
        "Good Infrastructure (Type B)"
    ];

    // Validate that all required DOM elements are present
    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Required element '${key}' not found`);
            return;
        }
    }

    // File handling functions
    function isValidFile(file) {
        if (!file) return false;
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showNotification('File size exceeds 5MB limit', 'error');
            return false;
        }
        if (!CONFIG.ACCEPTED_FILE_TYPES.includes(file.type)) {
            showNotification('Please upload a valid image file (JPEG, PNG, or WebP)', 'error');
            return false;
        }
        return true;
    }

    function handleFile(file) {
        if (!isValidFile(file)) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            elements.imagePreview.src = e.target.result;
            elements.previewSection.hidden = false;
            elements.dropZone.hidden = true;
            elements.classifyBtn.disabled = false;
        };
        reader.onerror = function () {
            showNotification('Error reading file', 'error');
        };
        reader.readAsDataURL(file);
    }

    // Drag and drop handlers
    function setupDragAndDrop() {
        const events = {
            dragenter: highlight,
            dragover: highlight,
            dragleave: unhighlight,
            drop: handleDrop
        };

        Object.entries(events).forEach(([event, handler]) => {
            elements.dropZone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
                handler(e);
            }, false);
        });
    }

    function highlight() {
        elements.dropZone.classList.add('highlight');
    }

    function unhighlight() {
        elements.dropZone.classList.remove('highlight');
    }

    function handleDrop(e) {
        unhighlight();
        const file = e.dataTransfer.files[0];
        handleFile(file);
    }

    // API interaction
    async function classifyImage(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(error.message || 'Classification failed');
        }
    }

    // UI updates
    function updateUIForClassification(isLoading) {
        elements.loadingContainer.hidden = !isLoading;
        elements.resultSection.hidden = isLoading;
        elements.classifyBtn.disabled = isLoading;
    }

    function createProgressBar(label, value, type) {
        return `
            <div class="progress-bar">
                <span>${label}: ${(value * 100).toFixed(1)}%</span>
                <div class="progress-fill ${type}" 
                    style="width: ${value * 100}%">
                </div>
            </div>
        `;
    }

    function displayResults(data) {
        const resultsHTML = `
            <div class="result-card">
                <div class="result-header">
                    <h2>Analysis Results</h2>
                    <span class="confidence">
                        ${(data.quality_confidence * 100).toFixed(1)}% Confidence
                    </span>
                </div>
                
                <div class="quality-summary">
                    <h3>${data.is_good === 1 ? 'Good' : 'Poor'} Infrastructure</h3>
                    <p>Overall Confidence: ${(data.quality_confidence * 100).toFixed(1)}%</p>
                </div>
    
                <div class="quality-distribution">
                    <h3>Quality Distribution</h3>
                    ${createProgressBar('Good Infrastructure', data.good_infrastructure_prob, 'good')}
                    ${createProgressBar('Poor Infrastructure', data.bad_infrastructure_prob, 'bad')}
                </div>
    
                <div class="specific-classification">
                    <h3>Specific Classification</h3>
                    <p>Class: ${CLASS_DESCRIPTIONS[data.specific_class]}</p>
                    <p>Class Confidence: ${(data.class_confidence * 100).toFixed(1)}%</p>
                </div>
    
                <div class="individual-probabilities">
                    <h3>Individual Class Probabilities</h3>
                    ${data.individual_probs.map((prob, idx) => 
                        createProgressBar(CLASS_DESCRIPTIONS[idx], prob, idx < 2 ? 'bad' : 'good')
                    ).join('')}
                </div>
            </div>
        `;
    
        elements.resultSection.innerHTML = resultsHTML;
        elements.resultSection.hidden = false;
        elements.resultSection.classList.add('visible');
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), CONFIG.NOTIFICATION_DURATION);
    }

    // Event listeners
    function setupEventListeners() {
        elements.imageUpload.addEventListener('change', e => handleFile(e.target.files[0]));

        elements.removeImageBtn.addEventListener('click', () => {
            elements.imageUpload.value = '';
            elements.previewSection.hidden = true;
            elements.dropZone.hidden = false;
            elements.classifyBtn.disabled = true;
            elements.resultSection.hidden = true;
        });

        elements.classifyBtn.addEventListener('click', async () => {
            try {
                updateUIForClassification(true);
                const data = await classifyImage(elements.imageUpload.files[0]);
                displayResults(data);
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                updateUIForClassification(false);
            }
        });
    }

    // Initialize
    setupDragAndDrop();
    setupEventListeners();
});