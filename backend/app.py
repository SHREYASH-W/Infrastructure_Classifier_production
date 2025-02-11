from flask import Flask, request, jsonify, make_response, send_from_directory
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
app = Flask(__name__,
            static_folder='../frontend',  # Point to frontend directory
            static_url_path='')  # Serve static files from root URL

# Configure CORS for Render and local development
CORS(app, resources={
    r"/predict": {
        "origins": ["https://infrastructure-classifier-production.onrender.com", "http://localhost:5000", "http://127.0.0.1:5000"],
        "methods": ["POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept"]
    },
    r"/*": {
        "origins": "*",
        "methods": ["GET"]
    }
})

# Configuration
class Config:
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "infrastructure_model.h5")
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB max file size
    IMAGE_SIZE = (224, 224)

# Set up logging
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
    """Preprocess image for model prediction"""
    try:
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode == 'RGBA':
            img = img.convert('RGB')
            
        img = img.resize(Config.IMAGE_SIZE)
        img_array = image.img_to_array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = img_array / 255.0
        
        return img_array
        
    except Exception as e:
        logger.error(f"Error preprocessing image: {str(e)}")
        raise ImageProcessingError(f"Error processing image: {str(e)}")

def analyze_infrastructure(predictions):
    """Analyze model predictions to determine infrastructure quality"""
    try:
        if not isinstance(predictions, np.ndarray) or predictions.shape[1] != 4:
            raise ValueError("Invalid prediction format")
        predictions = predictions.tolist()[0]
        bad_infrastructure_prob = predictions[0] + predictions[1]
        good_infrastructure_prob = predictions[2] + predictions[3]
        specific_class = np.argmax(predictions)
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
try:
    model = load_ml_model()
except Exception as e:
    logger.error(f"Failed to load model at startup: {str(e)}")
    model = None

# Add header middleware
@app.after_request
def add_header(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Routes
@app.route('/')
def home():
    return app.send_static_file('index.html')

@app.route('/script.js')
def serve_script():
    return app.send_static_file('script.js')

@app.route('/style.css')
def serve_style():
    return app.send_static_file('style.css')

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    if model is None:
        return jsonify({'status': 'error', 'message': 'Model not loaded'}), 500
    return jsonify({'status': 'ok', 'message': 'Model loaded successfully'}), 200

@app.route('/test', methods=['GET'])
def test():
    """Test endpoint for debugging"""
    return jsonify({'message': 'Test successful'}), 200

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    """Handle image prediction requests"""
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Accept')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response, 204
        
    try:
        if model is None:
            logger.error("Model not loaded")
            return jsonify({'error': 'Model not loaded'}), 500
        if 'file' not in request.files:
            logger.error("No file uploaded")
            return jsonify({'error': 'No file uploaded'}), 400
        file = request.files['file']
        if not file or not file.filename:
            logger.error("No file selected")
            return jsonify({'error': 'No file selected'}), 400
        if not allowed_file(file.filename):
            logger.error(f"Invalid file type: {file.filename}")
            return jsonify({'error': 'Invalid file type. Allowed types: PNG, JPG, JPEG, WebP'}), 400
        img_bytes = file.read()
        if not img_bytes:
            logger.error("Empty file uploaded")
            return jsonify({'error': 'Empty file'}), 400
        processed_image = preprocess_image(img_bytes)
        predictions = model.predict(processed_image)
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
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)