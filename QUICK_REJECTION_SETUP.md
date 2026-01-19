# Quick Setup: Automatic Rejection for Poor Instruction Reading

## ✅ Already Implemented

Your system now automatically rejects Prolific participants who don't properly read instructions!

## 🎯 Quick Setup (2 Minutes)

### Step 1: Configure Settings

Edit `scripts/prolific-config.js` (around line 39):

```javascript
// Instruction reading quality checks
instructionChecks: {
    enabled: true,              // ← Change to false to disable
    minScrollPercentage: 75,    // ← Adjust scroll requirement (0-100)
    minReadingTimeSeconds: 10,  // ← Adjust time requirement (seconds)
    requireBoth: true,          // ← true = both required, false = either one
    showWarning: true
}
```

### Step 2: Test It

**Test Rejection:**
1. Visit: `your-site.com/?PROLIFIC_PID=test_reject&STUDY_ID=test&SESSION_ID=test`
2. Open instructions, scroll 50%, close after 3 seconds
3. Complete all annotations
4. Should see rejection screen → redirect to NOCODE

**Test Acceptance:**
1. Visit: `your-site.com/?PROLIFIC_PID=test_accept&STUDY_ID=test&SESSION_ID=test`
2. Open instructions, scroll to bottom, wait 15+ seconds
3. Complete all annotations
4. Should see completion screen → redirect to completion code

### Step 3: Launch

Deploy to GitHub Pages and start your Prolific study!

## 📊 Recommended Settings

**Standard (Recommended):**
```javascript
minScrollPercentage: 75,
minReadingTimeSeconds: 10,
requireBoth: true
```
→ Catches rushed participants, fair to careful readers

**Conservative:**
```javascript
minScrollPercentage: 50,
minReadingTimeSeconds: 5,
requireBoth: false
```
→ Only catches obvious instruction-skippers

**Strict:**
```javascript
minScrollPercentage: 95,
minReadingTimeSeconds: 30,
requireBoth: true
```
→ Maximum quality, higher rejection rate

## 🔍 How It Works

1. **Tracking:** System automatically tracks scroll % and reading time
2. **Storage:** Data saved to Firebase when they first view instructions
3. **Check:** On completion, validates against your thresholds
4. **Reject:** If failed, redirects to Prolific NOCODE (no payment)
5. **Accept:** If passed, redirects to completion code (payment)

## 📋 What's Logged in Firebase

```javascript
// If rejected
{
  prolific: {
    status: "rejected",
    rejectionReason: "insufficient scroll (60% < 75%)",
    qualityCheckData: {
      scrollPercentage: 60,
      readingTimeSeconds: 5
    }
  }
}

// If accepted
{
  prolific: {
    status: "completed"
  },
  first_instruction_read: {
    scrollPercentage: 85,
    readingTimeSeconds: 25
  }
}
```

## 🚨 Important Notes

- ✅ Works only for Prolific participants (regular users unaffected)
- ✅ Quality check happens AFTER completing all annotations
- ✅ Participants see warnings during instruction reading
- ✅ Clear rejection message shows why they failed
- ✅ All rejections logged in Firebase for analysis
- ⚠️ Disabled by default - set `enabled: true` to activate
- ⚠️ Test before launching your study!

## 📖 Full Documentation

- **Detailed Guide:** See `AUTOMATIC_REJECTION_GUIDE.md`
- **Prolific Integration:** See `PROLIFIC_INTEGRATION_GUIDE.md`
- **Configuration:** See `scripts/prolific-config.js`

## 💡 Quick Tips

1. **Start conservative** and tighten if needed
2. **Pilot test** with 5-10 participants first
3. **Monitor early submissions** to check rejection rate
4. **Aim for <15% rejection rate** (10-20% is acceptable)
5. **Be transparent** in Prolific study description

## 🎚️ Adjusting Settings

| If... | Try... |
|-------|--------|
| Too many rejections (>25%) | Lower thresholds or set `requireBoth: false` |
| No rejections at all | Increase thresholds or verify `enabled: true` |
| Complaints about unfairness | Check Firebase data, adjust if needed |
| Want stricter quality | Increase both thresholds, keep `requireBoth: true` |

---

**Need help?** See full documentation in `AUTOMATIC_REJECTION_GUIDE.md`
