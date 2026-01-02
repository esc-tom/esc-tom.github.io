# ESC-ToM Annotation Tool - GitHub Pages

A web-based dialogue annotation tool for ESC-ToM (Emotional Support Conversation - Theory of Mind) research. This static site uses a **revision-based workflow** where annotators review and revise pre-filled ground truth annotations for therapeutic dialogues.

## Live Demo

Visit the live tool at: `https://[your-username].github.io/`

## Features

- **🔄 Revision-Based Workflow**: Ground truth BDI and appraisals are pre-filled for review and revision
- **✏️ Utterance Editing**: Edit dialogue utterances to fix weird/unclear content
- **🔐 User Management**: Register and login with username/password (Firebase Authentication)
- **📝 BDI Annotations**: Review and revise pre-filled beliefs, desires, and intentions
- **🧠 Cognitive Appraisals**: Modify pre-selected appraisal dimensions and adjust intensity scores (1-5)
- **🎯 Context Marking**: Mark the turn that provides minimum necessary context
- **👤 Persona Profiles**: Display patient information including Big Five personality traits
- **📊 Progress Tracking**: Track annotation progress across all dialogues
- **☁️ Cloud Storage**: All annotations saved in Firebase Firestore (automatic backup, real-time sync)
- **🔄 Drag & Drop**: Reorder appraisals by importance
- **📱 Multi-Device**: Access your annotations from any device

## Quick Start

### For Annotators

1. **Visit** the GitHub Pages URL
2. **Register** with a username and password, or login with existing credentials
3. **Select** a dialogue from the dropdown
4. **Review** the dialogue - ground truth BDI and appraisals are automatically pre-filled
5. **Edit** any weird/unclear utterances by clicking the "Edit" button
6. **Mark** the turn that provided minimum necessary context (click on the turn pair)
7. **Revise** the pre-filled BDI and cognitive appraisals as needed
8. **Save** your revised annotations

**💡 Tip**: You're reviewing and revising ground truth, not creating annotations from scratch!

### For Developers/Administrators

#### Directory Structure

```
.
├── index.html              # Main HTML file
├── styles/
│   └── style.css          # Styling
├── scripts/
│   ├── script.js          # Application logic
│   └── firebase-storage.js  # Firebase cloud storage client
├── data/
│   ├── dialogues.json     # Dialogue data
│   └── cognitive_dimensions.json  # Cognitive appraisal definitions
├── FIREBASE_SETUP.md      # Complete Firebase setup guide
├── FIREBASE_QUICKSTART.md # Quick 15-minute setup
└── README.md              # This file
```

#### Adding New Dialogues

Edit `data/dialogues.json` to add new dialogues. **Required**: Include `ground_truth` for revision-based workflow.

```json
{
  "dialogue_id": {
    "entry_id": "dialogue_id",
    "persona_profile": {
      "name": "Patient Name",
      "gender": "female/male",
      "education": "education level",
      "occupation": "occupation",
      "traits": "personality description including Big Five traits"
    },
    "dialogue_history": [
      {
        "speaker": "patient",
        "utterance": "The patient's utterance text"
      },
      {
        "speaker": "therapist",
        "utterance": "The therapist's response"
      }
    ],
    "ground_truth": {
      "belief": "The patient's belief statement",
      "desire": "The patient's desire statement",
      "intention": "The patient's intention statement",
      "cognitive_appraisals": [
        "Dimension1",
        "Dimension2",
        "Dimension3"
      ]
    }
  }
}
```

**Note**: Ground truth is pre-filled for annotators to review and revise. Appraisal dimension names must match keys in `cognitive_dimensions.json`.

**Big Five Traits Recognition**:
The system automatically detects these traits from the `traits` field:
- Extraversion: "extroverted" or "introverted"
- Agreeableness: "agreeable" or "antagonistic"  
- Conscientiousness: "organized" or "careless"
- Neuroticism: "emotionally stable" or "emotionally unstable"
- Openness: "open-minded" or "conservative"

#### Modifying Cognitive Dimensions

Edit `data/cognitive_dimensions.json` to modify the cognitive appraisal options:

```json
[
  {"dimension_key": "Description of the dimension"},
  ...
]
```

#### Deploying to GitHub Pages

1. Push your changes to the repository
2. Go to repository Settings → Pages
3. Select branch (usually `main` or `master`)
4. Select root directory `/`
5. Save and wait for deployment

## Data Storage

### Firebase Cloud Storage

All data is stored in **Firebase Firestore** (cloud database):

#### Collections:

**`users` collection**:
- User profiles (username, email, creation date)
- Indexed by Firebase Auth UID

**`annotations` collection**:
- Individual annotations for each dialogue
- Document ID format: `{userId}_{dialogueId}`
- Includes user metadata and timestamps

**Security**: 
- Firebase Authentication handles user login
- Passwords managed securely by Firebase (never stored in plain text)
- Firestore Security Rules restrict users to their own data
- All communication encrypted (HTTPS)

### Setup Firebase

See **[FIREBASE_QUICKSTART.md](FIREBASE_QUICKSTART.md)** for 15-minute setup guide.

For detailed instructions, see **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)**.

### Annotation Data Format

Each saved annotation includes:
```json
{
  "entry_id": "dialogue_id",
  "username": "annotator_name",
  "turns_viewed": 6,
  "total_turns": 6,
  "ready_to_annotate_turn": 0,
  "min_context_turn": 2,
  "belief": "I believe that...",
  "desire": "I wish to...",
  "intention": "I intend to...",
  "cognitive_appraisals": [
    {
      "dimension": "goal_incongruence",
      "description": "The outcome is not aligned with personal goals/desires.",
      "intensity": 8
    }
  ],
  "timestamp": "2025-12-17T10:30:00.000Z"
}
```

## Exporting Annotations

### Method 1: Firebase Console (Easy)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click **Firestore Database**
4. Select `annotations` collection
5. Click **Export** (top right)
6. Download as JSON

### Method 2: Browser Console (For Current User)

1. Open browser Developer Console (F12)
2. Run this JavaScript:

```javascript
// Export current user's annotations
const data = await window.firebaseStorage.exportUserData();
console.log(JSON.stringify(data, null, 2));
// Right-click → Copy → Paste into text editor → Save as JSON
```

### Method 3: Export All Annotations (Admin)

```javascript
// In browser console
const snapshot = await firebase.firestore().collection('annotations').get();
const annotations = [];
snapshot.forEach(doc => annotations.push(doc.data()));
console.log(JSON.stringify(annotations, null, 2));
```

## Browser Compatibility

- Chrome/Edge: ✅ Fully supported
- Firefox: ✅ Fully supported
- Safari: ✅ Fully supported
- Mobile browsers: ✅ Supported (responsive design)

## Limitations

- Requires internet connection for Firebase sync
- Firebase free tier limits:
  - 1 GB storage
  - 50,000 reads/day
  - 20,000 writes/day
  - (More than enough for typical research use)
- Large dialogues may impact initial load time

## Privacy & Security

- Firebase Authentication for secure login
- Firestore Security Rules protect user data
- Users can only access their own annotations
- All communication encrypted (HTTPS)
- Google Cloud infrastructure (GDPR compliant)
- No third-party tracking or analytics
- Suitable for sensitive research data (configure Firebase for your institution)

## Development

### Running Locally

1. Clone the repository
2. **Set up Firebase** (see [FIREBASE_QUICKSTART.md](FIREBASE_QUICKSTART.md))
3. Add your Firebase config to `scripts/script.js`
4. Start local server:
   ```bash
   python3 -m http.server 8000
   # Visit http://localhost:8000
   ```

### Customization

- **Colors**: Edit CSS variables in `styles/style.css`
- **UI Text**: Edit strings in `index.html` and `scripts/script.js`
- **Behavior**: Modify logic in `scripts/script.js`

## Troubleshooting

**Issue**: Dialogues not loading
- Check browser console for errors
- Verify `data/dialogues.json` is valid JSON
- Check file paths are correct

**Issue**: Firebase initialization fails
- Verify Firebase config is correct in `script.js`
- Check Firebase CDN scripts are loaded in `index.html`
- Check browser console for error messages
- Verify Firestore database is enabled

**Issue**: Annotations not saving
- Check internet connection
- Verify Firebase Security Rules allow writes
- Check browser console for permission errors
- Try logging out and back in

**Issue**: Login not working
- Ensure password is at least 6 characters
- Check Firebase Authentication is enabled
- Check browser console for specific error messages
- Verify user exists (try registering first)

**Issue**: "Permission denied" errors
- Check Firestore Security Rules in Firebase Console
- Verify user is logged in
- Check that rules allow authenticated users

## Citation

If you use this tool in your research, please cite:

```
[Your citation information here]
```

## License

[Your license information here]

## Contact

For questions or issues, please open a GitHub issue or contact [your-email@example.com]

## Original Flask Application

This is a static version of the original Flask application found in the `annotation/` directory. The Flask version includes server-side storage and is suitable for controlled research environments.

