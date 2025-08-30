// Infrastructure Classifier JavaScript
class InfrastructureClassifier {
    constructor() {
        this.apiUrl = 'http://localhost:5000'; // Your Flask backend URL
        this.classNames = [
            'Poor Infrastructure',
            'Below Average Infrastructure', 
            'Good Infrastructure',
            'Excellent Infrastructure'
        ];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDropZone();
    }

    setupEventListeners() {
        const imageInput = document.getElementById('imageInput');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const removeImageBtn = document.getElementById('removeImage');
        const dropZone = document.getElementById('dropZone');

        // File input change
        imageInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Drop zone click
        dropZone.addEventListener('click', () => {
            imageInput.click();
        });

        // Analyze button click
        analyzeBtn.addEventListener('click', () => {
            this.analyzeImage();
        });

        // Remove image button
        removeImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.resetImageInput();
        });
    }

    setupDropZone() {
        const dropZone = document.getElementById('dropZone');

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Highlight drop zone when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => this.highlight(dropZone), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => this.unhighlight(dropZone), false);
        });

        // Handle dropped files
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files[0]) {
                this.handleFileSelect(files[0]);
            }
        });
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    highlight(element) {
        element.classList.add('border-purple-400', 'bg-purple-500/10');
    }

    unhighlight(element) {
        element.classList.remove('border-purple-400', 'bg-purple-500/10');
    }

    handleFileSelect(file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select a valid image file.', 'error');
            return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes
        if (file.size > maxSize) {
            this.showNotification('File size must be less than 10MB.', 'error');
            return;
        }

        this.displayImagePreview(file);
        this.showAnalyzeButton();
        this.hideResults();
    }

    displayImagePreview(file) {
        const reader = new FileReader();
        const imagePreview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');
        const uploadContent = document.getElementById('uploadContent');

        reader.onload = (e) => {
            previewImg.src = e.target.result;
            imagePreview.classList.remove('hidden');
            uploadContent.classList.add('hidden');
        };

        reader.readAsDataURL(file);
    }

    showAnalyzeButton() {
        const analyzeBtn = document.getElementById('analyzeBtn');
        analyzeBtn.classList.remove('hidden');
        analyzeBtn.classList.add('animate-slide-up');
    }

    hideAnalyzeButton() {
        const analyzeBtn = document.getElementById('analyzeBtn');
        analyzeBtn.classList.add('hidden');
    }

    resetImageInput() {
        const imageInput = document.getElementById('imageInput');
        const imagePreview = document.getElementById('imagePreview');
        const uploadContent = document.getElementById('uploadContent');
        
        imageInput.value = '';
        imagePreview.classList.add('hidden');
        uploadContent.classList.remove('hidden');
        this.hideAnalyzeButton();
        this.hideResults();
    }

    async analyzeImage() {
        const imageInput = document.getElementById('imageInput');
        const file = imageInput.files[0];
        
        if (!file) {
            this.showNotification('Please select an image first.', 'error');
            return;
        }

        this.setLoadingState(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${this.apiUrl}/predict`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.displayResults(result);
            this.showNotification('Analysis completed successfully!', 'success');

        } catch (error) {
            console.error('Error:', error);
            this.showNotification('Analysis failed. Please check your connection and try again.', 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    setLoadingState(isLoading) {
        const analyzeBtn = document.getElementById('analyzeBtn');
        const analyzeText = document.getElementById('analyzeText');
        const loadingSpinner = document.getElementById('loadingSpinner');

        if (isLoading) {
            analyzeBtn.disabled = true;
            analyzeText.textContent = 'Analyzing...';
            loadingSpinner.classList.remove('hidden');
        } else {
            analyzeBtn.disabled = false;
            analyzeText.textContent = 'Analyze Infrastructure';
            loadingSpinner.classList.add('hidden');
        }
    }

    displayResults(data) {
        const resultsContainer = document.getElementById('resultsContainer');
        const noResults = document.getElementById('noResults');
        
        // Hide no results message and show results
        noResults.classList.add('hidden');
        resultsContainer.classList.remove('hidden');
        resultsContainer.classList.add('animate-fade-in');

        // Update overall quality
        this.updateOverallQuality(data);
        
        // Update classification details
        this.updateClassificationDetails(data);
        
        // Update probability distribution
        this.updateProbabilityDistribution(data);
    }

    updateOverallQuality(data) {
        const qualityBadge = document.getElementById('qualityBadge');
        const qualityProgress = document.getElementById('qualityProgress');
        const confidenceText = document.getElementById('confidenceText');

        const isGood = data.is_good;
        const confidence = Math.round(data.quality_confidence * 100);

        // Update badge
        if (isGood) {
            qualityBadge.textContent = 'GOOD';
            qualityBadge.className = 'px-4 py-2 rounded-full text-sm font-bold bg-green-500 text-white';
            qualityProgress.className = 'h-full transition-all duration-1000 ease-out bg-gradient-to-r from-green-400 to-emerald-500';
        } else {
            qualityBadge.textContent = 'NEEDS ATTENTION';
            qualityBadge.className = 'px-4 py-2 rounded-full text-sm font-bold bg-red-500 text-white';
            qualityProgress.className = 'h-full transition-all duration-1000 ease-out bg-gradient-to-r from-red-400 to-red-500';
        }

        // Update progress bar
        setTimeout(() => {
            qualityProgress.style.width = `${confidence}%`;
        }, 100);

        // Update confidence text
        confidenceText.textContent = `${confidence}% confidence`;
    }

    updateClassificationDetails(data) {
        const container = document.getElementById('classificationDetails');
        const specificClass = data.specific_class;
        const classConfidence = Math.round(data.class_confidence * 100);

        container.innerHTML = `
            <div class="bg-white/5 rounded-lg p-4 border border-white/10">
                <div class="flex justify-between items-center">
                    <span class="text-white font-medium">Primary Classification:</span>
                    <span class="text-cyan-400 font-bold">${this.classNames[specificClass]}</span>
                </div>
            </div>
            <div class="bg-white/5 rounded-lg p-4 border border-white/10">
                <div class="flex justify-between items-center">
                    <span class="text-white font-medium">Confidence Level:</span>
                    <span class="text-purple-400 font-bold">${classConfidence}%</span>
                </div>
            </div>
            <div class="bg-white/5 rounded-lg p-4 border border-white/10">
                <div class="flex justify-between items-center">
                    <span class="text-white font-medium">Quality Score:</span>
                    <div class="flex items-center space-x-2">
                        ${this.generateStars(data.quality_confidence)}
                        <span class="text-yellow-400 text-sm ml-2">${(data.quality_confidence * 5).toFixed(1)}/5.0</span>
                    </div>
                </div>
            </div>
        `;
    }

    updateProbabilityDistribution(data) {
        const container = document.getElementById('probabilityBars');
        const probabilities = data.individual_probs;

        container.innerHTML = '';

        probabilities.forEach((prob, index) => {
            const percentage = Math.round(prob * 100);
            const barColor = this.getBarColor(index);
            
            const barElement = document.createElement('div');
            barElement.className = 'space-y-2';
            barElement.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-300">${this.classNames[index]}</span>
                    <span class="text-sm font-bold text-white">${percentage}%</span>
                </div>
                <div class="bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div class="h-full ${barColor} transition-all duration-1000 ease-out" style="width: 0%"></div>
                </div>
            `;
            
            container.appendChild(barElement);
            
            // Animate the bar
            setTimeout(() => {
                const progressBar = barElement.querySelector('.h-full');
                progressBar.style.width = `${percentage}%`;
            }, 100 + (index * 100));
        });
    }

    getBarColor(index) {
        const colors = [
            'bg-gradient-to-r from-red-500 to-red-600',
            'bg-gradient-to-r from-orange-500 to-orange-600',
            'bg-gradient-to-r from-yellow-500 to-yellow-600',
            'bg-gradient-to-r from-green-500 to-green-600'
        ];
        return colors[index];
    }

    generateStars(rating) {
        const stars = Math.round(rating * 5);
        let starHtml = '';
        
        for (let i = 1; i <= 5; i++) {
            if (i <= stars) {
                starHtml += '<span class="text-yellow-400">★</span>';
            } else {
                starHtml += '<span class="text-gray-600">★</span>';
            }
        }
        
        return starHtml;
    }

    hideResults() {
        const resultsContainer = document.getElementById('resultsContainer');
        const noResults = document.getElementById('noResults');
        
        resultsContainer.classList.add('hidden');
        noResults.classList.remove('hidden');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform translate-x-full transition-transform duration-300 ${
            type === 'success' ? 'bg-green-500' : 
            type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        } text-white`;
        
        notification.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="flex-shrink-0">
                    ${type === 'success' ? 
                        '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>' :
                        type === 'error' ? 
                        '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>' :
                        '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>'
                    }
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium">${message}</p>
                </div>
                <button class="flex-shrink-0 ml-4 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.parentElement.remove()">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                    </svg>
                </button>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('translate-x-full');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 5000);
    }

    // Utility method to format bytes
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Method to get quality description based on confidence
    getQualityDescription(confidence, isGood) {
        if (isGood) {
            if (confidence > 0.9) return 'Excellent infrastructure quality';
            if (confidence > 0.7) return 'Good infrastructure quality';
            return 'Acceptable infrastructure quality';
        } else {
            if (confidence > 0.9) return 'Poor infrastructure - immediate attention required';
            if (confidence > 0.7) return 'Below average infrastructure - maintenance needed';
            return 'Infrastructure quality concerns detected';
        }
    }

    // Method to add detailed analysis tooltip
    addTooltip(element, text) {
        element.setAttribute('title', text);
        element.classList.add('cursor-help');
    }

    // Method to handle API errors gracefully
    handleApiError(error) {
        console.error('API Error:', error);
        
        if (error.message.includes('Failed to fetch')) {
            this.showNotification('Unable to connect to the server. Please check if the Flask backend is running.', 'error');
        } else if (error.message.includes('500')) {
            this.showNotification('Server error occurred. Please try again later.', 'error');
        } else if (error.message.includes('400')) {
            this.showNotification('Invalid request. Please check your image file.', 'error');
        } else {
            this.showNotification('An unexpected error occurred. Please try again.', 'error');
        }
    }

    // Method to validate image dimensions
    validateImageDimensions(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const isValid = img.width >= 100 && img.height >= 100;
                resolve({
                    isValid,
                    width: img.width,
                    height: img.height,
                    message: isValid ? 'Valid image dimensions' : 'Image should be at least 100x100 pixels'
                });
            };
            img.src = URL.createObjectURL(file);
        });
    }

    // Enhanced file validation
    async validateFile(file) {
        // Check file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            throw new Error('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
        }

        // Check file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error(`File size (${this.formatBytes(file.size)}) exceeds the maximum limit of ${this.formatBytes(maxSize)}`);
        }

        // Check image dimensions
        const dimensionCheck = await this.validateImageDimensions(file);
        if (!dimensionCheck.isValid) {
            throw new Error(dimensionCheck.message);
        }

        return true;
    }

    // Method to export results as JSON
    exportResults(data) {
        const exportData = {
            timestamp: new Date().toISOString(),
            analysis: data,
            classNames: this.classNames,
            summary: {
                overallQuality: data.is_good ? 'Good' : 'Needs Attention',
                primaryClass: this.classNames[data.specific_class],
                confidence: Math.round(data.class_confidence * 100),
                qualityScore: (data.quality_confidence * 5).toFixed(1)
            }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `infrastructure_analysis_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Method to reset application state
    resetApplication() {
        this.resetImageInput();
        this.hideResults();
        this.showNotification('Application reset successfully', 'info');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const classifier = new InfrastructureClassifier();
    
    // Add global error handler
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        classifier.showNotification('An unexpected error occurred. Please refresh the page.', 'error');
    });

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + U to upload new image
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
            e.preventDefault();
            document.getElementById('imageInput').click();
        }
        
        // Ctrl/Cmd + Enter to analyze
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const analyzeBtn = document.getElementById('analyzeBtn');
            if (!analyzeBtn.classList.contains('hidden') && !analyzeBtn.disabled) {
                classifier.analyzeImage();
            }
        }
        
        // Escape to reset
        if (e.key === 'Escape') {
            classifier.resetApplication();
        }
    });

    // Add progress tracking for large files
    XMLHttpRequest.prototype.originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(data) {
        if (data instanceof FormData) {
            this.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    console.log(`Upload progress: ${percentComplete.toFixed(1)}%`);
                }
            });
        }
        this.originalSend(data);
    };
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InfrastructureClassifier;
}