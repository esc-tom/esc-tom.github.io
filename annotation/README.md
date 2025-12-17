# Quick Start Guide

## Get an Idea of the Data
A preview of the data is available at `data/esc-tom/annotation/preview.json`.
BDIs correspond to the `bdi` key in the data. The cognitive appraisals are stored in `cogapp_dims`.

## Installation & Running

### Using the startup script 
```bash
./start.sh
```

## Access the Application

Once running, open your browser and navigate to:
```
http://localhost:5000
```

## How to Use

### 1. Select a Dialogue
- Use the dropdown menu at the top to select a dialogue
- The system will show you how many turns are in each dialogue

### 2. View Dialogue Progressively
- Each turn pair is grouped together in a card
- Patient utterances have a red left border and light red background
- Therapist utterances have a green left border and light green background

### 3. Annotate When Ready
You can start annotating at any point, but only submit when you have enough context:

**Tip:** Click section headers (▼) to collapse/expand sections and focus on one task at a time!

#### BDI (Belief, Desire, Intention)
- **Belief**: What belief did the character hold before the situation?
- **Desire**: What fundamental goal were they trying to achieve?
- **Intention**: What was their specific plan?

#### Cognitive Appraisals
- All 14 dimensions are displayed in a 3-column grid - no scrolling needed!
- Each dimension shows its full description
- Click on a dimension to add it (max 5)
- Each selected dimension appears below with:
  - The dimension name and full description
  - An intensity input (1-10)
  - A remove button (✕)
- **Drag and drop** to reorder appraisals by importance (most important first)
- The ranking number updates automatically

### 4. Save Your Work
- Click **"Save Annotation"** to save your work
- Annotations are saved to `./annotated/[entry_id].json`
- You can return to a dialogue later - your annotations will be loaded automatically

### 5. Navigate Between Dialogues
- Select a different dialogue from the dropdown
- Your previous annotations are preserved
- Each dialogue is saved independently

## Tips

- **Progressive Context**: Don't feel pressured to view all turns - annotate when you have sufficient understanding
- **Intensity Scores**: 1 = minimal intensity, 10 = maximum intensity
- **Auto-load**: If you've annotated a dialogue before, your work will load automatically when you select it
- **Reset**: Use "Reset Dialogue" to hide all turns and start over with the same dialogue
- **Clear**: Use "Clear Annotations" to erase all annotation fields (doesn't affect saved data)

## Keyboard Shortcuts

- **Tab**: Navigate between form fields
- **Ctrl+S**: Save annotation (when focused on the page)