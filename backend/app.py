import os
import uuid
import shutil
import warnings
from pathlib import Path

# Suppress torchcodec warnings
warnings.filterwarnings("ignore", message=".*torchcodec.*")

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

from backend.diarization import DiarizationService

load_dotenv()

app = Flask(__name__)
# CORS pour permettre les requêtes depuis ton site
CORS(app, origins=["*"], supports_credentials=True)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = None  # No size limit
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')

UPLOAD_FOLDER = Path(__file__).parent.parent / 'uploads'
OUTPUT_FOLDER = Path(__file__).parent.parent / 'outputs'
UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {'mp3', 'wav', 'mp4', 'mov', 'm4a', 'ogg', 'flac', 'webm', 'aac'}

# Initialize diarization service
diarization_service = DiarizationService()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return jsonify({
        'status': 'ok',
        'service': 'Gilbert Diarization API',
        'version': '1.0.0',
        'endpoints': {
            'POST /api/diarize': 'Upload audio file for speaker diarization',
            'GET /api/download/<job_id>/<filename>': 'Download a track',
            'POST /api/download-all/<job_id>': 'Download all tracks as ZIP',
            'DELETE /api/cleanup/<job_id>': 'Cleanup job files'
        }
    })


@app.route('/api/diarize', methods=['POST'])
def diarize():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    # Generate unique job ID
    job_id = str(uuid.uuid4())
    job_upload_folder = UPLOAD_FOLDER / job_id
    job_output_folder = OUTPUT_FOLDER / job_id
    job_upload_folder.mkdir(exist_ok=True)
    job_output_folder.mkdir(exist_ok=True)

    try:
        # Save uploaded file
        filename = secure_filename(file.filename)
        input_path = job_upload_folder / filename
        file.save(str(input_path))

        # Process diarization
        result = diarization_service.process(
            input_path=str(input_path),
            output_folder=str(job_output_folder)
        )

        return jsonify({
            'job_id': job_id,
            'speakers': result['speakers'],
            'segments': result['segments'],
            'tracks': result['tracks'],
            'total_duration': result['total_duration']
        })

    except Exception as e:
        # Cleanup on error
        shutil.rmtree(job_upload_folder, ignore_errors=True)
        shutil.rmtree(job_output_folder, ignore_errors=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/<job_id>/<filename>')
def download_track(job_id, filename):
    job_output_folder = OUTPUT_FOLDER / job_id
    file_path = job_output_folder / secure_filename(filename)

    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404

    # Get custom download name from query param
    download_name = request.args.get('name', filename)
    if not download_name.endswith('.wav'):
        download_name += '.wav'

    return send_file(str(file_path), as_attachment=True, download_name=download_name)


@app.route('/api/download-all/<job_id>', methods=['POST'])
def download_all(job_id):
    job_output_folder = OUTPUT_FOLDER / job_id

    if not job_output_folder.exists():
        return jsonify({'error': 'Job not found'}), 404

    # Get speaker name mappings from request body
    name_mappings = {}
    if request.is_json:
        name_mappings = request.json.get('names', {})

    # Create temp folder for renamed files
    temp_folder = OUTPUT_FOLDER / f'{job_id}_temp'
    temp_folder.mkdir(exist_ok=True)

    try:
        # Copy and rename files
        for file_path in job_output_folder.glob('*.wav'):
            original_name = file_path.stem
            new_name = name_mappings.get(original_name, original_name)
            # Sanitize the name
            new_name = secure_filename(new_name) or original_name
            shutil.copy(str(file_path), str(temp_folder / f'{new_name}.wav'))

        # Create zip file
        zip_path = OUTPUT_FOLDER / f'{job_id}.zip'
        shutil.make_archive(str(zip_path.with_suffix('')), 'zip', str(temp_folder))

        return send_file(str(zip_path), as_attachment=True, download_name='speakers.zip')
    finally:
        # Cleanup temp folder
        shutil.rmtree(temp_folder, ignore_errors=True)


@app.route('/api/cleanup/<job_id>', methods=['DELETE'])
def cleanup(job_id):
    job_upload_folder = UPLOAD_FOLDER / job_id
    job_output_folder = OUTPUT_FOLDER / job_id
    zip_path = OUTPUT_FOLDER / f'{job_id}.zip'

    shutil.rmtree(job_upload_folder, ignore_errors=True)
    shutil.rmtree(job_output_folder, ignore_errors=True)
    if zip_path.exists():
        zip_path.unlink()

    return jsonify({'message': 'Cleaned up successfully'})


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    app.run(debug=True, host='0.0.0.0', port=port)
