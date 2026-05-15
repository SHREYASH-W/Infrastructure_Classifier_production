from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
import numpy as np
from PIL import Image
import io
import logging
import os
import time
import gc
from threading import Lock

app = Flask(__name__)
CORS(app)

# Configure TensorFlow for memory efficiency
tf.config.experimental.enable_memory_growth = True
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Reduce TensorFlow logging

# Set up logging
logging.basicConfig(level=logging.INFO)  # Changed to INFO to reduce log spam
logger = logging.getLogger(__name__)

# Model configuration
MODEL_PATH = os.path.join(os.path.dirname(__file__), "infrastructure_model.h5")
model = None
model_lock = Lock()
last_prediction_time = time.time()


def load_model_safe():
    """Safely load the model with error handling and memory optimization"""
    global model
    
    with model_lock:
        if model is not None:
            return model
        
        if not os.path.exists(MODEL_PATH):
            logger.error(f"Model file not found: {MODEL_PATH}")
            logger.info(f"Available files: {os.listdir('.')}")
            return None
        
        try:
            logger.info("Loading model... This may take a moment.")
            start_time = time.time()
            
            # Load model with memory optimization
            model = load_model(MODEL_PATH, compile=False)  # Don't compile to save memory
            model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
            
            load_time = time.time() - start_time
            logger.info(f"Model loaded successfully in {load_time:.2f} seconds")
            
            # Force garbage collection
            gc.collect()
            
            return model
            
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            return None

def create_dummy_model():
    """Create a lightweight dummy model for testing"""
    try:
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import Dense, Flatten, Conv2D, MaxPooling2D
        
        # Smaller dummy model to save memory
        model = Sequential([
            Conv2D(16, (3, 3), activation='relu', input_shape=(224, 224, 3)),  # Reduced filters
            MaxPooling2D(4, 4),  # Larger pooling
            Conv2D(32, (3, 3), activation='relu'),
            MaxPooling2D(4, 4),
            Flatten(),
            Dense(64, activation='relu'),  # Reduced neurons
            Dense(4, activation='softmax')
        ])
        
        model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
        logger.info("Created lightweight dummy model for testing")
        return model
        
    except Exception as e:
        logger.error(f"Error creating dummy model: {str(e)}")
        return None

def get_model():
    """Get model (real or dummy) with fallback"""
    try:
        real_model = load_model_safe()
        
        if real_model is not None:
            return real_model, False  # Real model
        
        logger.warning("Real model failed to load, trying dummy model")
        dummy_model = create_dummy_model()
        
        if dummy_model is not None:
            return dummy_model, True  # Dummy model
        
        logger.error("Both real and dummy models failed to load")
        return None, True
        
    except Exception as e:
        logger.error(f"Error in get_model: {str(e)}")
        return None, True

def preprocess_image(img_bytes):
    """Preprocess image for model prediction with memory optimization"""
    try:
        # Limit image size to reduce memory usage
        MAX_SIZE = (512, 512)  # Resize large images first
        
        img = Image.open(io.BytesIO(img_bytes))
        
        # Convert to RGB if needed
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize large images first to save memory
        if img.size[0] > MAX_SIZE[0] or img.size[1] > MAX_SIZE[1]:
            img.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
            
        # Final resize to model input size
        img = img.resize((224, 224), Image.Resampling.LANCZOS)
        
        # Convert to array
        img_array = image.img_to_array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = img_array.astype(np.float32) / 255.0  # Use float32 to save memory
        
        # Clean up
        del img
        gc.collect()
        
        return img_array
        
    except Exception as e:
        logger.error(f"Error preprocessing image: {str(e)}")
        raise

def analyze_infrastructure(predictions, is_dummy=False):
    """Analyze predictions to determine infrastructure quality"""
    try:
        # Convert numpy array to Python list
        if isinstance(predictions, np.ndarray):
            predictions = predictions.tolist()
       
        # Get probabilities for each category
        class_probs = predictions[0]
        bad_infrastructure_prob = class_probs[0] + class_probs[1]  # Class 0 + Class 1
        good_infrastructure_prob = class_probs[2] + class_probs[3]  # Class 2 + Class 3
       
        specific_class = np.argmax(class_probs)
       
        # Determine overall quality
        is_good = 1 if good_infrastructure_prob > bad_infrastructure_prob else 0
       
        result = {
            'is_good': is_good,
            'quality_confidence': float(max(good_infrastructure_prob, bad_infrastructure_prob)),
            'specific_class': int(specific_class),
            'class_confidence': float(class_probs[specific_class]),
            'bad_infrastructure_prob': float(bad_infrastructure_prob),
            'good_infrastructure_prob': float(good_infrastructure_prob),
            'individual_probs': [float(p) for p in class_probs]
        }
        
        if is_dummy:
            result['warning'] = 'Using dummy model - predictions are not real!'
            result['dummy_mode'] = True
        else:
            result['dummy_mode'] = False
        
        return result
        
    except Exception as e:
        logger.error(f"Error analyzing predictions: {str(e)}")
        raise

# Routes
@app.route('/')
def home():
    """API info — frontend is served by Next.js"""
    return jsonify({
        'service': 'Infrastructure Classifier API',
        'version': '1.0',
        'endpoints': {
            'health': '/health',
            'predict': '/predict (POST)',
            'status': '/status'
        },
        'frontend': 'Served by Next.js (port 3000 in dev)'
    })

@app.route('/health')
def health():
    """Health check endpoint"""
    try:
        current_model, is_dummy = get_model()
        return jsonify({
            'status': 'healthy',
            'model_loaded': current_model is not None,
            'dummy_mode': is_dummy,
            'model_path': MODEL_PATH,
            'timestamp': int(time.time())
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': int(time.time())
        }), 500

@app.route('/status')
def status():
    """Detailed status endpoint"""
    try:
        current_model, is_dummy = get_model()
        return jsonify({
            'status': 'running',
            'model_loaded': current_model is not None,
            'dummy_mode': is_dummy,
            'last_prediction': int(last_prediction_time),
            'uptime': int(time.time()),
            'memory_info': 'available' if current_model else 'loading'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/keep-alive')
def keep_alive():
    """Keep-alive endpoint to prevent service from sleeping"""
    return jsonify({
        'status': 'alive',
        'timestamp': int(time.time())
    })

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    """Main prediction endpoint"""
    global last_prediction_time
    
    if request.method == 'OPTIONS':
        return '', 204
       
    try:
        # Log request start
        logger.info("Prediction request received")
        start_time = time.time()
        
        # Validate request
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
       
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
            
        # Check file type
        allowed_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')
        if not file.filename.lower().endswith(allowed_extensions):
            return jsonify({'error': 'Invalid file type. Please upload an image.'}), 400
        
        # Read and validate file
        img_bytes = file.read()
        
        if len(img_bytes) == 0:
            return jsonify({'error': 'Empty file uploaded'}), 400
        
        # Check file size (5MB limit for Render)
        if len(img_bytes) > 5 * 1024 * 1024:
            return jsonify({'error': 'File too large. Please use images smaller than 5MB.'}), 413
       
        # Get model
        logger.info("Getting model...")
        current_model, is_dummy = get_model()
        
        if current_model is None:
            return jsonify({
                'error': 'Model not available',
                'details': 'Could not load model file. Service may be starting up.'
            }), 503
       
        # Preprocess the image
        logger.info("Preprocessing image...")
        try:
            processed_image = preprocess_image(img_bytes)
        except Exception as e:
            return jsonify({
                'error': 'Image processing failed',
                'details': str(e)
            }), 400
       
        # Get predictions
        logger.info("Making prediction...")
        try:
            predictions = current_model.predict(processed_image, verbose=0, batch_size=1)
        except Exception as e:
            logger.error(f"Prediction failed: {str(e)}")
            return jsonify({
                'error': 'Prediction failed',
                'details': str(e)
            }), 500
       
        # Analyze results
        try:
            analysis = analyze_infrastructure(predictions, is_dummy)
        except Exception as e:
            logger.error(f"Analysis failed: {str(e)}")
            return jsonify({
                'error': 'Analysis failed',
                'details': str(e)
            }), 500
        
        # Update last prediction time
        last_prediction_time = time.time()
        processing_time = last_prediction_time - start_time
        
        logger.info(f"Prediction completed in {processing_time:.2f}s - is_good: {analysis['is_good']}, confidence: {analysis['quality_confidence']:.3f}")
        
        # Clean up memory
        del processed_image, predictions, img_bytes
        gc.collect()
        
        return jsonify(analysis)
       
    except Exception as e:
        logger.error(f"Unexpected error during prediction: {str(e)}")
        return jsonify({
            'error': 'Prediction failed',
            'details': 'An unexpected error occurred. Please try again.'
        }), 500

@app.before_request
def log_request():
    """Log incoming requests"""
    if request.endpoint not in ['keep_alive', 'health']:  # Don't spam logs with keep-alive requests
        logger.info(f"Request: {request.method} {request.path}")

@app.after_request
def after_request(response):
    """Add CORS headers and log responses"""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    
    if request.endpoint not in ['keep_alive', 'health']:
        logger.info(f"Response: {response.status_code}")
    
    return response

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large errors"""
    return jsonify({
        'error': 'File too large',
        'details': 'Please use images smaller than 5MB'
    }), 413

@app.errorhandler(500)
def internal_server_error(error):
    """Handle internal server errors"""
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({
        'error': 'Internal server error',
        'details': 'Please try again later'
    }), 500

if __name__ == '__main__':
    # Configure for production
    logger.info("Starting Flask application...")
    
    # Try to preload model on startup (but don't fail if it doesn't work)
    try:
        startup_model, is_dummy = get_model()
        if startup_model is not None:
            logger.info(f"Application ready with {'dummy' if is_dummy else 'real'} model loaded")
        else:
            logger.warning("Application starting without model - will load on first request")
    except Exception as e:
        logger.warning(f"Model preloading failed: {str(e)} - will load on first request")
    
    # Get port from environment variable (Render uses this)
    port = int(os.environ.get('PORT', 5000))
    
    # Production settings
    app.run(
        host='0.0.0.0', 
        port=port, 
        debug=False,
        threaded=True,  # Enable threading for better performance
        use_reloader=False  # Disable reloader in production
    )