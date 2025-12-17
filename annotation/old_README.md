# Dialogue Annotation Tool

A web-based interface for annotating multi-turn therapy dialogues with cognitive and emotional assessments.

## Features

- **Progressive Dialogue Display**: View dialogue turn pairs (patient + therapist) one at a time to simulate natural understanding
- **Collapsible Annotation Sections**: Click section headers to expand/collapse for better focus and screen management
- **BDI Annotation**: Capture Belief, Desire, and Intention from the dialogue
- **Cognitive Appraisals**: 
  - All 14 dimensions visible in 3-column grid (no scrolling needed)
  - Full dimension descriptions displayed for each option
  - Select up to 5 dimensions with intensity scores (1-10)
  - Drag-and-drop to reorder appraisals by importance
- **Auto-save**: Annotations are saved per dialogue and can be resumed later

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
# or if using uv:
uv pip install -r requirements.txt
```

2. Ensure input data is in the correct location:
   - Dialogues: `./input_data/dialogue_results.json`
   - Questions: `./input_data/cognitive_model_questions.yaml`

3. Run the application:
```bash
cd src
python app.py
```

4. Open your browser to: `http://localhost:5000`

## Usage

1. **Select a Dialogue**: Choose from the dropdown menu
2. **View Turns**: Click "Show Next Turn" to progressively reveal the conversation
3. **Annotate**: Fill in the annotation fields when you have enough context
4. **Save**: Click "Save Annotation" to persist your work

## Output

Annotations are saved as JSON files in the `./annotated/` directory, named by `entry_id.json`.

Each annotation includes:
- Entry ID
- Number of turns viewed vs total turns
- BDI components (Belief, Desire, Intention)
- Cognitive Appraisals (up to 5, with intensity scores)
- Timestamp

## Cognitive Appraisal Dimensions

The tool supports 14 cognitive appraisal dimensions:
- suddenness, unfamiliarity
- predictability_of_event, unpredictability_of_event
- goal_incongruence
- predictability_of_consequences, unpredictability_of_consequences
- self_cause, other_cause
- self_control, other_control
- norm_violation
- coping_demand
- unacceptable_consequences

Each can be rated on intensity from 1 (least intense) to 10 (most intense).

