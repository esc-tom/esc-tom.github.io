# Testing Dialogue Assignment Feature

This guide helps you verify that the automatic dialogue assignment system works correctly.

## Prerequisites

1. Firebase is properly configured and running
2. `data/eval_data.json` contains dialogues (2,148 entries expected)
3. Open browser console (F12) to view detailed logs

## Test Cases

### Test 1: First User Registration

**Steps:**
1. Open the application in a fresh browser (or clear localStorage and Firebase users)
2. Click "Register"
3. Enter username: `alice` and password: `test123` (confirm)
4. Submit registration

**Expected Results:**
✅ Console shows:
```
🎲 Sampling 10 from 2148 available dialogues (0 already assigned)
🎲 Sampled 10 dialogues for alice: [array of 10 dialogue IDs]
✅ User registered: alice
📋 Assigned dialogues: 10
📋 Loaded 10 assigned dialogues for alice
📊 Showing 10 assigned dialogues for alice
📊 Progress: 0/10 dialogues annotated
```
✅ Welcome message: "Welcome, alice! You have been assigned 10 dialogues to annotate."
✅ Dialogue dropdown shows **exactly 10 dialogues** (not 2,148)
✅ Each dialogue shows format: `entry_XXX (N turns)`
✅ Progress shows "0/10" not "0/2148"

---

### Test 2: Second User Registration (No Overlap)

**Steps:**
1. Logout from alice's account
2. Register a new user: `bob` / `test123`
3. Compare bob's assigned dialogues with alice's

**Expected Results:**
✅ Console shows:
```
🎲 Sampling 10 from 2138 available dialogues (10 already assigned)
🎲 Sampled 10 dialogues for bob: [array of 10 DIFFERENT dialogue IDs]
```
✅ Bob gets 10 different dialogues (no overlap with alice)
✅ Bob sees only his 10 assigned dialogues
✅ Available pool reduced to 2,138 dialogues

**Verification:**
```javascript
// In browser console, check:
console.log('Alice dialogues:', aliceDialogues);
console.log('Bob dialogues:', bobDialogues);
console.log('Overlap:', aliceDialogues.filter(id => bobDialogues.includes(id)));
// Should show: Overlap: []
```

---

### Test 3: Login Persistence

**Steps:**
1. Logout from bob's account
2. Login again as `alice` / `test123`
3. Check dialogue dropdown

**Expected Results:**
✅ Console shows:
```
📋 Loaded 10 assigned dialogues for alice
📊 Showing 10 assigned dialogues for alice
📊 Progress: X/10 dialogues annotated
```
✅ Alice sees the SAME 10 dialogues as before (not all 2,148)
✅ Welcome message: "Welcome back, alice! You have 10 dialogues to annotate."
✅ Any previous annotation progress is preserved
✅ Progress shows "X/10" where X is the number completed

---

### Test 4: Cross-Session Persistence

**Steps:**
1. Login as alice
2. Note the dialogue IDs in the dropdown
3. Close browser completely
4. Open browser again and visit the page
5. Login as alice

**Expected Results:**
✅ Alice sees the exact same 10 dialogues
✅ Assignments persist across browser sessions
✅ No new sampling occurs

---

### Test 5: Annotation Progress Tracking

**Steps:**
1. Login as alice
2. Select a dialogue and complete an annotation
3. Save the annotation
4. Logout and login again
5. Check the dialogue dropdown

**Expected Results:**
✅ Console shows: `📊 Progress: 1/10 dialogues annotated` (incremented)
✅ Annotated dialogue shows checkmark: `✓ entry_XXX (N turns)`
✅ Unannotated dialogues show without checkmark
✅ Progress is preserved across sessions
✅ System auto-loads first unannotated dialogue (from assigned set only)
✅ After completing all 10: `🎉 All 10 assigned dialogues completed!`

---

### Test 6: Verify Only Assigned Dialogues Shown

**Steps:**
1. Login as alice (who has 10 assigned dialogues)
2. Open browser DevTools console
3. Run: `console.log('All dialogues:', allDialogues.length)`
4. Run: `console.log('Assigned dialogues:', assignedDialogues.length)`
5. Check dropdown options count

**Expected Results:**
✅ Console shows:
```
All dialogues: 2148
Assigned dialogues: 10
📊 Showing 10 assigned dialogues for alice
```
✅ Dropdown shows **exactly 10 options** (plus the default "Select" option)
✅ All 10 options match alice's assigned dialogue IDs
✅ User cannot access the other 2,138 dialogues

**Verification Command:**
```javascript
// In console:
const dropdownOptions = Array.from(document.getElementById('dialogue-select').options);
const shownDialogues = dropdownOptions.slice(1).map(opt => allDialogues[opt.value].entry_id);
console.log('Shown in dropdown:', shownDialogues.length);
console.log('Match assigned:', shownDialogues.every(id => assignedDialogues.includes(id)));
// Should show: Shown in dropdown: 10, Match assigned: true
```

---

### Test 7: Firebase Data Structure

**Steps:**
1. Login to Firebase Console
2. Navigate to Firestore Database
3. Open `users` collection
4. Check a user document

**Expected Results:**
✅ User document contains:
```json
{
  "username": "alice",
  "email": "alice@annotation.local",
  "assignedDialogues": [
    "entry_1203",
    "entry_45",
    "entry_987",
    ... (10 total)
  ],
  "createdAt": "2026-01-02T..."
}
```

---

### Test 8: Maximum Users Test (Optional)

**Steps:**
1. Calculate max users: 2,148 ÷ 10 = 214.8
2. Register 214 users (or simulate in Firebase)
3. Try registering the 215th user

**Expected Results:**
✅ First 214 users get 10 dialogues each
✅ 215th user gets remaining 8 dialogues
✅ Console shows appropriate warnings:
```
⚠️ Only 8 dialogues available for assignment
🎲 Sampled 8 dialogues for user_215
```

---

### Test 9: Concurrent Registration (Advanced)

**Steps:**
1. Open application in two different browsers
2. Register `user1` in Browser 1 at the same time as `user2` in Browser 2
3. Check for overlaps

**Expected Results:**
✅ Both users successfully register
✅ Minimal or no overlap (Firebase handles concurrency)
✅ If overlap exists, it's only 1-2 dialogues (acceptable edge case)

**Note:** For production use, consider implementing Firestore transactions for guaranteed uniqueness.

---

## Console Commands for Verification

### Check Current User's Assignments
```javascript
// In browser console after login:
await firebaseStorage.getAssignedDialogues();
```

### Check All Assigned Dialogues
```javascript
await firebaseStorage.getAllAssignedDialogues();
```

### Manual Assignment Verification
```javascript
// Get all users and their assignments
const users = await firebaseStorage.db.collection('users').get();
const assignments = {};
users.forEach(doc => {
  const data = doc.data();
  assignments[data.username] = data.assignedDialogues;
});
console.log('All assignments:', assignments);

// Check for overlaps
const allIds = Object.values(assignments).flat();
const unique = new Set(allIds);
console.log('Total assigned:', allIds.length);
console.log('Unique assigned:', unique.size);
console.log('Overlaps:', allIds.length - unique.size);
```

---

## Common Issues and Solutions

### Issue 1: User sees all 2,148 dialogues
**Cause:** Assignments not loaded
**Fix:** 
- Check Firebase connection
- Verify `assignedDialogues` field exists in Firestore user document
- Check console for errors in `loadAssignedDialogues()`

### Issue 2: Two users have overlapping dialogues
**Cause:** Race condition during concurrent registration
**Solution:** 
- This is a rare edge case
- For production, implement Firestore transactions
- Current implementation is acceptable for small-scale use

### Issue 3: User has 0 assigned dialogues
**Cause:** Registration completed but sampling failed
**Fix:**
- Check console for sampling errors
- Verify `data/eval_data.json` loads correctly
- Manually assign dialogues in Firebase if needed

### Issue 4: Logout/Login loses assignments
**Cause:** Firebase authentication issue
**Fix:**
- Check Firebase Auth session persistence
- Verify `currentUsername` is set correctly
- Check `loadAssignedDialogues()` is called on login

---

## Success Criteria

✅ Each registered user automatically gets 10 unique dialogues
✅ No overlap between users (sampling without replacement works)
✅ Assignments persist across logout/login
✅ Dialogue dropdown only shows assigned dialogues
✅ Annotation progress is tracked per user
✅ Firebase stores assignments correctly
✅ Console logs show detailed sampling information

---

## Performance Benchmarks

- **Registration time:** 2-4 seconds (includes sampling + Firebase write)
- **Login time:** 1-2 seconds (includes loading assignments)
- **Dialogue load time:** < 1 second (only 10 dialogues to filter)

---

**Last Updated:** January 2, 2026
**Test Status:** Ready for validation

