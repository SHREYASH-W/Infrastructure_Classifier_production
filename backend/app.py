from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
import numpy as np
from PIL import Image
import io
import logging
import os
from functools import lru_cache
from werkzeug.utils import secure_filename

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={
    r"/predict": {  # Apply to /predict endpoint
        "origins": "*",  # Allow all origins - restrict this in production
        "methods": ["POST", "OPTIONS"],  # Allow POST and OPTIONS methods
        "allow_headers": ["Content-Type"]  # Allow Content-Type header
    }
})

# Configuration
class Config:
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "infrastructure_model.h5")
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB max file size
    IMAGE_SIZE = (224, 224)
    
# Set up logging with more detailed configuration
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Custom exceptions
class ModelError(Exception):
    pass

class ImageProcessingError(Exception):
    pass

# Utility functions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

@lru_cache(maxsize=1)
def load_ml_model():
    """Load the ML model with caching"""
    try:
        model = load_model(Config.MODEL_PATH)
        logger.info("Model loaded successfully")
        return model
    except Exception as e:
        logger.error(f"Failed to load model: {str(e)}")
        raise ModelError("Failed to load machine learning model")

def preprocess_image(img_bytes):
    """
    Preprocess image for model prediction
    
    Args:
        img_bytes: Raw image bytes
    
    Returns:
        numpy.ndarray: Preprocessed image array
    
    Raises:
        ImageProcessingError: If image processing fails
    """
    try:
        # Validate image file
        try:
            img = Image.open(io.BytesIO(img_bytes))
        except Exception as e:
            raise ImageProcessingError("Invalid image file")

        # Convert RGBA to RGB if necessary
        if img.mode == 'RGBA':
            img = img.convert('RGB')
            
        # Resize image
        img = img.resize(Config.IMAGE_SIZE)
        
        # Convert to array and preprocess
        img_array = image.img_to_array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = img_array / 255.0
        
        return img_array
        
    except Exception as e:
        logger.error(f"Error preprocessing image: {str(e)}")
        raise ImageProcessingError(f"Error processing image: {str(e)}")

def analyze_infrastructure(predictions):
    """
    Analyze model predictions to determine infrastructure quality
    
    Args:
        predictions: Model prediction array
        
    Returns:
        dict: Analysis results
    """
    try:
        # Validate predictions
        if not isinstance(predictions, np.ndarray) or predictions.shape[1] != 4:
            raise ValueError("Invalid prediction format")

        # Convert numpy array to Python list
        predictions = predictions.tolist()[0]
        
        # Calculate probabilities
        bad_infrastructure_prob = predictions[0] + predictions[1]  # Class 0 + Class 1
        good_infrastructure_prob = predictions[2] + predictions[3]  # Class 2 + Class 3
        
        # Get specific class
        specific_class = np.argmax(predictions)
        
        # Determine overall quality
        is_good = int(good_infrastructure_prob > bad_infrastructure_prob)
        
        return {
            'is_good': is_good,
            'quality_confidence': float(max(good_infrastructure_prob, bad_infrastructure_prob)),
            'specific_class': int(specific_class),
            'class_confidence': float(predictions[specific_class]),
            'bad_infrastructure_prob': float(bad_infrastructure_prob),
            'good_infrastructure_prob': float(good_infrastructure_prob),
            'individual_probs': [float(p) for p in predictions]
        }
        
    except Exception as e:
        logger.error(f"Error analyzing predictions: {str(e)}")
        raise ValueError(f"Error analyzing predictions: {str(e)}")

# Load model at startup
model = load_ml_model()

# Routes
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    """
    Handle image prediction requests
    """
    if request.method == 'OPTIONS':
        # Explicit CORS headers for preflight requests
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response, 204
        
    try:
        # Validate request
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400
            
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed types: PNG, JPG, JPEG, WebP'}), 400
            
        # Process image
        img_bytes = file.read()
        if not img_bytes:
            return jsonify({'error': 'Empty file'}), 400
            
        processed_image = preprocess_image(img_bytes)
        
        # Get predictions
        predictions = model.predict(processed_image)
        
        # Analyze results
        analysis = analyze_infrastructure(predictions)
        
        return jsonify(analysis)
        
    except ImageProcessingError as e:
        logger.error(f"Image processing error: {str(e)}")
        return jsonify({'error': str(e)}), 400
        
    except ModelError as e:
        logger.error(f"Model error: {str(e)}")
        return jsonify({'error': 'Model prediction failed'}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred'}), 500

# Error handlers
@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large. Maximum size is 5MB'}), 413

@app.errorhandler(500)
def internal_server_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Verify model loading before starting server
    try:
        model = load_ml_model()
        app.run(debug=False)  # Set debug=False in production
    except ModelError as e:
        logger.critical(f"Failed to start server: {str(e)}")