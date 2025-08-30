from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
import numpy as np
from PIL import Image
import io
import logging

app = Flask(__name__)
CORS(app)

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load the model
MODEL_PATH = "infrastructure_model.h5"
model = load_model(MODEL_PATH)

def preprocess_image(img_bytes):
    img = Image.open(io.BytesIO(img_bytes))
    img = img.resize((224, 224))
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = img_array / 255.0
    return img_array

def analyze_infrastructure(predictions):
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
    
    return {
        'is_good': is_good,  # 1 for good, 0 for bad
        'quality_confidence': float(max(good_infrastructure_prob, bad_infrastructure_prob)),
        'specific_class': int(specific_class),
        'class_confidence': float(class_probs[specific_class]),
        'bad_infrastructure_prob': float(bad_infrastructure_prob),
        'good_infrastructure_prob': float(good_infrastructure_prob),
        'individual_probs': [float(p) for p in class_probs]
    }

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        img_bytes = file.read()
        
        # Preprocess the image
        processed_image = preprocess_image(img_bytes)
        
        # Get predictions
        predictions = model.predict(processed_image)
        
        # Analyze results
        analysis = analyze_infrastructure(predictions)
        
        return jsonify(analysis)
        
    except Exception as e:
        logger.error(f"Error during prediction: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)