# ESC-ToM Annotation Tool - GitHub Pages

A web-based dialogue annotation tool for ESC-ToM (Emotional Support Conversation - Theory of Mind) research. This static site uses a **revision-based workflow** where annotators review and revise pre-filled ground truth annotations for therapeutic dialogues.

## Features

- **🎲 Automatic Assignment**: Each user is automatically assigned 10 unique dialogues upon registration (no overlap between users)
- **🔄 Revision-Based Workflow**: Ground truth BDI and appraisals are pre-filled for review and revision
- **✏️ Utterance Editing**: Edit dialogue utterances to fix weird/unclear content
- **🔐 User Management**: Register and login with username/password (Firebase Authentication)
- **📝 BDI Annotations**: Review and revise pre-filled beliefs, desires, and intentions
- **🧠 Cognitive Appraisals**: Modify pre-selected appraisal dimensions
- **🎯 Context Marking**: Mark the turn that provides minimum necessary context
- **👤 Persona Profiles**: Display patient information including Big Five personality traits
- **📊 Progress Tracking**: Track annotation progress across assigned dialogues
- **☁️ Cloud Storage**: All annotations saved in Firebase Firestore (automatic backup, real-time sync)
- **🔄 Drag & Drop**: Reorder appraisals by importance
- **📱 Multi-Device**: Access your annotations from any device

## Quick Start

### For Annotators

#### First Time Users (Registration)
1. **Visit** the GitHub Pages URL
2. Click **"Register here"** on the login screen
3. **Choose** a username and password (you'll see real-time availability)
4. Click **"Register New User"** - you'll be automatically assigned 10 unique dialogues
5. Start annotating your assigned dialogues!

#### Returning Users (Login)
1. **Visit** the GitHub Pages URL
2. **Enter** your username and password
3. Click **"Login"** to continue your annotation work
4. Your assigned dialogues and progress are preserved

#### Annotation Workflow
1. **Select** a dialogue from your assigned dialogues in the dropdown
2. **Review** the dialogue - ground truth BDI and appraisals are automatically pre-filled
3. **Edit** any weird/unclear utterances by clicking the "Edit" button
4. **Mark** the turn that provided minimum necessary context (click on the turn pair)
5. **Revise** the pre-filled BDI and cognitive appraisals as needed
6. **Save** your revised annotations

**💡 Tips**: 
- You're reviewing and revising ground truth, not creating annotations from scratch!
- You'll only see your assigned 10 dialogues (no overlap with other annotators)
- Your assignments and progress are saved across sessions
- Use the links at the bottom of the login/register screen to switch between modes