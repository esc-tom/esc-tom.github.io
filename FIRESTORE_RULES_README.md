# Firestore Security Rules

This document explains the Firestore security rules for the annotation tool.

## File Location
The rules are in `firestore.rules` and should be deployed to your Firebase project.

## Rule Structure

### Users Collection (`users/{userId}`)

**Read Access:**
- ✅ Authenticated users can read any user profile
- This is needed for:
  - Users reading their own profile
  - Prolific participant lookups (queries by `prolific.participantId`)
  - Username availability checks (queries by `username`)
  - Getting list of all users for display

**Write Access:**
- ✅ Users can only write to their own profile (`request.auth.uid == userId`)
- Allows:
  - Registration (create own profile)
  - Profile updates (feedback, prolific data, etc.)
  - Profile recreation (if deleted)
  - `ensureUserDocumentExists()` operations

**Queries:**
- ✅ Authenticated users can query the users collection
- Needed for: `getAllUsers()`, `getProlificUserByParticipantId()`, `getUsernameStatus()`

### Annotations Subcollection (`users/{userId}/annotations/{annotationId}`)

**Read/Write Access:**
- ✅ Users can only read/write their own annotations
- Validates that `userId` in annotation data matches the document path
- Allows create, update, delete operations

**Operations Supported:**
- Saving annotations
- Loading annotations
- Deleting annotations
- Checking if annotation exists

### Legacy Annotations Collection (`annotations/{annotationId}`)

**Read Access:**
- ✅ Authenticated users can read legacy annotations

**Write/Delete Access:**
- ✅ Users can only write/delete annotations with their UID in the document ID
- Legacy format: `{userId}_{dialogueId}`
- Used for backward compatibility with old data

## Security Considerations

1. **User Profile Reading**: While any authenticated user can read user profiles, they can only modify their own. This is necessary for Prolific participant lookups and username checks.

2. **Annotations**: Strictly restricted - users can only access their own annotations.

3. **Queries**: All queries require authentication, and results are filtered by read permissions.

## Deployment

To deploy these rules to Firebase:

```bash
firebase deploy --only firestore:rules
```

Or use the Firebase Console:
1. Go to Firebase Console → Firestore Database → Rules
2. Copy the contents of `firestore.rules`
3. Paste and click "Publish"

## Testing

After deployment, test the rules using:
- Firebase Console → Firestore Database → Rules → Rules Playground
- Or test with your application code

## Compatibility

These rules are compatible with:
- ✅ User registration
- ✅ User login
- ✅ Annotation saving/loading
- ✅ Profile updates (feedback, prolific data)
- ✅ Profile recreation
- ✅ Prolific participant lookups
- ✅ Username availability checks
- ✅ Legacy annotation support
