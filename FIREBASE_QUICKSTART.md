# Firebase Quick Start - 15 Minute Setup

Get your annotation tool running with Firebase in 15 minutes.

## 📋 Prerequisites

- GitHub account
- Google account (for Firebase)
- Your annotation tool code

## 🚀 Quick Steps

### 1. Create Firebase Project (3 minutes)

```
1. Visit: https://console.firebase.google.com/
2. Click "Add project"
3. Name: "annotation-tool"
4. Disable Google Analytics
5. Click "Create project"
```

### 2. Add Web App (2 minutes)

```
1. Click web icon (</>)
2. App nickname: "Annotation Tool"
3. Don't check hosting
4. Click "Register app"
5. COPY the firebaseConfig object
6. Click "Continue to console"
```

### 3. Enable Firestore (2 minutes)

```
1. Click "Firestore Database" in sidebar
2. Click "Create database"
3. Choose "Production mode"
4. Select location (us-central)
5. Click "Enable"
```

### 4. Set Security Rules (1 minute)

In Firestore → Rules tab, paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /annotations/{annotationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

Click "Publish"

### 5. Enable Authentication (1 minute)

```
1. Click "Authentication" in sidebar
2. Click "Get started"
3. Click "Email/Password"
4. Toggle "Enable"
5. Click "Save"
```

### 6. Update Your Code (5 minutes)

#### A. Add Firebase to index.html

Add these lines BEFORE your `<script src="scripts/script.js">`:

```html
<!-- Firebase SDKs -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>

<!-- Firebase storage client -->
<script src="scripts/firebase-storage.js"></script>
```

#### B. Add config to script.js

Add this at the TOP of `scripts/script.js` (replace with YOUR config):

```javascript
// ========== FIREBASE CONFIGURATION ==========
// Replace with YOUR config from Firebase Console
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyC-YOUR-API-KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abc123"
};

let firebaseStorage = null;
let firebaseReady = false;

async function initFirebaseStorage() {
    if (firebaseReady) return true;
    
    firebaseStorage = window.firebaseStorage;
    const success = await firebaseStorage.init(FIREBASE_CONFIG);
    
    if (success) {
        firebaseReady = true;
        console.log('✅ Firebase ready');
    } else {
        console.error('❌ Firebase initialization failed');
    }
    
    return success;
}

// Update your DOMContentLoaded event
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App starting...');
    await initFirebaseStorage();
    init(); // Your existing init function
});
// ========== END FIREBASE CONFIGURATION ==========
```

#### C. Update storage functions

Find and replace these 6 functions in `script.js`:

**1. loadUsers()** - Load all registered users

```javascript
async function loadUsers() {
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        const users = await firebaseStorage.getAllUsers();
        displayUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('user-list').innerHTML = 
            '<p class="error-text">Error loading users from Firebase</p>';
    }
}
```

**2. handleRegister()** - Register new user

```javascript
async function handleRegister() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;
    
    if (!username || !password) {
        showLoginError('Please enter username and password');
        return;
    }
    
    if (password !== confirmPassword) {
        showLoginError('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        showLoginError('Password must be at least 6 characters');
        return;
    }
    
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        const result = await firebaseStorage.registerUser(username, password);
        
        if (!result.success) {
            showLoginError(result.message);
            return;
        }
        
        currentUsername = username;
        localStorage.setItem('annotation_username', username);
        
        hideLoginModal();
        await initializeApp();
        showStatus(`Welcome, ${username}! Registration successful.`, 'success');
    } catch (error) {
        console.error('Registration error:', error);
        showLoginError('Error registering user: ' + error.message);
    }
}
```

**3. handleLogin()** - Login existing user

```javascript
async function handleLogin() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    
    if (!username || !password) {
        showLoginError('Please enter username and password');
        return;
    }
    
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        const result = await firebaseStorage.loginUser(username, password);
        
        if (!result.success) {
            showLoginError(result.message);
            return;
        }
        
        currentUsername = username;
        localStorage.setItem('annotation_username', username);
        
        hideLoginModal();
        await initializeApp();
        showStatus(`Welcome back, ${username}!`, 'success');
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Error logging in: ' + error.message);
    }
}
```

**4. saveAnnotationToStorage()** - Save annotation

```javascript
async function saveAnnotationToStorage(entryId, annotation) {
    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    try {
        await firebaseStorage.saveAnnotation(currentUsername, entryId, annotation);
        console.log(`✅ Saved to Firebase: ${entryId}`);
        return true;
    } catch (error) {
        console.error('Error saving annotation:', error);
        throw error;
    }
}
```

**5. getAnnotationFromStorage()** - Load annotation

```javascript
async function getAnnotationFromStorage(entryId) {
    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    try {
        const annotation = await firebaseStorage.loadAnnotation(currentUsername, entryId);
        return annotation;
    } catch (error) {
        console.error('Error loading annotation:', error);
        return null;
    }
}
```

**6. checkAnnotationProgress()** - Check which dialogues are annotated

```javascript
async function checkAnnotationProgress() {
    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    let annotatedCount = 0;
    
    try {
        const annotatedDialogues = await firebaseStorage.getUserAnnotations();
        
        for (let i = 0; i < allDialogues.length; i++) {
            const dialogue = allDialogues[i];
            const isAnnotated = annotatedDialogues.includes(dialogue.entry_id);
            annotationStatus[dialogue.entry_id] = isAnnotated;
            if (isAnnotated) {
                annotatedCount++;
            }
        }
        
        console.log(`📊 Progress: ${annotatedCount}/${allDialogues.length} dialogues annotated`);
    } catch (error) {
        console.error('Error checking progress:', error);
    }
    
    updateProgressBar(annotatedCount, allDialogues.length);
}
```

**7. handleLogout()** - Logout user

```javascript
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        if (firebaseStorage) {
            firebaseStorage.logout();
        }
        
        localStorage.removeItem('annotation_username');
        currentUsername = null;
        location.reload();
    }
}
```

### 7. Test Locally (1 minute)

```bash
cd /Users/seacow/Documents/github/esc-tom.github.io
python3 -m http.server 8000
```

Open: http://localhost:8000

Test:
1. Register a new user
2. Create an annotation
3. Save it
4. Check Firebase Console → Firestore Database
5. See your data!

### 8. Deploy

```bash
git add .
git commit -m "Add Firebase storage"
git push origin main
```

Visit your GitHub Pages URL!

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Can register new user
- [ ] Can login with existing user
- [ ] Can save annotation
- [ ] Can load saved annotation
- [ ] Can logout
- [ ] Data appears in Firebase Console
- [ ] Browser console shows: `✅ Firebase ready`
- [ ] No errors in console

---

## 🎯 What You Get

**Before (localStorage):**
- ❌ Data lost when browser cleared
- ❌ Can't access from other devices
- ❌ No backup

**After (Firebase):**
- ✅ Cloud storage (never lost)
- ✅ Access from any device
- ✅ Automatic backup
- ✅ Real-time sync
- ✅ Easy data export

---

## 📊 View Your Data

### In Firebase Console

1. **Authentication tab** → See all users
2. **Firestore Database** → See collections:
   - `users` → User profiles
   - `annotations` → All annotations

### Export Data

Go to Firebase Console → Firestore → Select collection → Export

Or use browser console:

```javascript
// Export all annotations as JSON
const annotations = [];
const snapshot = await firebase.firestore().collection('annotations').get();
snapshot.forEach(doc => annotations.push(doc.data()));
console.log(JSON.stringify(annotations, null, 2));
// Right-click → Copy → Save to file
```

---

## 🆘 Troubleshooting

### "Firebase is not defined"

Check that Firebase CDNs are loaded BEFORE `script.js` in `index.html`

### "Permission denied"

Check Firestore security rules are published

### Registration fails

- Password must be 6+ characters
- Username must not exist already
- Check browser console for error

### Can't see data in Firestore

- Wait a few seconds (refresh console)
- Check "Start collection" was not selected
- Verify security rules allow writes

---

## 💡 Tips

### Password Requirements
- Minimum 6 characters (Firebase requirement)
- Can include letters, numbers, symbols

### Security
- API key is public (safe to share)
- Protected by Firestore security rules
- Users can only access their own data

### Free Tier Limits
- 1 GB storage
- 50,000 reads/day
- 20,000 writes/day
- More than enough for research use!

---

## 🎉 Done!

Your annotation tool now uses Firebase cloud storage!

**Next steps:**
1. Share tool URL with annotators
2. They register their own accounts
3. Start annotating
4. Export data from Firebase Console when done

**Much simpler than GitHub API!** 🔥

