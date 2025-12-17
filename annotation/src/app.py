from flask import Flask, render_template, jsonify, request
import json
import os
import re
from pathlib import Path

app = Flask(__name__)

# Get the project root directory
BASE_DIR = Path(__file__).resolve().parent.parent
# INPUT_DATA_FILE = BASE_DIR / "input_data" / "dialogue_results.json"
# INPUT_DATA_FILE = BASE_DIR / "input_data" / "human_val_data.json"
INPUT_DATA_FILE = BASE_DIR.parent / "data" / "esc-tom" / "annotation" / "human_annotation_tiny.json"
OUTPUT_DATA_DIR = BASE_DIR / "annotated"
QUESTIONS_FILE = BASE_DIR / "input_data" / "cognitive_model_questions.yaml"
USERS_FILE = BASE_DIR / "annotated" / "users.json"

# Load dialogues
def load_dialogues():
    with open(INPUT_DATA_FILE, 'r') as f:
        data = json.load(f)
    
    # Transform dictionary format to array format expected by frontend
    dialogues = []
    for entry_id, entry_data in data.items():
        dialogue = {
            'entry_id': entry_id,
            'dialogue_history': []
        }
        
        # Include persona_profile if available
        if 'persona_profile' in entry_data:
            dialogue['persona_profile'] = entry_data['persona_profile']
        
        # Transform dialogue_history format
        if 'dialogue_history' in entry_data:
            turns = []
            for turn in entry_data['dialogue_history']:
                # Normalize speaker name to lowercase
                speaker = turn.get('speaker', '').lower()
                # Convert 'content' to 'utterance' if needed
                utterance = turn.get('utterance') or turn.get('content', '')
                # Get strategy if present
                strategy = turn.get('strategy', '')
                
                transformed_turn = {
                    'speaker': speaker,
                    'utterance': utterance
                }
                if strategy:
                    transformed_turn['strategy'] = strategy
                
                turns.append(transformed_turn)
            
            # Assign turns directly without reordering
            dialogue['dialogue_history'] = turns
        
        dialogues.append(dialogue)
    
    return dialogues

# Load cognitive appraisal dimensions
def load_cognitive_dimensions():
    import yaml
    with open(QUESTIONS_FILE, 'r') as f:
        data = yaml.safe_load(f)
    return data['Cognitive Appraisals']['Options']

# Load existing users
def load_users():
    if USERS_FILE.exists():
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    return []

# Save users list
def save_users(users):
    os.makedirs(OUTPUT_DATA_DIR, exist_ok=True)
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/dialogues')
def get_dialogues():
    dialogues = load_dialogues()
    return jsonify(dialogues)

@app.route('/api/cognitive_dimensions')
def get_cognitive_dimensions():
    dimensions = load_cognitive_dimensions()
    return jsonify(dimensions)

@app.route('/api/users')
def get_users():
    users = load_users()
    return jsonify(users)

@app.route('/api/register_user', methods=['POST'])
def register_user():
    data = request.json
    username = data.get('username', '').strip()
    
    # Validate username
    if not username:
        return jsonify({'status': 'error', 'message': 'Username cannot be empty'}), 400
    
    if len(username) < 3:
        return jsonify({'status': 'error', 'message': 'Username must be at least 3 characters'}), 400
    
    if len(username) > 20:
        return jsonify({'status': 'error', 'message': 'Username must be at most 20 characters'}), 400
    
    # Only allow alphanumeric, underscore, and hyphen
    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        return jsonify({'status': 'error', 'message': 'Username can only contain letters, numbers, underscore, and hyphen'}), 400
    
    # Check if username already exists
    users = load_users()
    if username in users:
        return jsonify({'status': 'error', 'message': 'Username already exists'}), 400
    
    # Add new user
    users.append(username)
    save_users(users)
    
    # Create user directory
    user_dir = OUTPUT_DATA_DIR / username
    os.makedirs(user_dir, exist_ok=True)
    
    return jsonify({'status': 'success', 'message': 'User registered successfully', 'username': username})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({'status': 'error', 'message': 'Username cannot be empty'}), 400
    
    users = load_users()
    if username not in users:
        return jsonify({'status': 'error', 'message': 'Username not found'}), 404
    
    # Ensure user directory exists
    user_dir = OUTPUT_DATA_DIR / username
    os.makedirs(user_dir, exist_ok=True)
    
    return jsonify({'status': 'success', 'message': 'Login successful', 'username': username})

@app.route('/api/save_annotation', methods=['POST'])
def save_annotation():
    data = request.json
    entry_id = data.get('entry_id')
    username = data.get('username')
    
    if not username:
        return jsonify({'status': 'error', 'message': 'Username is required'}), 400
    
    # Save to user-specific annotated.json file
    user_dir = OUTPUT_DATA_DIR / username
    os.makedirs(user_dir, exist_ok=True)
    annotated_file = user_dir / "annotated.json"
    
    # Load existing annotations or create empty dict
    if annotated_file.exists():
        with open(annotated_file, 'r') as f:
            try:
                annotations = json.load(f)
            except json.JSONDecodeError:
                annotations = {}
    else:
        annotations = {}
    
    # Add/update the annotation using entry_id.json as key
    key = f"{entry_id}.json"
    annotations[key] = data
    
    # Save back to annotated.json
    with open(annotated_file, 'w') as f:
        json.dump(annotations, f, indent=4)
    
    return jsonify({'status': 'success', 'message': 'Annotation saved successfully'})

@app.route('/api/annotation/<username>/<entry_id>')
def get_annotation(username, entry_id):
    user_dir = OUTPUT_DATA_DIR / username
    annotated_file = user_dir / "annotated.json"
    
    if annotated_file.exists():
        with open(annotated_file, 'r') as f:
            try:
                annotations = json.load(f)
                key = f"{entry_id}.json"
                if key in annotations:
                    return jsonify({'exists': True, 'data': annotations[key]})
            except json.JSONDecodeError:
                pass
    
    return jsonify({'exists': False, 'data': None})

if __name__ == '__main__':
    app.run(debug=True, port=5000)

