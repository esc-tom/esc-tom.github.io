# Prolific Integration Guide

## Overview

Your ESC-ToM annotation platform is now fully integrated with Prolific for crowdsourced data collection. Participants can seamlessly access the study through Prolific, complete annotations, and automatically return to Prolific with their completion code.

## Features Implemented

✅ **Automatic Participant Detection**: Detects Prolific sessions via URL parameters
✅ **Auto-Registration**: Creates accounts automatically for Prolific participants
✅ **Unique Assignment**: Each participant gets 10 unique dialogues
✅ **Duplicate Prevention**: Prevents the same participant from completing the study twice
✅ **Completion Tracking**: Tracks study completion time and status
✅ **Automatic Redirect**: Redirects participants back to Prolific upon completion
✅ **Completion Code Display**: Shows completion code as backup
✅ **Error Handling**: Graceful error messages for edge cases

## Setup Instructions

### Step 1: Configure Your Prolific Study

1. **Create a new study on Prolific**
2. **Set the study URL** to your GitHub Pages URL with Prolific redirect parameters:
   ```
   https://your-username.github.io/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
   ```
   - Replace `your-username` with your actual GitHub username
   - The template variables will be automatically filled by Prolific

3. **Set completion option** to "I'll redirect them using a URL"

### Step 2: Get Your Completion Code

1. In your Prolific study settings, find the **Completion Code**
2. Copy the completion code (format: `C1A2B3D4`)

### Step 3: Update Configuration

Edit `scripts/prolific-config.js` and update:

```javascript
const PROLIFIC_CONFIG = {
    // Enable Prolific mode
    enabled: true,
    
    // Replace with YOUR completion code from Prolific
    completionCode: 'C1A2B3D4',  // ⚠️ CHANGE THIS!
    
    // Other settings can stay as defaults
    redirectOnComplete: true,
    showCompletionCode: true,
    checkDuplicates: true,
    // ...
};
```

### Step 4: Test Everything

#### Test Mode (Preview)
1. Visit your site with test parameters:
   ```
   https://your-username.github.io/?PROLIFIC_PID=test123&STUDY_ID=test&SESSION_ID=test
   ```
2. Verify:
   - ✅ No login modal appears
   - ✅ Welcome message shows
   - ✅ 10 dialogues are assigned
   - ✅ Can complete annotations
   - ✅ Completion screen shows
   - ✅ Redirect works (or completion code displays)

#### Real Prolific Test
1. Use Prolific's **Preview** feature
2. Go through the entire annotation flow
3. Verify completion and redirect work

### Step 5: Launch Study

1. Set appropriate compensation based on pilot testing
2. Configure eligibility requirements
3. Set number of participants needed
4. Launch study!

## How It Works

### Participant Flow

```
1. Prolific → Your Site (with URL parameters)
   ↓
2. System detects Prolific session
   ↓
3. Auto-creates account (username: prolific_PARTICIPANT_ID)
   ↓
4. Assigns 10 unique dialogues
   ↓
5. Participant completes annotations
   ↓
6. System marks completion in Firebase
   ↓
7. Shows completion code & countdown
   ↓
8. Auto-redirects to Prolific
```

### Data Stored

For each Prolific participant, the system stores:

```javascript
{
  username: "prolific_5f8a2b1c3d4e",
  email: "prolific_5f8a2b1c3d4e@annotation.local",
  assignedDialogues: ["entry_123", "entry_456", ...],
  prolific: {
    participantId: "5f8a2b1c3d4e",
    studyId: "64b7c1a2",
    sessionId: "session_xyz",
    registeredAt: "2026-01-02T10:30:00Z",
    completedAt: "2026-01-02T11:15:00Z",
    completionTime: 2700, // seconds
    status: "completed"
  },
  createdAt: "2026-01-02T10:30:00Z"
}
```

## Configuration Options

Edit `scripts/prolific-config.js` to customize behavior:

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable Prolific integration |
| `completionCode` | `'C1A2B3D4'` | Your Prolific completion code |
| `completionURL` | Prolific URL | Redirect destination |
| `autoRegister` | `true` | Auto-register participants |
| `redirectOnComplete` | `true` | Auto-redirect after completion |
| `showCompletionCode` | `true` | Display completion code on screen |
| `checkDuplicates` | `true` | Prevent duplicate participation |
| `minTimePerDialogue` | `0` | Minimum time per dialogue (seconds) |
| `debug` | `true` | Show debug info in console |

## Duplicate Prevention

The system automatically prevents duplicate participation:

1. **Check on entry**: When a Prolific participant arrives, the system checks if their `PROLIFIC_PID` already exists in the database
2. **Block if found**: If found, shows an error message and prevents access
3. **Firebase query**: Uses Firestore query to check `prolific.participantId` field

**What participants see if they try to participate twice:**
> ⚠️ Already Participated
> 
> You have already participated in this study.
> Our records show that your Prolific ID has already been used.
> Please return to Prolific and return this submission.

## Timing & Compensation

### Estimating Study Duration

1. Test with 3-5 people internally
2. Calculate average time per dialogue
3. Multiply by 10 (dialogues per participant)
4. Add 2-3 minutes for instructions/setup
5. **Example**:
   - 3 minutes per dialogue × 10 = 30 minutes
   - + 3 minutes setup = **33 minutes total**

### Setting Fair Compensation

- UK minimum wage: £12/hour
- For 33 minutes: £6.60
- Consider Prolific's recommended rate
- **Tip**: Round up to ensure fair pay

### Timing Validation (Optional)

You can enable minimum time requirements:

```javascript
// In prolific-config.js
minTimePerDialogue: 60  // Require at least 60 seconds per dialogue
```

This helps identify rushed/low-quality responses.

## Monitoring Your Study

### View Participant Data

Access Firebase Console to see:
- Number of participants registered
- Completion status
- Time taken per participant
- Annotations submitted

### Export Data

Use the Firebase Console or create a script to export:
```javascript
// Get all Prolific participants
const participants = await firebaseStorage.db.collection('users')
    .where('prolific.participantId', '!=', null)
    .get();

// Get their annotations
participants.forEach(async (doc) => {
    const userId = doc.id;
    const annotations = await firebaseStorage.db.collection('annotations')
        .where('userId', '==', userId)
        .get();
    // Process annotations...
});
```

## Troubleshooting

### Issue: Participants can't access the study

**Check:**
1. Is `enabled: true` in `prolific-config.js`?
2. Are URL parameters being passed correctly?
3. Check browser console for errors
4. Verify Firebase is initialized

### Issue: Redirect not working

**Solutions:**
1. Verify `completionCode` is correct
2. Check `redirectOnComplete: true`
3. Make sure completion code is copied exactly from Prolific
4. Test redirect URL manually

### Issue: Duplicate prevention not working

**Solutions:**
1. Verify `checkDuplicates: true`
2. Check Firebase index for `prolific.participantId`
3. Ensure Firebase rules allow querying this field

### Issue: Study seems too fast/slow

**Adjust:**
1. Review timing data in Firebase
2. Adjust compensation if needed
3. Consider adding `minTimePerDialogue` if you suspect rushing
4. Add attention checks if quality is an issue

## Quality Control

### Built-in Features

1. **Ground Truth Pre-fill**: Participants revise existing annotations (reduces random responses)
2. **Context Marking**: Requires engagement with dialogue
3. **Utterance Editing**: Optional but shows careful reading
4. **Completion Tracking**: Time stamps help identify rushed work

### Additional Checks (Optional)

You could add:
- **Attention check dialogues**: Known annotations to verify quality
- **Minimum edit requirement**: Require at least N changes from ground truth
- **Time thresholds**: Flag participants who complete too quickly
- **Post-hoc filtering**: Review and filter by completion time

## Testing Checklist

Before launching:

- [ ] Updated `completionCode` in config
- [ ] Tested with preview link from Prolific
- [ ] Verified auto-registration works
- [ ] Confirmed 10 dialogues assigned correctly
- [ ] Tested full annotation flow
- [ ] Verified completion screen shows
- [ ] Tested redirect to Prolific
- [ ] Checked duplicate prevention
- [ ] Reviewed Firebase data structure
- [ ] Set appropriate compensation
- [ ] Tested on multiple browsers
- [ ] Verified mobile responsiveness

## Support & Contact

### For Participants

If participants report issues:
1. Check if they're using an updated browser
2. Verify they followed the Prolific link (not direct URL)
3. Check Firebase logs for their participant ID
4. Provide manual completion code if needed

### For Researchers

- Firebase Console: Access real-time data
- Browser Console: Check logs with `debug: true`
- GitHub Issues: Report bugs or feature requests

## FAQ

**Q: Can I run Prolific and regular users simultaneously?**
A: Yes! The system automatically detects Prolific sessions via URL parameters. Regular users will see the login screen.

**Q: What if a participant's session times out?**
A: Progress is saved in Firebase. They can log back in (but Prolific won't send them back automatically).

**Q: Can I change the number of dialogues per participant?**
A: Yes, edit `DIALOGUES_PER_USER` in `scripts/script.js`.

**Q: How do I export annotations for analysis?**
A: Use Firebase Console to export the `annotations` collection, or use the Firebase Admin SDK.

**Q: Can I preview without registering?**
A: No, preview mode will auto-register. Use test participant IDs for testing.

**Q: What happens if Firebase is down?**
A: Participants will see an error. Have a backup completion code ready.

---

**Last Updated**: January 2, 2026
**Status**: ✅ Ready for Production
**Integration Version**: 1.0

