document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('dropZone');
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const previewSection = document.getElementById('previewSection');
    const classifyBtn = document.getElementById('classifyBtn');
    const loadingContainer = document.getElementById('loadingContainer');
    const resultSection = document.getElementById('result');
    const removeImageBtn = document.getElementById('removeImage');

    const API_URL = 'http://127.0.0.1:5000/predict';
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    const classDescriptions = [
        "Bad Infrastructure (Type A)",
        "Bad Infrastructure (Type B)",
        "Good Infrastructure (Type A)",
        "Good Infrastructure (Type B)"
    ];

    // Drag and drop handlers
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropZone.classList.add('highlight');
    }

    function unhighlight() {
        dropZone.classList.remove('highlight');
    }

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    // File input handler
    imageUpload.addEventListener('change', function (e) {
        handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (file) {
            if (file.size > MAX_FILE_SIZE) {
                showNotification('File size exceeds 5MB limit', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                imagePreview.src = e.target.result;
                previewSection.hidden = false;
                dropZone.hidden = true;
                classifyBtn.disabled = false;
            };
            reader.readAsDataURL(file);
        }
    }

    // Remove image handler
    removeImageBtn.addEventListener('click', function () {
        imageUpload.value = '';
        previewSection.hidden = true;
        dropZone.hidden = false;
        classifyBtn.disabled = true;
        resultSection.hidden = true;
    });

    // Classification handler
    classifyBtn.addEventListener('click', async function () {
        try {
            const formData = new FormData();
            formData.append('file', imageUpload.files[0]);

            loadingContainer.hidden = false;
            resultSection.hidden = true;
            classifyBtn.disabled = true;

            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                displayResults(data);
            } else {
                showNotification(data.error || 'Classification failed', 'error');
            }
        } catch (error) {
            showNotification(error.message || 'An error occurred', 'error');
        } finally {
            loadingContainer.hidden = true;
            classifyBtn.disabled = false;
        }
    });

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
                    <div class="progress-bar">
                        <span>Good Infrastructure: ${(data.good_infrastructure_prob * 100).toFixed(1)}%</span>
                        <div class="progress-fill good" 
                            style="width: ${(data.good_infrastructure_prob * 100)}%">
                        </div>
                    </div>
                    <div class="progress-bar">
                        <span>Poor Infrastructure: ${(data.bad_infrastructure_prob * 100).toFixed(1)}%</span>
                        <div class="progress-fill bad" 
                            style="width: ${(data.bad_infrastructure_prob * 100)}%">
                        </div>
                    </div>
                </div>
    
                <div class="specific-classification">
                    <h3>Specific Classification</h3>
                    <p>Class: ${classDescriptions[data.specific_class]}</p>
                    <p>Class Confidence: ${(data.class_confidence * 100).toFixed(1)}%</p>
                </div>
    
                <div class="individual-probabilities">
                    <h3>Individual Class Probabilities</h3>
                    ${data.individual_probs.map((prob, idx) => `
                        <div class="progress-bar">
                            <span>${classDescriptions[idx]}: ${(prob * 100).toFixed(1)}%</span>
                            <div class="progress-fill ${idx < 2 ? 'bad' : 'good'}" 
                                style="width: ${prob * 100}%">
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    
        resultSection.innerHTML = resultsHTML;
        resultSection.hidden = false;
        resultSection.classList.add('visible'); // Add this if you have a fade-in animation
    }
    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
});
