# Gilbert - Speaker Diarization

Application de séparation de locuteurs utilisant pyannote.audio 3.1.

## Architecture

- **Backend** : API Flask (à déployer sur Render)
- **Frontend** : HTML/CSS/JS statique (à héberger sur ton site)

## Déploiement du Backend sur Render

### 1. Créer un compte Hugging Face et obtenir un token

1. Va sur https://huggingface.co et crée un compte
2. Va sur https://huggingface.co/settings/tokens
3. Crée un token avec accès en lecture
4. Accepte les conditions d'utilisation du modèle :
   - https://huggingface.co/pyannote/speaker-diarization-3.1
   - https://huggingface.co/pyannote/segmentation-3.0

### 2. Déployer sur Render

1. Connecte-toi à https://render.com avec ton compte GitHub
2. Clique sur "New +" > "Web Service"
3. Connecte ton repository GitHub
4. Configure :
   - **Name** : gilbert-diarization-api
   - **Runtime** : Python 3
   - **Build Command** : `pip install --upgrade pip && pip install -r requirements.txt`
   - **Start Command** : `gunicorn backend.app:app --bind 0.0.0.0:$PORT --timeout 600 --workers 1`
5. Ajoute la variable d'environnement :
   - **Key** : `HF_TOKEN`
   - **Value** : ton token Hugging Face
6. Clique sur "Create Web Service"

### 3. Note l'URL de ton API

Une fois déployé, tu auras une URL comme :
`https://gilbert-diarization-api.onrender.com`

## Configuration du Frontend

1. Ouvre `frontend-standalone/index.html`
2. Modifie la ligne :
```javascript
window.API_URL = 'https://YOUR-APP-NAME.onrender.com';
```
3. Remplace par l'URL de ton backend Render

## Hébergement du Frontend

Copie les fichiers du dossier `frontend-standalone/` sur ton hébergeur :
- `index.html`
- `style.css`
- `app.js`
- `images/` (dossier avec logo.svg et loading.svg)

## Développement local

```bash
# Backend
cd backend
pip install -r ../requirements.txt
python app.py

# Le frontend-standalone peut être ouvert directement dans un navigateur
# ou servi avec un serveur local :
cd frontend-standalone
python -m http.server 8000
```

## Licence

MIT - Powered by [pyannote.audio](https://github.com/pyannote/pyannote-audio)
