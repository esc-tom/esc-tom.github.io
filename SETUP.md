# Setup Guide for GitHub Pages Annotation Tool

## Quick Setup (5 minutes)

### 1. Verify Files

Make sure you have these files in your repository:

```
/
├── index.html
├── README.md
├── SETUP.md (this file)
├── data/
│   ├── dialogues.json
│   └── cognitive_dimensions.json
├── scripts/
│   └── script.js
└── styles/
    └── style.css
```

### 2. Test Locally (Optional)

Before deploying, test locally:

```bash
# Navigate to the repository root
cd /Users/seacow/Documents/github/esc-tom.github.io

# Start a simple HTTP server
python3 -m http.server 8000

# Open in browser: http://localhost:8000
```

### 3. Deploy to GitHub Pages

#### Option A: Via GitHub Website

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Source", select your branch (usually `main` or `master`)
4. Under "Folder", select `/ (root)`
5. Click **Save**
6. Wait 1-2 minutes for deployment
7. Visit `https://[your-username].github.io/[repo-name]`

#### Option B: Via Command Line

```bash
# Make sure you're in the repository directory
cd /Users/seacow/Documents/github/esc-tom.github.io

# Check git status
git status

# Add all new files
git add index.html README.md SETUP.md data/ scripts/ styles/

# Commit changes
git commit -m "Set up GitHub Pages annotation tool"

# Push to GitHub
git push origin main
```

Then follow steps 2-7 from Option A above.

### 4. Add Your Data

Replace the example dialogues in `data/dialogues.json` with your actual data:

```json
{
  "your_dialogue_id": {
    "entry_id": "your_dialogue_id",
    "persona_profile": {
      "name": "Patient Name",
      "gender": "female",
      "education": "bachelor's degree",
      "occupation": "teacher",
      "traits": "extroverted, agreeable, organized, emotionally stable, open-minded"
    },
    "dialogue_history": [
      {
        "speaker": "patient",
        "utterance": "Patient's first utterance..."
      },
      {
        "speaker": "therapist",
        "utterance": "Therapist's response..."
      }
    ]
  }
}
```

### 5. Share with Annotators

Once deployed, share the URL with your annotators:
- URL: `https://[your-username].github.io/[repo-name]`
- Instruct them to register with a unique username
- Each annotator's data is stored locally in their browser

## Collecting Annotations

Since data is stored in each annotator's browser, you'll need to collect it:

### Method 1: Manual Export

Provide annotators with these instructions:

1. Open the annotation tool in your browser
2. Press F12 to open Developer Console
3. Go to the "Console" tab
4. Paste this code and press Enter:

```javascript
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

5. Right-click the output → "Copy object"
6. Paste into a text file and save as `annotations_{username}.json`
7. Send the file to you

### Method 2: Add Export Button (Advanced)

You can add an export button to the interface by modifying the code. This would allow annotators to download their data as a JSON file with one click.

## Troubleshooting

### "Dialogues not loading"
- Check if `data/dialogues.json` is valid JSON (use jsonlint.com)
- Make sure file paths are correct
- Check browser console (F12) for error messages

### "Page not found (404)"
- Wait a few minutes after enabling GitHub Pages
- Check that you selected the correct branch and folder in Settings
- Verify the repository is public (or you have GitHub Pro for private repos)

### "Everything is blank"
- Check browser console (F12) for JavaScript errors
- Verify all files were committed and pushed
- Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

## Updating the Tool

To add more dialogues or make changes:

1. Edit the appropriate files locally
2. Commit and push changes:
   ```bash
   git add .
   git commit -m "Updated dialogues"
   git push origin main
   ```
3. Changes will be live in 1-2 minutes

## Security Notes

- All annotation data stays in the annotator's browser
- No data is sent to any server
- Suitable for sensitive research data
- Advise annotators to backup their data regularly

## Support

For issues or questions:
1. Check the README.md file
2. Open an issue on GitHub
3. Contact the repository owner

---

**Happy Annotating! 🎉**

