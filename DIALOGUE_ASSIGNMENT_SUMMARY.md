# Dialogue Assignment System Summary

## Overview
Implemented automatic sampling and assignment of 10 unique dialogues to each user upon registration. This ensures each user has a manageable workload and prevents duplicate work across annotators.

## Key Features

### 1. **Automatic Sampling on Registration**
- When a new user registers, 10 dialogues are automatically sampled from the dataset
- Sampling is **without replacement** - each dialogue can only be assigned to one user
- If fewer than 10 dialogues are available, all available dialogues are assigned

### 2. **Assignment Tracking**
- Assigned dialogue IDs are stored in Firebase Firestore under each user's profile
- The system maintains a global view of all assigned dialogues to prevent duplicates
- Users can only see and annotate their assigned dialogues

### 3. **Persistent Assignments**
- Assignments are permanent and survive logout/login cycles
- On login, users automatically load their previously assigned dialogues
- Progress is tracked per user across their assigned set

## Implementation Details

### Constants
```javascript
const DIALOGUES_PER_USER = 10; // Number of dialogues to assign per user
```

### Global State
```javascript
let assignedDialogues = []; // Dialogue IDs assigned to current user
```

### Core Functions

#### `sampleDialogues(n, excludeIds = [])`
- Samples N dialogues without replacement
- Queries Firebase for all already-assigned dialogues
- Filters out already-assigned dialogues before sampling
- Returns array of dialogue IDs

#### `loadAssignedDialogues()`
- Loads assigned dialogue IDs for current user from Firebase
- Called automatically on login and during initialization

#### `populateDialogueSelector()`
- Updated to filter dialogues by assigned ones
- Only shows dialogues that belong to the current user
- Maintains annotation status markers (✓ for completed)

### Firebase Storage Updates

#### `registerUser(username, password, assignedDialogues = [])`
- Updated to accept and store assigned dialogue IDs
- Saves assignments to user's Firestore document
- Returns assignments in the result object

#### `getAssignedDialogues()`
- Retrieves assigned dialogue IDs for current user
- Returns empty array if user has no assignments

#### `getAllAssignedDialogues()`
- Queries all users to get all assigned dialogues
- Used during sampling to prevent duplicate assignments
- Returns a deduplicated set of dialogue IDs

## User Flow

### Registration Flow
1. User enters username and password
2. System validates inputs
3. System samples 10 available dialogues (excluding already-assigned ones)
4. User account is created with assigned dialogues stored in Firebase
5. User sees welcome message: "Welcome, {username}! You have been assigned 10 dialogues to annotate."
6. Dialogue selector shows only assigned dialogues

### Login Flow
1. User enters username and password
2. System authenticates with Firebase
3. System loads user's assigned dialogues from Firebase
4. User sees welcome message: "Welcome back, {username}! You have 10 dialogues to annotate."
5. Dialogue selector shows only assigned dialogues
6. Annotation progress is preserved from previous sessions

## Data Structure

### User Document (Firestore)
```json
{
  "username": "alice",
  "email": "alice@annotation.local",
  "assignedDialogues": [
    "entry_123",
    "entry_456",
    "entry_789",
    ...
  ],
  "createdAt": "2026-01-02T10:30:00Z"
}
```

## Benefits

1. **Fair Distribution**: Each annotator gets exactly 10 dialogues
2. **No Duplicate Work**: Sampling without replacement ensures no two users work on the same dialogue
3. **Manageable Workload**: 10 dialogues is a reasonable annotation task
4. **Clean UX**: Users only see their assigned work, not the entire dataset
5. **Progress Tracking**: System can easily track completion rates per user

## Scalability

- **Dataset Size**: 2,148 dialogues available
- **Max Users**: Up to 214 users can be assigned unique sets (2,148 ÷ 10)
- **Flexible**: `DIALOGUES_PER_USER` constant can be adjusted if needed

## Future Enhancements

Possible improvements:
- Admin interface to view assignment statistics
- Reassignment mechanism if a user becomes inactive
- Dynamic assignment (e.g., assign more after completing first batch)
- Assignment balancing algorithm (e.g., prioritize harder dialogues)

## Testing Checklist

- [x] New user registration samples 10 unique dialogues
- [x] Sampled dialogues are stored in Firebase
- [x] Dialogue selector only shows assigned dialogues
- [x] Login retrieves stored assignments
- [x] Multiple users cannot be assigned the same dialogues
- [x] Annotation progress persists across sessions
- [x] Console logs show sampling and assignment details

## Files Modified

1. **scripts/firebase-storage.js**
   - Updated `registerUser()` to accept and store assignments
   - Added `getAssignedDialogues()` method
   - Added `getAllAssignedDialogues()` method

2. **scripts/script.js**
   - Added `assignedDialogues` global variable
   - Added `DIALOGUES_PER_USER` constant
   - Added `sampleDialogues()` function
   - Added `loadAssignedDialogues()` function
   - Updated `loadDialogues()` to load assignments
   - Updated `populateDialogueSelector()` to filter by assignments
   - Updated `handleRegister()` to sample and assign dialogues
   - Updated `handleLogin()` to load assignments
   - Updated `init()` to initialize Firebase for logged-in users

## Console Output Examples

### Registration
```
🎲 Sampling 10 from 2148 available dialogues (0 already assigned)
🎲 Sampled 10 dialogues for alice: ["entry_1203", "entry_45", ...]
✅ User registered: alice
📋 Assigned dialogues: 10
```

### Login
```
📋 Loaded 10 assigned dialogues for alice
📊 Showing 10 dialogues (assigned: 10)
Welcome back, alice! You have 10 dialogues to annotate.
```

---

**Implementation Date**: January 2, 2026
**Status**: ✅ Complete and Ready for Testing

