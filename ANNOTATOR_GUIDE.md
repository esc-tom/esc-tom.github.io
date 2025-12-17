# Annotator Quick Reference Guide

## Getting Started (First Time)

1. **Visit the Tool**
   - Open the URL provided by your research coordinator
   - Example: `https://username.github.io/repo-name`

2. **Register Your Username and Password**
   - Enter a unique username (3-20 characters)
   - Use only letters, numbers, underscore (_), or hyphen (-)
   - Enter a secure password (minimum 6 characters)
   - Confirm your password by entering it again
   - Click "Register New User"
   - **Remember both your username and password** - you'll need them to log in later!
   - **Store your password securely** - it cannot be recovered if forgotten

3. **Start Annotating**
   - Select a dialogue from the dropdown
   - Read through the conversation
   - Complete the annotation forms

## Interface Overview

### Header Section
- **Dialogue Selector**: Choose which dialogue to annotate
- **Progress Bar**: Shows how many dialogues you've completed
- **User Badge**: Shows your username and logout button

### Left Panel: Dialogue History
- **Patient Profile**: Shows demographic and personality information
- **Dialogue Turns**: Patient utterances (red border), Therapist utterances (green border)
- **Turn Numbers**: Click on turns to mark minimum context needed

### Right Panel: Annotations
- **BDI Section**: Annotate beliefs, desires, and intentions
- **Cognitive Appraisals**: Select and rank emotional dimensions
- **Action Buttons**: Save or clear your annotations

## How to Annotate

### Step 1: Read the Dialogue

1. Select a dialogue from the dropdown
2. Review the patient profile (name, occupation, personality traits)
3. Read through all dialogue turns carefully
4. Patient speaks first (red), therapist responds (green)

### Step 2: Mark Minimum Context Turn

**Important**: Click on the turn that first gave you enough context to make your annotation.

- Click anywhere on a turn pair card
- It will highlight in green with a checkmark
- This marks "minimum necessary context"
- Click again to unmark

### Step 3: Complete BDI Annotations

**Belief**: What belief must the patient have held?
- Format: "I believe that [your answer]"
- Example: "I believe that I am not qualified for my job"

**Desire**: What fundamental goal were they trying to achieve?
- Format: "I wish to [your answer]"
- Example: "I wish to feel competent and accepted"

**Intention**: What was their specific plan?
- Format: "I intend to [your answer]"
- Example: "I intend to avoid making mistakes"

### Step 4: Select Cognitive Appraisals

1. **Review Available Dimensions**
   - All 14 options are shown in a grid
   - Each shows a name and description
   - Read carefully before selecting

2. **Select Dimensions** (up to 5)
   - Click on dimensions that apply
   - They'll move to "Selected Appraisals" below
   - Most salient emotions first

3. **Set Intensity** (1-10 scale)
   - 1 = Minimal intensity
   - 5 = Moderate intensity
   - 10 = Maximum intensity

4. **Rank by Importance**
   - Grab the ⋮⋮ handle
   - Drag to reorder
   - #1 = Most important
   - #5 = Least important

5. **Remove if Needed**
   - Click the ✕ button
   - Dimension returns to available options

### Step 5: Save Your Work

1. Click "Save Annotation"
2. Review the confirmation summary
3. Click "Yes, Save"
4. Success message appears
5. Progress updates automatically
6. Tool loads next unannotated dialogue

## Tips & Best Practices

### General Tips
- ✓ Take your time - quality over speed
- ✓ Read the entire dialogue before annotating
- ✓ Mark the turn where you had enough context
- ✓ Be specific and clear in your BDI statements
- ✓ Save frequently (annotations persist in your browser)

### Cognitive Appraisals
- ✓ Focus on the patient's emotional response
- ✓ Select only the most salient dimensions
- ✓ Don't worry about filling all 5 slots if fewer apply
- ✓ Intensity reflects how strongly the dimension is present
- ✓ Order matters - most important first

### What to Avoid
- ✗ Don't rush through dialogues
- ✗ Don't select dimensions just to fill slots
- ✗ Don't forget to mark minimum context turn
- ✗ Don't forget to save before switching dialogues
- ✗ Don't clear your browser data without exporting first

## Managing Your Annotations

### Returning Later
1. Open the tool and login with your username and password
2. Your progress is saved in your browser
3. Previously annotated dialogues show with ✓
4. Click any dialogue to view/edit your annotation

**Important**: Your password protects your annotations. Only someone with your password can access or modify your work.

### Editing Existing Annotations
1. Select a previously annotated dialogue
2. Your annotations load automatically
3. Make changes as needed
4. Click "Save Annotation" again
5. Previous version is overwritten

### Tracking Progress
- Top progress bar shows: "X / Y dialogues annotated"
- Percentage shows completion rate
- Checkmarks (✓) appear next to completed dialogues
- Tool auto-loads next unannotated dialogue after saving

## Exporting Your Data

**Important**: Your data is stored in YOUR browser only!

### When to Export
- Before clearing browser data
- Before switching computers
- At regular intervals (daily/weekly)
- When you complete all dialogues

### How to Export

1. **Open Developer Console**
   - Windows/Linux: Press F12
   - Mac: Press Cmd+Option+J
   - Or: Right-click → "Inspect" → "Console" tab

2. **Copy and Paste This Code**
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

3. **Copy the Output**
   - Right-click on the output
   - Select "Copy object"
   - Or manually select all text and copy

4. **Save to File**
   - Open a text editor (Notepad, TextEdit, etc.)
   - Paste the data
   - Save as: `annotations_YourUsername_YYYYMMDD.json`
   - Example: `annotations_john_20251217.json`

5. **Send to Coordinator**
   - Email the file to your research coordinator
   - Or upload to the designated location

## Keyboard Shortcuts

- **Tab**: Move between form fields
- **Enter**: (in login) Submit username
- **Escape**: Close modals/notifications
- **Ctrl+S / Cmd+S**: Save annotation (when page is focused)

## UI Features Explained

### Collapsible Sections
- Click section headers to collapse/expand
- ▼ = Expanded
- ▶ = Collapsed
- Helps focus on one section at a time

### Progress Bars
- **Top Bar**: Overall completion (all dialogues)
- **Left Panel Bar**: Current dialogue viewing progress

### Color Coding
- **Red border**: Patient utterances
- **Green border**: Therapist utterances
- **Green highlight**: Selected minimum context turn
- **Green checkmark**: Completed dialogue

### Notifications
- Appear at top center of screen
- Auto-dismiss after 3 seconds
- Click ✕ to dismiss immediately
- Colors: Green = success, Red = error, Blue = info

## Troubleshooting

### "Login not working"
- Make sure you registered first
- Check username spelling (it's case-sensitive)
- Verify your password is correct
- If you forgot your password, contact your research coordinator
- Try refreshing the page (F5)

### "Dialogues not loading"
- Check your internet connection
- Refresh the page (F5)
- Clear cache (Ctrl+Shift+Delete)
- Contact research coordinator

### "Can't save annotation"
- Make sure you selected a dialogue
- Check browser console (F12) for errors
- Try logging out and back in

### "Lost my annotations"
- Did you clear browser data? (can't recover)
- Are you on a different computer? (data is local)
- Did you use a different browser? (data is per-browser)
- Export regularly to prevent loss!

### "Can't drag appraisals"
- Click and hold the ⋮⋮ handle
- Make sure you're not on a touch device without drag support
- Try using arrow instead: remove and re-add in order

### "Tool is slow"
- Close other browser tabs
- Check available memory
- Try a different browser
- Clear cache

## Privacy & Data

### What Data is Stored?
- Your username
- Your password (securely hashed - not stored in plain text)
- Your annotations (BDI, cognitive appraisals)
- Dialogue IDs you've annotated
- Timestamps of saves

### Where is Data Stored?
- In YOUR browser's localStorage
- NOT on any server
- NOT synced across devices
- NOT accessible to others

### Is My Data Safe?
- ✓ Data never leaves your computer
- ✓ No tracking or analytics
- ✓ Suitable for sensitive content
- ✗ Vulnerable to browser data clearing
- ✗ Not backed up automatically
- → Export regularly!

## Getting Help

### Technical Issues
1. Try refreshing the page (F5)
2. Check browser console for errors (F12)
3. Try a different browser
4. Contact research coordinator

### Annotation Questions
1. Review this guide
2. Re-read the annotation protocol
3. Contact research coordinator
4. Attend training session

## Best Practices Summary

1. **Set up your workspace**
   - Quiet environment
   - Stable internet connection
   - Comfortable seating
   - Adequate time

2. **Before starting**
   - Review annotation guidelines
   - Understand BDI framework
   - Familiarize with cognitive dimensions
   - Test the export process

3. **During annotation**
   - Read entire dialogue first
   - Mark minimum context accurately
   - Be specific in BDI statements
   - Select most salient appraisals only
   - Save after each dialogue

4. **After each session**
   - Export your data
   - Send to coordinator (if required)
   - Note any questions or issues
   - Track your progress

5. **Regular maintenance**
   - Export data weekly
   - Don't clear browser data
   - Keep browser updated
   - Bookmark the tool

## Contact Information

Research Coordinator: [Contact info here]
Technical Support: [Contact info here]
Emergency Contact: [Contact info here]

---

**Thank you for your contributions to this research!** 🙏

