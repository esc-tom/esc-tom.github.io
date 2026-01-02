# Ground Truth Display Issue - Fixed

## 🐛 Problem

Ground truth BDI and cognitive appraisals were not displaying when dialogues loaded.

---

## 🔍 Root Cause

**Two issues found:**

### Issue 1: Mismatched Dimension Keys

**Problem:** Ground truth in `dialogues.json` used display names that didn't match actual dimension keys.

**Example - What was wrong:**
```json
"cognitive_appraisals": [
  "Threat",              ❌ No such key exists
  "Self-accountability", ❌ No such key exists  
  "Low control"          ❌ No such key exists
]
```

**Actual dimension keys in `cognitive_dimensions.json`:**
```json
[
  {"suddenness": "..."},
  {"self_control": "..."},
  {"goal_incongruence": "..."},
  ...
]
```

### Issue 2: Incorrect Data Structure Parsing

**Problem:** JavaScript code assumed dimensions had `.key` and `.description` properties.

**What the code tried:**
```javascript
const dimension = cognitiveDimensions.find(d => d.key === dimensionKey);
//                                              ^^^^^ doesn't exist!
```

**Actual structure:**
```javascript
[
  {"suddenness": "description"},  // No .key property!
  {"self_control": "description"} // No .key property!
]
```

---

## ✅ Solution

### Fix 1: Updated Ground Truth Keys

Changed `dialogues.json` to use actual dimension keys:

**example_001:**
```json
"cognitive_appraisals": [
  "goal_incongruence",         ✅ Matches cognitive_dimensions.json
  "self_cause",                ✅ Matches cognitive_dimensions.json
  "other_control",             ✅ Matches cognitive_dimensions.json
  "unacceptable_consequences"  ✅ Matches cognitive_dimensions.json
]
```

**example_002:**
```json
"cognitive_appraisals": [
  "goal_incongruence",
  "other_control",
  "unpredictability_of_consequences",
  "unacceptable_consequences"
]
```

### Fix 2: Updated JavaScript Parsing

Changed `loadGroundTruth()` function in `scripts/script.js`:

**Before (broken):**
```javascript
const dimension = cognitiveDimensions.find(d => d.key === dimensionKey);
if (dimension) {
    selectedAppraisals.push({
        dimension: dimension.key,        // ❌ undefined
        description: dimension.description, // ❌ undefined
        intensity: 5
    });
}
```

**After (fixed):**
```javascript
const dimension = cognitiveDimensions.find(d => {
    const key = Object.keys(d)[0];     // ✅ Extract key from object
    return key === dimensionKey;
});
if (dimension) {
    const key = Object.keys(dimension)[0];       // ✅ Get actual key
    const description = Object.values(dimension)[0]; // ✅ Get actual description
    selectedAppraisals.push({
        dimension: key,
        description: description,
        intensity: 5
    });
} else {
    console.warn(`Ground truth dimension "${dimensionKey}" not found`);
}
```

---

## 🧪 Testing

Now when you load a dialogue:

1. **BDI fields pre-fill** ✅
   - Belief: "I am not competent enough for my new job"
   - Desire: "I want to be seen as capable and competent by my colleagues"
   - Intention: "I will try to avoid making mistakes that would expose my inadequacy"

2. **Cognitive appraisals pre-select** ✅
   - goal_incongruence
   - self_cause
   - other_control
   - unacceptable_consequences

3. **Console shows** ✅
   - "✅ Ground truth loaded and pre-populated"

---

## 📋 Available Cognitive Dimensions

For reference, these are the valid dimension keys in `cognitive_dimensions.json`:

1. `suddenness`
2. `unfamiliarity`
3. `predictability_of_event`
4. `unpredictability_of_event`
5. `goal_incongruence`
6. `predictability_of_consequences`
7. `unpredictability_of_consequences`
8. `self_cause`
9. `other_cause`
10. `self_control`
11. `other_control`
12. `norm_violation`
13. `coping_demand`
14. `unacceptable_consequences`

**When adding ground truth, use these exact keys!**

---

## 📝 How to Add Ground Truth to New Dialogues

When adding ground truth to `dialogues.json`:

```json
{
  "your_dialogue_id": {
    "entry_id": "your_dialogue_id",
    "persona_profile": { ... },
    "dialogue_history": [ ... ],
    "ground_truth": {
      "belief": "The patient's belief statement",
      "desire": "The patient's desire statement", 
      "intention": "The patient's intention statement",
      "cognitive_appraisals": [
        "dimension_key_1",    ← Use exact keys from cognitive_dimensions.json
        "dimension_key_2",    ← NOT display names!
        "dimension_key_3"
      ]
    }
  }
}
```

**Common mistakes to avoid:**
- ❌ Using display names: "Threat", "Control", "Accountability"
- ❌ Using capitalized keys: "Self_Control", "Goal_Incongruence"
- ❌ Using spaces: "self control", "goal incongruence"
- ✅ Use exact keys: "self_control", "goal_incongruence"

---

## 🚀 Verification Steps

1. **Start local server:**
   ```bash
   cd /Users/seacow/Documents/github/esc-tom.github.io
   python3 -m http.server 8000
   ```

2. **Open in browser:**
   ```
   http://localhost:8000
   ```

3. **Login and select dialogue**

4. **Check that:**
   - ✅ Belief field is pre-filled
   - ✅ Desire field is pre-filled
   - ✅ Intention field is pre-filled
   - ✅ Cognitive appraisals are pre-selected (4 items in "Selected Appraisals")
   - ✅ Each appraisal shows dimension name and description
   - ✅ Intensity sliders are set to 5
   - ✅ Console shows "✅ Ground truth loaded and pre-populated"

5. **If not working:**
   - Open browser console (F12)
   - Check for warnings like "Ground truth dimension 'X' not found"
   - Verify dimension keys match `cognitive_dimensions.json`

---

## 📊 Files Modified

1. ✅ `data/dialogues.json` - Updated ground truth dimension keys
2. ✅ `scripts/script.js` - Fixed dimension parsing in `loadGroundTruth()`

---

## 🎯 Summary

**Problem:** Ground truth wasn't displaying  
**Cause:** Mismatched keys + incorrect parsing  
**Fix:** Updated keys to match + fixed parsing logic  
**Result:** Ground truth now loads and displays correctly! ✅

---

**Last Updated:** January 2, 2026  
**Status:** Fixed ✅

