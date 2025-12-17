# ESC-ToM Annotation Tool - GitHub Pages

A web-based dialogue annotation tool for ESC-ToM (Emotional Support Conversation - Theory of Mind) research. This static site allows multiple annotators to review therapeutic dialogues and provide annotations including BDI (Belief, Desire, Intention) and cognitive appraisals.

## Live Demo

Visit the live tool at: `https://[your-username].github.io/`

## Features

- **User Management**: Register and login with username/password (password-protected, stored locally with SHA-256 hashing)
- **Dialogue Annotation**: View and annotate therapeutic dialogues
- **Persona Profiles**: Display patient information including Big Five personality traits
- **BDI Annotations**: Annotate beliefs, desires, and intentions
- **Cognitive Appraisals**: Select and rank up to 5 cognitive appraisal dimensions with intensity scores
- **Progress Tracking**: Track annotation progress across all dialogues
- **Local Storage**: All annotations saved in browser's localStorage
- **Drag & Drop**: Reorder appraisals by importance

## Quick Start

### For Users

1. Visit the GitHub Pages URL
2. Register with a username and password, or login with existing credentials
3. Select a dialogue from the dropdown
4. Review the dialogue turns
5. Click on the turn that provided minimum necessary context
6. Complete the annotation forms
7. Save your annotations

### For Developers/Administrators

#### Directory Structure

```
.
├── index.html              # Main HTML file
├── styles/
│   └── style.css          # Styling
├── scripts/
│   └── script.js          # Application logic
├── data/
│   ├── dialogues.json     # Dialogue data
│   └── cognitive_dimensions.json  # Cognitive appraisal definitions
└── README.md              # This file
```

#### Adding New Dialogues

Edit `data/dialogues.json` to add new dialogues. Format:

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
    ]
  }
}
```

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

### Local Storage Keys

All data is stored in the browser's localStorage:

- `annotation_users`: Array of registered usernames
- `annotation_passwords`: Password hashes (SHA-256) for each user
- `annotation_username`: Currently logged-in user
- `annotation_data_{username}_{dialogue_id}`: Individual annotations

**Security Note**: Passwords are hashed using SHA-256 with username as salt before storage. Plain-text passwords are never stored.

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

To export annotation data:

1. Open browser Developer Console (F12)
2. Run this JavaScript:

```javascript
// Export all annotations for current user
const username = localStorage.getItem('annotation_username');
const annotations = {};
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key.startsWith(`annotation_data_${username}_`)) {
    const dialogueId = key.replace(`annotation_data_${username}_`, '');
    annotations[dialogueId] = JSON.parse(localStorage.getItem(key));
  }
}
console.log(JSON.stringify(annotations, null, 2));
```

3. Copy the JSON output

## Browser Compatibility

- Chrome/Edge: ✅ Fully supported
- Firefox: ✅ Fully supported
- Safari: ✅ Fully supported
- Mobile browsers: ✅ Supported (responsive design)

## Limitations

- Data is stored locally in browser (not synced across devices)
- Clearing browser data will delete annotations
- No server-side backup (consider regular exports)
- Large datasets may impact performance

## Privacy & Security

- All data stays in the user's browser
- No server communication after initial page load
- No tracking or analytics
- Suitable for sensitive research data

## Development

### Running Locally

1. Clone the repository
2. Open `index.html` in a web browser
3. Or use a local server:
   ```bash
   python -m http.server 8000
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

**Issue**: Annotations not saving
- Check localStorage is enabled in browser
- Check localStorage quota (typically 5-10MB)
- Try clearing old data

**Issue**: Login not working
- Clear browser cache and localStorage
- Check browser console for errors

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

