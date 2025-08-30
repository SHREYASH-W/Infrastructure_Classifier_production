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

app = Flask(__name__, template_folder="templates", static_folder="static", static_url_path="/static")
CORS(app)

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Deployment debugging
print("=== DEPLOYMENT DEBUG ===")
print(f"Current working directory: {os.getcwd()}")
print(f"Environment: {os.environ.get('RENDER', 'Not on Render')}")
print("Files in current directory:")
for root, dirs, files in os.walk('.'):
    level = root.replace('.', '').count(os.sep)
    indent = ' ' * 2 * level
    print(f"{indent}{os.path.basename(root)}/")
    subindent = ' ' * 2 * (level + 1)
    for file in files:
        file_path = os.path.join(root, file)
        try:
            size = os.path.getsize(file_path)
            print(f"{subindent}{file} ({size} bytes)")
        except:
            print(f"{subindent}{file} (size unknown)")
print("=== END DEBUG ===")

# Model configuration
MODEL_PATH = "infrastructure_model.h5"
model = None

def load_model_safe():
    """Safely load the model with error handling"""
    global model
    
    if model is not None:
        return model
    
    if not os.path.exists(MODEL_PATH):
        logger.error(f"Model file not found: {MODEL_PATH}")
        logger.info(f"Available files: {os.listdir('.')}")
        return None
    
    try:
        model = load_model(MODEL_PATH)
        logger.info(f"Model loaded successfully from {MODEL_PATH}")
        return model
    except Exception as e:
        logger.error(f"Error loading model: {str(e)}")
        return None

def create_dummy_model():
    """Create a dummy model for testing when real model is not available"""
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Dense, Flatten, Conv2D, MaxPooling2D
    
    model = Sequential([
        Conv2D(32, (3, 3), activation='relu', input_shape=(224, 224, 3)),
        MaxPooling2D(2, 2),
        Conv2D(64, (3, 3), activation='relu'),
        MaxPooling2D(2, 2),
        Flatten(),
        Dense(128, activation='relu'),
        Dense(4, activation='softmax')  # 4 classes based on your analysis function
    ])
    
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    logger.info("Created dummy model for testing")
    return model

def get_model():
    """Get model (real or dummy) with fallback"""
    real_model = load_model_safe()
    
    if real_model is not None:
        return real_model, False  # Real model
    
    logger.warning("Using dummy model - predictions will be random!")
    return create_dummy_model(), True  # Dummy model

def preprocess_image(img_bytes):
    """Preprocess image for model prediction"""
    try:
        img = Image.open(io.BytesIO(img_bytes))
        
        # Convert to RGB if needed
        if img.mode != 'RGB':
            img = img.convert('RGB')
            
        img = img.resize((224, 224))
        img_array = image.img_to_array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = img_array / 255.0
        return img_array
    except Exception as e:
        logger.error(f"Error preprocessing image: {str(e)}")
        raise

def analyze_infrastructure(predictions, is_dummy=False):
    """
    Analyze predictions to determine infrastructure quality
    """
    # Convert numpy array to Python list
    predictions = predictions.tolist()
   
    # Get probabilities for each category
    bad_infrastructure_prob = predictions[0][0] + predictions[0][1]  # Class 0 + Class 1
    good_infrastructure_prob = predictions[0][2] + predictions[0][3]  # Class 2 + Class 3
   
    # Get individual class probabilities
    class_probs = predictions[0]
    specific_class = np.argmax(class_probs)
   
    # Determine overall quality (convert bool to int)
    is_good = 1 if good_infrastructure_prob > bad_infrastructure_prob else 0
   
    result = {
        'is_good': is_good,  # 1 for good, 0 for bad
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
    
    return result

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/health')
def health():
    """Health check endpoint"""
    current_model, is_dummy = get_model()
    return jsonify({
        'status': 'healthy',
        'model_loaded': current_model is not None,
        'dummy_mode': is_dummy,
        'model_path': MODEL_PATH
    })

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        return '', 204
       
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
       
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
            
        # Check file type
        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
            return jsonify({'error': 'Invalid file type. Please upload an image.'}), 400
        
        img_bytes = file.read()
        
        if len(img_bytes) == 0:
            return jsonify({'error': 'Empty file uploaded'}), 400
       
        # Get model
        current_model, is_dummy = get_model()
        
        if current_model is None:
            return jsonify({
                'error': 'Model not available',
                'details': 'Could not load model file'
            }), 503
       
        # Preprocess the image
        processed_image = preprocess_image(img_bytes)
       
        # Get predictions
        predictions = current_model.predict(processed_image, verbose=0)
       
        # Analyze results
        analysis = analyze_infrastructure(predictions, is_dummy)
       
        logger.info(f"Prediction completed - is_good: {analysis['is_good']}, confidence: {analysis['quality_confidence']:.3f}")
        
        return jsonify(analysis)
       
    except Exception as e:
        logger.error(f"Error during prediction: {str(e)}")
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

if __name__ == '__main__':
    # Try to load model on startup
    startup_model, is_dummy = get_model()
    if startup_model is not None:
        logger.info("Application ready with model loaded")
    else:
        logger.warning("Application starting without model")
    
    # Get port from environment variable (Render uses this)
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)