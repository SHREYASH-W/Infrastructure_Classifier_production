document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('dropZone');
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const previewSection = document.getElementById('previewSection');
    const classifyBtn = document.getElementById('classifyBtn');
    const loadingContainer = document.getElementById('loadingContainer');
    const resultSection = document.getElementById('result');
    const removeImageBtn = document.getElementById('removeImage');

    // 🔹 Use your deployed backend URL instead of localhost
    const API_URL = 'https://your-backend.onrender.com/predict';  
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    const classDescriptions = [
        "Bad Infrastructure (Type A)",
        "Bad Infrastructure (Type B)",
        "Good Infrastructure (Type A)",
        "Good Infrastructure (Type B)"
    ];

    // 🟢 Drag and Drop Handlers
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('highlight'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('highlight'), false);
    });

    dropZone.addEventListener('drop', function (e) {
        handleFile(e.dataTransfer.files[0]);
    });

    // 🟢 File Input Handler
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

    // 🟢 Remove Image Handler
    removeImageBtn.addEventListener('click', function () {
        imageUpload.value = '';
        previewSection.hidden = true;
        dropZone.hidden = false;
        classifyBtn.disabled = true;
        resultSection.hidden = true;
    });

    // 🟢 Classification Handler
    classifyBtn.addEventListener('click', async function () {
        if (!imageUpload.files[0]) {
            showNotification('No image selected', 'error');
            return;
        }

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
            showNotification('Network error or server unreachable', 'error');
        } finally {
            loadingContainer.hidden = true;
            classifyBtn.disabled = false;
        }
    });

    function displayResults(data) {
        resultSection.innerHTML = `
            <div class="result-card">
                <h2>Analysis Results</h2>
                <p><strong>${data.is_good === 1 ? 'Good' : 'Poor'} Infrastructure</strong></p>
                <p>Overall Confidence: ${(data.quality_confidence * 100).toFixed(1)}%</p>
                <h3>Quality Distribution</h3>
                <div class="progress-bar">
                    <div class="progress-fill good" style="width: ${(data.good_infrastructure_prob * 100)}%">
                        ${data.good_infrastructure_prob.toFixed(2) * 100}%
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill bad" style="width: ${(data.bad_infrastructure_prob * 100)}%">
                        ${data.bad_infrastructure_prob.toFixed(2) * 100}%
                    </div>
                </div>
                <h3>Specific Classification</h3>
                <p>Class: ${classDescriptions[data.specific_class]}</p>
                <p>Class Confidence: ${(data.class_confidence * 100).toFixed(1)}%</p>
            </div>
        `;
        resultSection.hidden = false;
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
});
