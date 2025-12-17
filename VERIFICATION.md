# Verification Checklist

Use this checklist to verify the GitHub Pages annotation tool is set up correctly.

## File Structure ✓

- [x] `/index.html` - Main HTML file
- [x] `/README.md` - Documentation
- [x] `/SETUP.md` - Setup instructions
- [x] `/VERIFICATION.md` - This checklist
- [x] `/.gitignore` - Git ignore rules
- [x] `/styles/style.css` - CSS styling
- [x] `/scripts/script.js` - JavaScript application logic
- [x] `/data/dialogues.json` - Dialogue data
- [x] `/data/cognitive_dimensions.json` - Cognitive appraisal definitions

## Pre-Deployment Testing

### Local Testing

1. **Start Local Server**
   ```bash
   cd /Users/seacow/Documents/github/esc-tom.github.io
   python3 -m http.server 8000
   ```

2. **Open in Browser**
   - Visit: `http://localhost:8000`
   - Should see login modal

3. **Test User Registration**
   - [ ] Enter a username (e.g., "test_user")
   - [ ] Click "Register New User"
   - [ ] Should see welcome message
   - [ ] User badge should appear in header

4. **Test Dialogue Loading**
   - [ ] Dropdown should show dialogues
   - [ ] Select a dialogue
   - [ ] Should see persona profile
   - [ ] Should see dialogue turns
   - [ ] Progress bars should update

5. **Test Persona Display**
   - [ ] Name displays correctly
   - [ ] Gender displays correctly
   - [ ] Education displays correctly
   - [ ] Occupation displays correctly
   - [ ] Big Five traits display as badges

6. **Test Turn Selection**
   - [ ] Click on a turn pair
   - [ ] Should highlight with green border
   - [ ] Should show checkmark
   - [ ] Should show "Marked Turn X" notification

7. **Test BDI Annotation**
   - [ ] Type in Belief field
   - [ ] Type in Desire field
   - [ ] Type in Intention field
   - [ ] Fields should accept input

8. **Test Cognitive Appraisals**
   - [ ] Click on an appraisal dimension
   - [ ] Should appear in "Selected Appraisals" section
   - [ ] Can adjust intensity (1-10)
   - [ ] Can remove with X button
   - [ ] Can add up to 5 appraisals
   - [ ] Cannot add more than 5 (shows error)
   - [ ] Already selected dimensions are disabled

9. **Test Drag & Drop**
   - [ ] Grab appraisal by ⋮⋮ handle
   - [ ] Drag to different position
   - [ ] Order updates
   - [ ] Ranking numbers update

10. **Test Save Functionality**
    - [ ] Click "Save Annotation"
    - [ ] Should show confirmation modal
    - [ ] Summary shows correct info
    - [ ] Click "Yes, Save"
    - [ ] Should show success message
    - [ ] Progress should update
    - [ ] Dialogue marked with ✓

11. **Test Annotation Persistence**
    - [ ] Select another dialogue
    - [ ] Return to previously annotated dialogue
    - [ ] Annotations should load automatically
    - [ ] Turn selection should be highlighted
    - [ ] All fields should be populated

12. **Test Clear Button**
    - [ ] Click "Clear Annotations"
    - [ ] All fields should reset
    - [ ] Selected appraisals should clear
    - [ ] Turn highlighting should remain

13. **Test Collapsible Sections**
    - [ ] Click "BDI" header
    - [ ] Section should collapse
    - [ ] Click again to expand
    - [ ] Same for "Cognitive Appraisals" section

14. **Test Logout**
    - [ ] Click "Logout" button
    - [ ] Confirmation dialog appears
    - [ ] Click OK
    - [ ] Should return to login screen

15. **Test Login (Existing User)**
    - [ ] Enter previously registered username
    - [ ] Click "Login"
    - [ ] Should log in successfully
    - [ ] Previous annotations should be available

16. **Test Browser Console**
    - [ ] Press F12
    - [ ] Check Console tab
    - [ ] No red errors should appear

## Data Validation

### Check dialogues.json
```bash
# Validate JSON syntax
python3 -c "import json; json.load(open('data/dialogues.json'))"
```
- [ ] No syntax errors

### Check cognitive_dimensions.json
```bash
# Validate JSON syntax
python3 -c "import json; json.load(open('data/cognitive_dimensions.json'))"
```
- [ ] No syntax errors

## GitHub Deployment

1. **Commit Files**
   ```bash
   git status
   git add index.html README.md SETUP.md VERIFICATION.md .gitignore
   git add styles/ scripts/ data/
   git commit -m "Setup GitHub Pages annotation tool"
   git push origin main
   ```
   - [ ] All files committed
   - [ ] Pushed to GitHub

2. **Enable GitHub Pages**
   - [ ] Go to repository Settings
   - [ ] Navigate to Pages section
   - [ ] Select branch (main/master)
   - [ ] Select folder (root)
   - [ ] Click Save
   - [ ] Note the published URL

3. **Wait for Deployment**
   - [ ] Wait 1-2 minutes
   - [ ] Check GitHub Actions tab for deployment status
   - [ ] Should see green checkmark

4. **Test Live Site**
   - [ ] Visit the GitHub Pages URL
   - [ ] Login screen appears
   - [ ] Repeat all tests from "Local Testing" section above

## Browser Compatibility

Test on multiple browsers:

- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

## Performance

- [ ] Page loads in < 2 seconds
- [ ] Dialogues load instantly
- [ ] UI interactions are smooth
- [ ] Drag & drop is responsive
- [ ] No lag when typing

## Export Test

1. **Export Annotation Data**
   ```javascript
   // In browser console (F12)
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
   - [ ] Outputs valid JSON
   - [ ] Contains all annotations
   - [ ] Can be copied successfully

## Security & Privacy

- [ ] No server requests after page load (check Network tab)
- [ ] All data stored locally (check Application → Local Storage)
- [ ] No external scripts or tracking
- [ ] Works offline after initial load

## Documentation

- [ ] README.md is complete
- [ ] SETUP.md has clear instructions
- [ ] Code comments are helpful
- [ ] Example data is provided

## Known Limitations

Document any limitations:
- [ ] Data not synced across devices
- [ ] LocalStorage has ~5-10MB limit
- [ ] Clearing browser data deletes annotations
- [ ] No server-side backup

## Issues Found

Document any issues discovered during testing:

1. _________________________________________________
2. _________________________________________________
3. _________________________________________________

## Sign-Off

- Tested by: ____________________
- Date: ____________________
- Status: [ ] Ready for Production  [ ] Needs Fixes

## Notes

Additional observations or recommendations:

_________________________________________________________
_________________________________________________________
_________________________________________________________

