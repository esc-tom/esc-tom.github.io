# Automatic Rejection for Poor Instruction Reading

## Overview

Your annotation tool now automatically rejects Prolific submissions if participants don't properly read the instructions. This ensures high-quality annotations by filtering out participants who skip or rush through the instructions.

## Quick Start

### Enable/Disable

Edit `scripts/prolific-config.js`:

```javascript
instructionChecks: {
    enabled: true,  // Set to false to disable automatic rejection
    // ...
}
```

### Configure Thresholds

```javascript
instructionChecks: {
    enabled: true,
    minScrollPercentage: 75,      // Minimum % of instructions scrolled
    minReadingTimeSeconds: 10,    // Minimum seconds spent reading
    requireBoth: true,            // Must meet BOTH criteria (true) or EITHER (false)
    showWarning: true
}
```

## How It Works

### 1. Instruction Reading Tracking

When participants first view the instructions:
- ✅ System tracks scroll position (0-100%)
- ✅ System tracks time spent (in seconds)
- ✅ Data saved to Firebase on first attempt to proceed

### 2. Quality Check on Completion

When participants finish all annotations:
- ✅ System retrieves instruction reading data
- ✅ Checks against configured thresholds
- ✅ Either **accepts** or **rejects** the submission

### 3. Acceptance Flow

**If quality check PASSES:**
```
Complete annotations
  ↓
Quality check: PASSED ✅
  ↓
Show completion screen
  ↓
Redirect to Prolific with completion code
  ↓
Participant gets paid 💰
```

### 4. Rejection Flow

**If quality check FAILS:**
```
Complete annotations
  ↓
Quality check: FAILED ❌
  ↓
Log rejection reason to Firebase
  ↓
Show rejection screen (8 seconds)
  ↓
Redirect to Prolific with NOCODE
  ↓
Submission returned (no payment)
```

## Configuration Examples

### Conservative (Minimal Filtering)

Catches only obvious instruction-skippers:

```javascript
instructionChecks: {
    enabled: true,
    minScrollPercentage: 50,      // Read at least half
    minReadingTimeSeconds: 5,     // Spend at least 5 seconds
    requireBoth: false,           // Pass if either criterion met
    showWarning: true
}
```

**Effect:** Very lenient, only rejects clear violations

### Standard (Recommended)

Balanced quality control:

```javascript
instructionChecks: {
    enabled: true,
    minScrollPercentage: 75,      // Read at least 75%
    minReadingTimeSeconds: 10,    // Spend at least 10 seconds
    requireBoth: true,            // Must meet both criteria
    showWarning: true
}
```

**Effect:** Filters out rushed participants while being fair

### Strict (High Quality)

Maximum quality requirements:

```javascript
instructionChecks: {
    enabled: true,
    minScrollPercentage: 95,      // Read almost everything
    minReadingTimeSeconds: 30,    // Spend at least 30 seconds
    requireBoth: true,            // Must meet both criteria
    showWarning: true
}
```

**Effect:** Only accepts very careful readers, may increase rejection rate

### Disabled

No automatic rejection:

```javascript
instructionChecks: {
    enabled: false,
    // Other settings ignored when disabled
}
```

**Effect:** Data still tracked but no automatic rejection

## Understanding `requireBoth`

### requireBoth: true (Stricter)

Both scroll AND time must meet thresholds:

| Scroll | Time | Result |
|--------|------|--------|
| 80% ✅ | 15s ✅ | **PASS** ✅ |
| 80% ✅ | 5s ❌ | **FAIL** ❌ (insufficient time) |
| 60% ❌ | 15s ✅ | **FAIL** ❌ (insufficient scroll) |
| 60% ❌ | 5s ❌ | **FAIL** ❌ (both insufficient) |

### requireBoth: false (More Lenient)

Either scroll OR time can meet threshold:

| Scroll | Time | Result |
|--------|------|--------|
| 80% ✅ | 15s ✅ | **PASS** ✅ |
| 80% ✅ | 5s ❌ | **PASS** ✅ (scroll sufficient) |
| 60% ❌ | 15s ✅ | **PASS** ✅ (time sufficient) |
| 60% ❌ | 5s ❌ | **FAIL** ❌ (neither sufficient) |

## What Participants See

### Warning During Instructions

If they try to proceed before scrolling 80%:
```
⚠️ Please read at least 80% of the instructions before proceeding.
You've read 60% of the content.
```

### Rejection Screen (After Completion)

If they're rejected after completing annotations:

```
⚠️ Submission Not Accepted

Unfortunately, your submission does not meet the minimum quality 
requirements for this study.

Instruction Reading Requirements:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scroll Progress:    60.5% / 75% required ❌
Reading Time:       5s / 10s required ❌

Important: Reading the instructions thoroughly is essential for 
providing high-quality annotations.

You will be automatically redirected to Prolific in 8 seconds.
Your submission will be marked as incomplete.
```

## Firebase Data Structure

### Instruction Reading Data

Stored in `users/{userId}`:

```javascript
{
  first_instruction_read: {
    scrollPercentage: 85.3,
    readingTimeSeconds: 25,
    timestamp: "2026-01-19T10:30:00Z",
    reachedBottom: true
  }
}
```

### Rejection Data

Added when rejected:

```javascript
{
  prolific: {
    status: "rejected",
    rejectionReason: "insufficient scroll (60.5% < 75%), insufficient reading time (5s < 10s)",
    rejectedAt: "2026-01-19T10:45:00Z",
    qualityCheckData: {
      scrollPercentage: 60.5,
      readingTimeSeconds: 5,
      completionTime: 450
    }
  }
}
```

### Completion Data (Normal)

When accepted:

```javascript
{
  prolific: {
    status: "completed",
    completedAt: "2026-01-19T10:45:00Z",
    completionTime: 450
  }
}
```

## Testing Your Configuration

### Test Rejection Flow

1. Access your site with test Prolific parameters:
   ```
   https://your-site.com/?PROLIFIC_PID=test_reject&STUDY_ID=test&SESSION_ID=test
   ```

2. Intentionally fail the quality check:
   - Open instructions
   - Scroll only 50% (don't reach bottom)
   - Click "Ready to Annotate" after 3 seconds
   
3. Complete all annotations normally

4. Verify:
   - ✅ Rejection screen appears
   - ✅ Shows your scroll % and time
   - ✅ Redirects to `https://app.prolific.com/submissions/complete?cc=NOCODE`
   - ✅ Firebase shows `status: "rejected"`

### Test Acceptance Flow

1. Access with different test parameters:
   ```
   https://your-site.com/?PROLIFIC_PID=test_accept&STUDY_ID=test&SESSION_ID=test
   ```

2. Properly read instructions:
   - Open instructions
   - Scroll to the bottom (100%)
   - Spend at least 15 seconds reading
   
3. Complete all annotations normally

4. Verify:
   - ✅ Completion screen appears
   - ✅ Shows completion code
   - ✅ Redirects to completion URL (not NOCODE)
   - ✅ Firebase shows `status: "completed"`

## Monitoring Rejections

### View Rejected Participants in Firebase

Firebase Console → users collection → Filter:
```
prolific.status == "rejected"
```

### Export Rejection Data

Using Firebase Console or Admin SDK:

```javascript
// Get all rejected submissions
const rejected = await db.collection('users')
    .where('prolific.status', '==', 'rejected')
    .get();

rejected.forEach(doc => {
    const data = doc.data();
    console.log({
        participantId: data.prolific.participantId,
        reason: data.prolific.rejectionReason,
        scrollPct: data.prolific.qualityCheckData.scrollPercentage,
        readTime: data.prolific.qualityCheckData.readingTimeSeconds
    });
});
```

### Analyze Rejection Rates

```javascript
// Calculate rejection rate
const allProlific = await db.collection('users')
    .where('prolific.participantId', '!=', null)
    .get();

const rejected = allProlific.docs.filter(
    doc => doc.data().prolific.status === 'rejected'
);

const rejectionRate = (rejected.length / allProlific.size) * 100;
console.log(`Rejection rate: ${rejectionRate.toFixed(1)}%`);
```

## Troubleshooting

### High Rejection Rate (>20%)

**Possible causes:**
- Thresholds too strict
- Instructions too long/complex
- Mobile users struggling with scroll detection
- Timer starts before participants are ready

**Solutions:**
- Lower `minScrollPercentage` to 60-70%
- Reduce `minReadingTimeSeconds` to 5-8s
- Set `requireBoth: false` (pass if either met)
- Add clearer instructions about requirements

### Low Rejection Rate (0%)

**Possible causes:**
- Thresholds too lenient
- Feature disabled
- Firebase not saving data properly

**Solutions:**
- Check `enabled: true` in config
- Verify Firebase logging works (check console)
- Increase thresholds if needed

### Participants Complaining About Unfair Rejection

**Response:**
1. Check their Firebase data to verify metrics
2. If legitimate error, manually approve in Prolific
3. Consider adjusting thresholds if many complaints
4. Ensure warning messages are clear

### Want to Manually Override Rejection

**To approve a rejected participant:**

1. Find their record in Firebase
2. Update their document:
   ```javascript
   await db.collection('users').doc(participantId).update({
       'prolific.status': 'completed',
       'prolific.manuallyApproved': true,
       'prolific.manuallyApprovedAt': firebase.firestore.FieldValue.serverTimestamp()
   });
   ```
3. Send them the completion code manually via Prolific message
4. Manually approve their submission in Prolific dashboard

## Best Practices

### 1. Start Conservative

Begin with lenient settings and tighten if needed:
```javascript
minScrollPercentage: 60,
minReadingTimeSeconds: 8,
requireBoth: false
```

### 2. Pilot Test First

- Run 5-10 pilot participants
- Check rejection rate
- Review rejection reasons
- Adjust thresholds based on results

### 3. Be Transparent

In your Prolific study description, mention:
> "You will be required to read instructions carefully. Your reading behavior will be monitored, and submissions that show insufficient instruction reading may be rejected."

### 4. Monitor Early Submissions

- Check first 10-20 submissions
- Look at rejection patterns
- Adjust if needed (but be consistent)

### 5. Document Your Settings

Keep a record of your configuration:
```
Study ID: XXXXX
Date: 2026-01-19
Rejection Settings:
  - minScrollPercentage: 75%
  - minReadingTimeSeconds: 10s
  - requireBoth: true
Rejection Rate: 8.5% (17/200)
```

## FAQ

**Q: Can I change settings mid-study?**
A: Yes, but only new participants are affected. Be consistent for fairness.

**Q: Do returning participants get checked again?**
A: No, instruction quality is only checked once (first instruction read).

**Q: What if participant's browser crashes?**
A: Their instruction reading data is saved. When they return, the saved data is used.

**Q: Can participants see rejection criteria beforehand?**
A: The warning modal mentions 80% scroll requirement. You can make thresholds explicit in instructions.

**Q: Does rejection affect my Prolific reputation?**
A: Legitimate rejections with clear criteria don't harm reputation. Be fair and transparent.

**Q: Can I use different thresholds for different studies?**
A: Yes, edit the config file for each study deployment.

---

**Version:** 1.0  
**Last Updated:** January 19, 2026  
**Status:** ✅ Ready for Production
