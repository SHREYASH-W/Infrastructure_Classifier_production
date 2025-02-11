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
        API_URL: 'https://infrastructure-classifier-production.onrender.com', // Replace with your Render backend URL
        TEST_API_URL: 'https://infrastructure-classifier-production.onrender.com', // Replace with your Render backend URL
        MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
        NOTIFICATION_DURATION: 3000,
        ACCEPTED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
        LOADING_TIMEOUT: 60000, // 60 second base timeout
        ERROR_MESSAGES: {
            FILE_TOO_LARGE: 'File too large. Maximum size is 5MB',
            INVALID_FILE_TYPE: 'Invalid file type. Allowed types: PNG, JPG, JPEG, WebP',
            FILE_READ_ERROR: 'Error reading file',
            COLD_START: 'Analysis is taking longer than expected (possibly due to cold start). Please try again.',
            GENERIC_ERROR: 'Classification failed. Please try again.'
        }
    };

    const CLASS_DESCRIPTIONS = [
        "Bad Infrastructure (Type A)",
        "Bad Infrastructure (Type B)",
        "Good Infrastructure (Type A)",
        "Good Infrastructure (Type B)"
    ];

    // Add CSS styles for notifications and loading
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
        }
        .notification.warning {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeeba;
        }
        .notification.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .loading-text {
            text-align: center;
            margin-top: 10px;
        }
        .loading-text small {
            color: #666;
            font-size: 0.8em;
        }
        .progress-bar {
            width: 100%;
            height: 20px;
            background-color: #e9ecef;
            border-radius: 5px;
            overflow: hidden;
            margin: 5px 0;
        }
        .progress-bar-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .progress-bar-fill.good {
            background-color: #28a745;
        }
        .progress-bar-fill.bad {
            background-color: #dc3545;
        }
    `;
    document.head.appendChild(style);

    // Validate that all required DOM elements are present
    function validateElements() {
        for (const [key, element] of Object.entries(elements)) {
            if (!element) {
                throw new Error(`Required element '${key}' not found`);
            }
        }
    }

    // File handling functions
    function isValidFile(file) {
        if (!file) return false;
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showNotification(CONFIG.ERROR_MESSAGES.FILE_TOO_LARGE, 'error');
            return false;
        }
        if (!CONFIG.ACCEPTED_FILE_TYPES.includes(file.type)) {
            showNotification(CONFIG.ERROR_MESSAGES.INVALID_FILE_TYPE, 'error');
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
            elements.resultSection.hidden = true;
            elements.resultSection.innerHTML = '';
        };
        reader.onerror = function () {
            showNotification(CONFIG.ERROR_MESSAGES.FILE_READ_ERROR, 'error');
        };
        reader.readAsDataURL(file);
    }

    // Drag and drop handlers
    function setupDragAndDrop() {
        const handlers = {
            dragenter: (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.dropZone.classList.add('highlight');
            },
            dragover: (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.dropZone.classList.add('highlight');
            },
            dragleave: (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.dropZone.classList.remove('highlight');
            },
            drop: (e) => {
                e.preventDefault();
                e.stopPropagation();
                elements.dropZone.classList.remove('highlight');
                const file = e.dataTransfer.files[0];
                handleFile(file);
            }
        };
        Object.entries(handlers).forEach(([event, handler]) => {
            elements.dropZone.addEventListener(event, handler, false);
        });
        return () => {
            Object.entries(handlers).forEach(([event, handler]) => {
                elements.dropZone.removeEventListener(event, handler, false);
            });
        };
    }

    // API interaction with retry logic
    async function classifyImage(file, retryCount = 2) {
        if (!file) throw new Error('No file provided');
        const formData = new FormData();
        formData.append('file', file);

        // Incrementally increase timeout for retries
        const baseTimeout = CONFIG.LOADING_TIMEOUT;
        const currentTimeout = baseTimeout * (retryCount + 1);

        const attemptFetch = async () => {
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Request timed out')), currentTimeout);
                });
                const fetchPromise = fetch(CONFIG.API_URL, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                const response = await Promise.race([fetchPromise, timeoutPromise]);
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || `Server error (${response.status}). Please try again.`);
                }
                return await response.json();
            } catch (error) {
                if (error.message.includes('timed out') && retryCount > 0) {
                    showNotification(`Cold start detected. Retrying... (${retryCount} attempts remaining)`, 'warning');
                    return new Promise(resolve => setTimeout(resolve, 2000))
                        .then(() => classifyImage(file, retryCount - 1));
                }
                throw error;
            }
        };
        return attemptFetch();
    }

    // UI updates
    function updateUIForClassification(isLoading) {
        elements.loadingContainer.hidden = !isLoading;
        elements.resultSection.hidden = isLoading;
        elements.classifyBtn.disabled = isLoading;
    }

    function createProgressBar(label, value, type) {
        const sanitizedValue = Math.max(0, Math.min(1, value));
        const percentage = (sanitizedValue * 100).toFixed(1);
        return `
            <div class="progress-bar">
                <div class="progress-bar-fill ${type}" style="width: ${percentage}%;"></div>
            </div>
            <div>${label}: ${percentage}%</div>
        `;
    }

    function displayResults(data) {
        if (!data) return;
        const resultsHTML = `
            <h3>Analysis Results</h3>
            <p><strong>${(data.quality_confidence * 100).toFixed(1)}% Confidence</strong></p>
            <p><strong>${data.is_good === 1 ? 'Good' : 'Poor'} Infrastructure</strong></p>
            <p>Overall Confidence: ${(data.quality_confidence * 100).toFixed(1)}%</p>
            <h4>Quality Distribution</h4>
            ${createProgressBar('Good Infrastructure', data.good_infrastructure_prob, 'good')}
            ${createProgressBar('Poor Infrastructure', data.bad_infrastructure_prob, 'bad')}
            <h4>Specific Classification</h4>
            <p>Class: ${CLASS_DESCRIPTIONS[data.specific_class] || 'Unknown'}</p>
            <p>Class Confidence: ${(data.class_confidence * 100).toFixed(1)}%</p>
            <h4>Individual Class Probabilities</h4>
            ${data.individual_probs.map((prob, idx) =>
                createProgressBar(
                    CLASS_DESCRIPTIONS[idx] || `Class ${idx}`,
                    prob,
                    idx < 2 ? 'bad' : 'good'
                )
            ).join('')}
        `;
        elements.resultSection.innerHTML = resultsHTML;
        elements.resultSection.hidden = false;
        elements.resultSection.classList.add('visible');
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.querySelectorAll('.notification').forEach(n => n.remove());
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, CONFIG.NOTIFICATION_DURATION);
    }

    // Main classify handler
    async function handleClassifyClick() {
        try {
            const file = elements.imageUpload.files[0];
            if (!file) {
                throw new Error('Please select an image first');
            }
            elements.classifyBtn.textContent = 'Analyzing...';
            elements.classifyBtn.disabled = true;
            updateUIForClassification(true);
            elements.loadingContainer.innerHTML = `
                <div class="loading-text">Analyzing infrastructure...</div>
                <small>First analysis may take up to 2-3 minutes due to cold start</small>
            `;
            const data = await classifyImage(file);
            displayResults(data);
        } catch (error) {
            console.error('Handler error:', error);
            let errorMessage = error.message;
            if (error.message.includes('timed out')) {
                errorMessage = 'The server is taking longer than expected to respond. Please try again in a few minutes.';
            }
            showNotification(errorMessage, 'error');
            elements.resultSection.innerHTML = '';
        } finally {
            updateUIForClassification(false);
            elements.classifyBtn.textContent = 'Analyze Infrastructure';
        }
    }

    // Event listeners setup
    function setupEventListeners() {
        const cleanupDragDrop = setupDragAndDrop();
        elements.imageUpload.addEventListener('change', e => handleFile(e.target.files[0]));
        elements.removeImageBtn.addEventListener('click', () => {
            elements.imageUpload.value = '';
            elements.previewSection.hidden = true;
            elements.dropZone.hidden = false;
            elements.classifyBtn.disabled = true;
            elements.resultSection.hidden = true;
            elements.resultSection.innerHTML = '';
        });
        elements.classifyBtn.addEventListener('click', handleClassifyClick);
        return () => {
            cleanupDragDrop();
            elements.imageUpload.removeEventListener('change', handleFile);
            elements.removeImageBtn.removeEventListener('click');
            elements.classifyBtn.removeEventListener('click', handleClassifyClick);
        };
    }

    // Initialize application
    try {
        validateElements();
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Failed to initialize application', 'error');
    }
});