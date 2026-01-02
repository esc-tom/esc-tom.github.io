# Revision-Based Annotation Workflow

## 🔄 Overview

The annotation tool has been transformed from a **creation-based** workflow to a **revision-based** workflow. Instead of writing annotations from scratch, annotators now **review and revise pre-filled ground truth annotations**.

---

## 📊 What Changed

### Before (Creation-Based)
- Annotators write belief, desire, intention from scratch
- Empty fields to fill in
- Select cognitive appraisals from list
- Mark minimum context turn
- Save annotation

### After (Revision-Based)
- **Ground truth BDI and appraisals are pre-filled**
- Annotators review and modify as needed
- **Can edit dialogue utterances** if content is weird/unclear
- Mark minimum context turn
- Save revised annotation

---

## 🎯 New Workflow Steps

### Step 1: Load Dialogue
When a dialogue is selected:
- Ground truth belief, desire, intention are **automatically pre-filled**
- Ground truth cognitive appraisals are **pre-selected**
- All fields are editable and ready for revision

### Step 2: Review Dialogue
- Read through the dialogue turns
- If any utterance contains weird or unclear content:
  - **Hover over the utterance** to see "Edit" button
  - **Click "Edit"** to modify the utterance
  - **Save** your changes or **Cancel** to revert

### Step 3: Mark Minimum Context Turn
- **Click on the turn pair** that provides minimum necessary context
- Turn will be highlighted with a green checkmark
- This indicates: "I could derive the BDI/appraisals starting from this turn"

### Step 4: Revise Ground Truth Annotations
- **Review pre-filled belief, desire, intention**
- Modify any text that needs improvement
- **Review pre-selected cognitive appraisals**
- Add/remove appraisals as needed
- Adjust intensity scores (1-5)
- Drag to reorder by importance

### Step 5: Save
- Click **"Save Annotation"**
- Review confirmation modal
- Click **"Confirm and Save"**
- Your revisions are saved to Firebase

---

## 🆕 Key New Features

### 1. **Ground Truth Pre-Population**

**Belief, Desire, Intention:**
- Automatically filled from `ground_truth.belief`, `ground_truth.desire`, `ground_truth.intention`
- Appear in the input fields when dialogue loads
- Ready for you to review and revise

**Cognitive Appraisals:**
- Automatically selected from `ground_truth.cognitive_appraisals`
- Appear in the "Selected Appraisals" section
- Default intensity: 5 (you can adjust)

### 2. **Utterance Editing**

**Why:**
- Sometimes dialogue utterances contain weird content, typos, or unclear phrasing
- Instead of working with flawed data, you can fix it

**How:**
- Hover over any utterance → "Edit" button appears
- Click "Edit" → Text area opens
- Modify the text
- Click "Save" to keep changes, "Cancel" to discard
- Edited utterances show **(edited)** indicator
- Highlighted in yellow for visibility

**Storage:**
- Modified utterances are saved with your annotation
- Original dialogue data remains unchanged
- Only your personal annotation includes the modifications

### 3. **Turn Context Marking** (Unchanged)

- Click on turn pairs to mark minimum necessary context
- Green checkmark indicates selected turn
- Click again to deselect
- This helps identify "when" you could derive the annotations

---

## 📁 Data Structure Changes

### Dialogue Data (`data/dialogues.json`)

**New field added:**
```json
{
  "example_001": {
    "entry_id": "example_001",
    "persona_profile": { ... },
    "dialogue_history": [ ... ],
    "ground_truth": {
      "belief": "I am not competent enough for my new job",
      "desire": "I want to be seen as capable by my colleagues",
      "intention": "I will avoid making mistakes that expose inadequacy",
      "cognitive_appraisals": [
        "Threat",
        "Self-accountability",
        "Low control"
      ]
    }
  }
}
```

### Annotation Data (Saved to Firebase)

**New field added:**
```json
{
  "entry_id": "example_001",
  "username": "annotator1",
  "belief": "I believe that I am not competent enough...",
  "desire": "I wish to be seen as capable...",
  "intention": "I intend to avoid making mistakes...",
  "cognitive_appraisals": [ ... ],
  "min_context_turn": 4,
  "modified_utterances": {
    "2": "Revised utterance text for turn 2",
    "5": "Revised utterance text for turn 5"
  },
  "timestamp": "2026-01-02T10:30:00.000Z"
}
```

**`modified_utterances` object:**
- Keys: Turn indices (numbers)
- Values: Revised utterance text
- Only modified utterances are stored

---

## 🎨 UI Changes

### 1. **Instructions Panel**

**Old:**
```
1. Review the exploration phase dialogue
2. Click on the turn that provided minimum context
3. Complete the annotation forms on the right
```

**New:**
```
1. Review the dialogue. Click "Edit" on any utterance to modify weird/unclear content
2. Click on the turn that provided minimum necessary context
3. Revise the ground truth BDI and cognitive appraisals (pre-filled for you)
4. Save when done
```

### 2. **Annotation Panel Header**

**Old:**
```
Annotations
```

**New:**
```
Revise Ground Truth Annotations
Review and modify the pre-filled annotations below
```

### 3. **Input Placeholders**

**Old:**
```
Belief: complete the sentence...
Desire: complete the sentence...
Intention: complete the sentence...
```

**New:**
```
Belief: ground truth will load here...
Desire: ground truth will load here...
Intention: ground truth will load here...
```

### 4. **Appraisal Help Text**

**Old:**
```
Select up to 5 cognitive appraisals and assign intensity scores (1-5)
```

**New:**
```
Ground truth appraisals are pre-selected. Modify selections and intensity scores as needed
```

### 5. **Utterance Edit Buttons**

- Appear on hover over any utterance
- Blue "Edit" button in top-right of utterance
- Clicking opens edit mode:
  - Text area with current text
  - "Save" button (green)
  - "Cancel" button (gray)
- Edited utterances show **(edited)** label
- Highlighted in yellow background

---

## 🔧 Technical Implementation

### JavaScript Changes

**Global State:**
```javascript
let modifiedUtterances = {}; // Track edited utterances
```

**New Functions:**
1. `loadGroundTruth()` - Pre-populate BDI and appraisals from dialogue data
2. `enterUtteranceEditMode()` - Switch utterance to edit mode
3. `saveUtteranceEdit()` - Save modified utterance
4. `cancelUtteranceEdit()` - Cancel editing
5. `createUtteranceDiv()` - Helper to render utterance with edit button

**Modified Functions:**
1. `handleDialogueChange()` - Calls `loadGroundTruth()` before loading existing annotation
2. `createSingleTurnElement()` - Adds edit button and modified indicator
3. `loadExistingAnnotation()` - Loads `modified_utterances` from saved annotation
4. `performSave()` - Saves `modified_utterances` with annotation

### CSS Additions

**New Classes:**
- `.annotation-subtitle` - Subtitle text under panel header
- `.edit-utterance-btn` - Edit button (appears on hover)
- `.utterance-edit-mode` - Container for edit UI
- `.utterance-edit-input` - Textarea for editing
- `.utterance-edit-actions` - Save/Cancel button container
- `.utterance-save-btn` - Save button
- `.utterance-cancel-btn` - Cancel button
- `.utterance-modified` - Yellow highlight for edited utterances
- `.utterance-modified-indicator` - "(edited)" label

**Styling Features:**
- Edit button fades in on hover (opacity 0 → 1)
- Edit mode has blue border to indicate active editing
- Modified utterances have yellow background highlight
- Responsive textarea that grows with content

---

## 📝 Annotation Best Practices

### Reviewing Ground Truth

1. **Read carefully** - Ground truth may not be perfect
2. **Consider context** - Does the BDI make sense given the full dialogue?
3. **Check alignment** - Do belief, desire, and intention align logically?
4. **Verify appraisals** - Are the right cognitive dimensions selected?
5. **Adjust intensity** - Do the scores (1-5) match the severity?

### Editing Utterances

**When to edit:**
- ✅ Typos or grammatical errors
- ✅ Unclear or ambiguous phrasing
- ✅ Weird AI-generated content
- ✅ Missing or extra words

**When NOT to edit:**
- ❌ Don't change meaning significantly
- ❌ Don't rewrite entire utterances
- ❌ Don't "improve" natural human speech patterns
- ❌ Don't translate or change language

**Guidelines:**
- Make minimal edits to clarify meaning
- Preserve the speaker's intent
- Keep natural conversational flow
- Note: Edits are saved with YOUR annotation only

### Marking Minimum Context

**Definition:**
- The earliest turn where you have enough information to derive the BDI and appraisals

**Tips:**
- Think: "Could I make this annotation if I only read up to this turn?"
- Consider: What information is essential vs. nice-to-have?
- Mark the turn where minimum necessary context is first available
- Not the turn where maximum context is available

---

## 🎯 Quality Checks

Before saving, verify:

- [ ] Ground truth BDI has been reviewed
- [ ] Any necessary revisions to BDI have been made
- [ ] Ground truth appraisals have been reviewed
- [ ] Appraisal intensities are appropriate (1-5)
- [ ] Appraisals are ordered by importance (drag to reorder)
- [ ] Minimum context turn is marked
- [ ] Any weird utterances have been edited
- [ ] All edits preserve original meaning and intent

---

## 🔍 Comparison: Old vs. New

| Aspect | Old (Creation) | New (Revision) |
|--------|---------------|----------------|
| **BDI Fields** | Empty | Pre-filled with ground truth |
| **Appraisals** | None selected | Ground truth pre-selected |
| **Utterances** | Read-only | Editable with "Edit" button |
| **Task** | Write from scratch | Review and revise |
| **Effort** | High cognitive load | Lower, focused on quality |
| **Speed** | Slower (creation) | Faster (revision) |
| **Consistency** | Varies widely | More consistent baseline |

---

## 🚀 Getting Started

### For Annotators

1. **Login** with your username and password
2. **Select a dialogue** from the dropdown
3. **Review ground truth** - BDI and appraisals are pre-filled
4. **Edit any weird utterances** - Click "Edit" button
5. **Mark minimum context turn** - Click on the relevant turn pair
6. **Revise as needed** - Modify BDI, appraisals, intensities
7. **Save** - Click "Save Annotation" and confirm

### For Developers

1. **Add ground truth** to `data/dialogues.json`:
   ```json
   "ground_truth": {
     "belief": "...",
     "desire": "...",
     "intention": "...",
     "cognitive_appraisals": ["Dimension1", "Dimension2", ...]
   }
   ```

2. **Deploy** to GitHub Pages:
   ```bash
   git add data/dialogues.json scripts/script.js index.html styles/style.css
   git commit -m "Add revision-based annotation workflow"
   git push origin main
   ```

3. **Verify** - Check that ground truth loads correctly

---

## 📊 Benefits of Revision-Based Workflow

### 1. **Faster Annotation**
- Pre-filled fields reduce typing
- Focus on quality control rather than creation
- Quicker to review than to write from scratch

### 2. **Better Consistency**
- All annotators start from same baseline
- Reduces interpretation variance
- More standardized annotations

### 3. **Lower Cognitive Load**
- Less mental effort to revise than create
- Clear starting point reduces decision paralysis
- More efficient annotation process

### 4. **Higher Quality Data**
- Utterance editing fixes data quality issues at source
- Ground truth provides educated starting point
- Annotators can focus on nuanced improvements

### 5. **Flexibility**
- Can accept ground truth as-is if perfect
- Can make minor tweaks if mostly correct
- Can completely rewrite if significantly wrong

---

## 🐛 Troubleshooting

### Ground truth not loading
- Check `data/dialogues.json` has `ground_truth` field
- Check browser console for errors
- Verify field names match exactly: `belief`, `desire`, `intention`, `cognitive_appraisals`

### Edit button not appearing
- Hover over the utterance text (not speaker label)
- Check that CSS is loaded correctly
- Try refreshing the page

### Modified utterances not saving
- Check browser console for errors
- Verify you're logged in
- Check Firebase connection

### Ground truth appraisals not pre-selecting
- Verify appraisal names in `ground_truth.cognitive_appraisals` match dimension keys in `cognitive_dimensions.json`
- Check case sensitivity (e.g., "Threat" vs. "threat")

---

## 📦 Files Modified

### Core Changes
- ✅ `data/dialogues.json` - Added `ground_truth` to each dialogue
- ✅ `scripts/script.js` - Added ground truth loading and utterance editing
- ✅ `index.html` - Updated instructions and labels
- ✅ `styles/style.css` - Added utterance editing styles

### Documentation
- ✅ `REVISION_WORKFLOW_GUIDE.md` - This file
- 📝 `README.md` - Should be updated to reflect new workflow

---

## 🎓 Training Annotators

### Key Points to Emphasize

1. **You're reviewing, not creating** - Ground truth is pre-filled
2. **Edit weird utterances** - Don't struggle with bad data
3. **Mark the turn** - Where you first had enough context
4. **Revise as needed** - Ground truth isn't perfect
5. **Save your work** - Don't forget to save!

### Common Questions

**Q: Should I just accept the ground truth?**
A: No, always review carefully. Ground truth may contain errors or be suboptimal.

**Q: How much can I change?**
A: As much as needed to make it accurate. You can completely rewrite if necessary.

**Q: What if I think ground truth is completely wrong?**
A: Revise it to what you think is correct. That's the point of human annotation.

**Q: Should I edit utterances often?**
A: Only when necessary to clarify meaning. Don't over-edit.

---

## ✅ Summary

The revision-based workflow:
- ✅ Pre-fills ground truth BDI and appraisals
- ✅ Allows editing of dialogue utterances
- ✅ Maintains turn context marking
- ✅ Saves all revisions to Firebase
- ✅ Faster and more consistent than creation-based approach
- ✅ Better data quality through utterance editing

**Result:** More efficient annotation with higher quality output!

---

**Questions?** Check the browser console for errors or contact the developer.

**Ready to annotate?** Load a dialogue and start revising! 🚀

