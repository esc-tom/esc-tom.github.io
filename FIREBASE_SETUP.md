# Firebase Setup Guide - Complete Implementation

Convert your annotation tool to use Firebase in 30 minutes.

## 📋 What You'll Get

- ✅ Cloud storage for all annotations
- ✅ Real-time sync across devices
- ✅ Built-in authentication
- ✅ Automatic backups
- ✅ Free tier (1GB storage, 50K reads/day)
- ✅ No tokens to manage

---

## 🚀 Step 1: Create Firebase Project (5 minutes)

### 1.1 Go to Firebase Console

Visit: https://console.firebase.google.com/

### 1.2 Create New Project

1. Click **"Add project"**
2. Project name: `annotation-tool` (or your choice)
3. Click **Continue**
4. Google Analytics: **Disable** (not needed)
5. Click **Create project**
6. Wait ~30 seconds
7. Click **Continue**

### 1.3 Add Web App

1. Click the **Web icon** (`</>`)
2. App nickname: `Annotation Tool`
3. **Don't** check "Firebase Hosting"
4. Click **Register app**
5. **Copy the firebaseConfig object** - you'll need this!

It looks like this:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC-xxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "annotation-tool-xxxxx.firebaseapp.com",
  projectId: "annotation-tool-xxxxx",
  storageBucket: "annotation-tool-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

**Save this config!** Click **Continue to console**

---

## 🔧 Step 2: Enable Firestore Database (3 minutes)

### 2.1 Create Database

1. In Firebase Console, click **Firestore Database** (left sidebar)
2. Click **Create database**
3. Select **Start in production mode** (we'll add rules next)
4. Choose location: **us-central** (or closest to you)
5. Click **Enable**
6. Wait ~1 minute for database creation

### 2.2 Set Security Rules

1. Click **Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users collection - users can read all, write only their own
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Annotations collection - users can read/write only their own
    match /annotations/{annotationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null 
        && annotationId.matches('^' + request.auth.uid + '_.*');
    }
    
    // Alternative: Allow all authenticated users (simpler)
    // Uncomment below if you want any logged-in user to access everything
    // match /{document=**} {
    //   allow read, write: if request.auth != null;
    // }
  }
}
```

3. Click **Publish**

---

## 🔐 Step 3: Enable Authentication (2 minutes)

### 3.1 Enable Email/Password Auth

1. Click **Authentication** (left sidebar)
2. Click **Get started**
3. Click **Email/Password** sign-in method
4. Toggle **Enable** switch ON
5. Click **Save**

**That's it for Firebase setup!**

---

## 💻 Step 4: Update Your Code (15 minutes)

### 4.1 Create Firebase Storage Client

Create file: `scripts/firebase-storage.js`

```javascript
/**
 * Firebase Storage Client for Annotation Tool
 * Replaces GitHub API storage with Firebase Firestore
 */

class FirebaseStorage {
    constructor() {
        this.db = null;
        this.auth = null;
        this.currentUser = null;
        this.initialized = false;
    }

    /**
     * Initialize Firebase with your config
     */
    async init(config) {
        try {
            // Initialize Firebase
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            
            this.db = firebase.firestore();
            this.auth = firebase.auth();
            
            // Listen for auth state changes
            this.auth.onAuthStateChanged((user) => {
                this.currentUser = user;
                console.log('Auth state changed:', user ? user.email : 'logged out');
            });
            
            this.initialized = true;
            console.log('✅ Firebase initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            return false;
        }
    }

    /**
     * Register new user with email/password
     */
    async registerUser(username, password) {
        try {
            // Create email from username (for Firebase Auth)
            const email = `${username}@annotation.local`;
            
            // Create user account
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            this.currentUser = userCredential.user;
            
            // Store user profile
            await this.db.collection('users').doc(this.currentUser.uid).set({
                username: username,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ User registered:', username);
            return { success: true, uid: this.currentUser.uid };
        } catch (error) {
            console.error('❌ Registration error:', error);
            
            // Handle specific errors
            if (error.code === 'auth/email-already-in-use') {
                return { success: false, message: 'Username already exists' };
            } else if (error.code === 'auth/weak-password') {
                return { success: false, message: 'Password should be at least 6 characters' };
            }
            
            return { success: false, message: error.message };
        }
    }

    /**
     * Login existing user
     */
    async loginUser(username, password) {
        try {
            const email = `${username}@annotation.local`;
            
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            this.currentUser = userCredential.user;
            
            console.log('✅ User logged in:', username);
            return { success: true, uid: this.currentUser.uid };
        } catch (error) {
            console.error('❌ Login error:', error);
            
            if (error.code === 'auth/user-not-found') {
                return { success: false, message: 'Username not found. Please register first.' };
            } else if (error.code === 'auth/wrong-password') {
                return { success: false, message: 'Incorrect password' };
            }
            
            return { success: false, message: error.message };
        }
    }

    /**
     * Logout current user
     */
    async logout() {
        await this.auth.signOut();
        this.currentUser = null;
        console.log('✅ User logged out');
    }

    /**
     * Get all users (for display in login modal)
     */
    async getAllUsers() {
        try {
            const snapshot = await this.db.collection('users').get();
            const users = [];
            snapshot.forEach(doc => {
                users.push(doc.data().username);
            });
            return users;
        } catch (error) {
            console.error('Error loading users:', error);
            return [];
        }
    }

    /**
     * Save annotation
     */
    async saveAnnotation(username, dialogueId, annotation) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            
            await this.db.collection('annotations').doc(docId).set({
                userId: this.currentUser.uid,
                username: username,
                dialogueId: dialogueId,
                ...annotation,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`✅ Saved annotation: ${dialogueId}`);
            return true;
        } catch (error) {
            console.error('Error saving annotation:', error);
            throw error;
        }
    }

    /**
     * Load annotation
     */
    async loadAnnotation(username, dialogueId) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            const doc = await this.db.collection('annotations').doc(docId).get();
            
            if (doc.exists) {
                console.log(`✅ Loaded annotation: ${dialogueId}`);
                return doc.data();
            }
            
            return null;
        } catch (error) {
            console.error('Error loading annotation:', error);
            return null;
        }
    }

    /**
     * Get all annotations for current user
     */
    async getUserAnnotations() {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            const snapshot = await this.db.collection('annotations')
                .where('userId', '==', this.currentUser.uid)
                .get();
            
            const dialogueIds = [];
            snapshot.forEach(doc => {
                dialogueIds.push(doc.data().dialogueId);
            });
            
            console.log(`📊 Found ${dialogueIds.length} annotations`);
            return dialogueIds;
        } catch (error) {
            console.error('Error getting user annotations:', error);
            return [];
        }
    }

    /**
     * Check if annotation exists
     */
    async annotationExists(username, dialogueId) {
        if (!this.currentUser) {
            return false;
        }

        try {
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            const doc = await this.db.collection('annotations').doc(docId).get();
            return doc.exists;
        } catch (error) {
            console.error('Error checking annotation:', error);
            return false;
        }
    }

    /**
     * Get current username
     */
    async getCurrentUsername() {
        if (!this.currentUser) {
            return null;
        }

        try {
            const doc = await this.db.collection('users').doc(this.currentUser.uid).get();
            return doc.exists ? doc.data().username : null;
        } catch (error) {
            console.error('Error getting username:', error);
            return null;
        }
    }

    /**
     * Delete annotation (optional)
     */
    async deleteAnnotation(username, dialogueId) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            await this.db.collection('annotations').doc(docId).delete();
            console.log(`🗑️ Deleted annotation: ${dialogueId}`);
            return true;
        } catch (error) {
            console.error('Error deleting annotation:', error);
            throw error;
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.FirebaseStorage = FirebaseStorage;
    window.firebaseStorage = new FirebaseStorage();
    console.log('🔥 Firebase Storage client loaded');
}
```

### 4.2 Update index.html

Replace the GitHub storage script with Firebase:

```html
<!-- Remove this (if present): -->
<!-- <script src="scripts/github-storage.js"></script> -->

<!-- Add Firebase SDKs (before your scripts) -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>

<!-- Add Firebase storage client -->
<script src="scripts/firebase-storage.js"></script>

<!-- Your main script -->
<script src="scripts/script.js"></script>
```

### 4.3 Add Firebase Config to script.js

At the top of `scripts/script.js`, add your Firebase config:

```javascript
// Firebase Configuration
// Replace with YOUR config from Firebase Console
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyC-your-api-key-here",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abc123"
};

// Initialize Firebase storage
let firebaseStorage = null;
let firebaseReady = false;

async function initFirebaseStorage() {
    if (firebaseReady) return true;
    
    firebaseStorage = window.firebaseStorage;
    const success = await firebaseStorage.init(FIREBASE_CONFIG);
    
    if (success) {
        firebaseReady = true;
        console.log('✅ Firebase ready');
    }
    
    return success;
}

// Call this when app starts
document.addEventListener('DOMContentLoaded', async () => {
    await initFirebaseStorage();
    init(); // Your existing init function
});
```

---

## 🔄 Step 5: Update Storage Functions (10 minutes)

Replace these functions in `scripts/script.js`:

### Update loadUsers()

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

### Update handleRegister()

```javascript
async function handleRegister() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;
    
    // ... existing validation code ...
    
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        // Register with Firebase
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
        showLoginError('Error registering user');
    }
}
```

### Update handleLogin()

```javascript
async function handleLogin() {
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    
    // ... existing validation code ...
    
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        // Login with Firebase
        const result = await firebaseStorage.loginUser(username, password);
        
        if (!result.success) {
            showLoginError(result.message);
            return;
        }
        
        currentUsername = username;
        localStorage.setItem('annotation_username', username);
        
        hideLoginModal();
        await initializeApp();
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Error logging in');
    }
}
```

### Update saveAnnotationToStorage()

```javascript
async function saveAnnotationToStorage(entryId, annotation) {
    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    try {
        await firebaseStorage.saveAnnotation(currentUsername, entryId, annotation);
        return true;
    } catch (error) {
        console.error('Error saving annotation:', error);
        throw error;
    }
}
```

### Update getAnnotationFromStorage()

```javascript
async function getAnnotationFromStorage(entryId) {
    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    try {
        return await firebaseStorage.loadAnnotation(currentUsername, entryId);
    } catch (error) {
        console.error('Error loading annotation:', error);
        return null;
    }
}
```

### Update checkAnnotationProgress()

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
    } catch (error) {
        console.error('Error checking progress:', error);
    }
    
    updateProgressBar(annotatedCount, allDialogues.length);
}
```

### Update handleLogout()

```javascript
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        // Logout from Firebase
        if (firebaseStorage) {
            firebaseStorage.logout();
        }
        
        localStorage.removeItem('annotation_username');
        location.reload();
    }
}
```

---

## ✅ Step 6: Test Your Setup (5 minutes)

### 6.1 Test Locally

```bash
cd /Users/seacow/Documents/github/esc-tom.github.io
python3 -m http.server 8000
```

Open: http://localhost:8000

### 6.2 Test Workflow

1. **Register a user**
   - Enter username and password
   - Click "Register New User"
   - Should succeed

2. **Check Firebase Console**
   - Go to Authentication tab
   - Should see new user
   - Go to Firestore tab
   - Should see `users` collection with user doc

3. **Create annotation**
   - Select a dialogue
   - Fill out annotation
   - Click "Save Annotation"
   - Check Firestore → `annotations` collection

4. **Logout and login**
   - Logout
   - Login with same credentials
   - Should see your previous annotation

5. **Check browser console**
   - Should see: `✅ Firebase ready`
   - Should see: `✅ User logged in: username`
   - Should see: `✅ Saved annotation: dialogue_id`

---

## 🚀 Step 7: Deploy

```bash
git add index.html scripts/firebase-storage.js scripts/script.js
git commit -m "Migrate to Firebase storage"
git push origin main
```

Visit your GitHub Pages URL in 1-2 minutes!

---

## 📊 Firebase Console Overview

### View Your Data

1. **Authentication** → See all registered users
2. **Firestore Database** → Browse collections:
   - `users` → User profiles
   - `annotations` → All annotations

### Export Data

```javascript
// In Firebase Console, go to Firestore
// Click on collection → Export to JSON
// Or use this script in browser console:

const annotations = [];
const snapshot = await firebase.firestore().collection('annotations').get();
snapshot.forEach(doc => annotations.push(doc.data()));
console.log(JSON.stringify(annotations, null, 2));
```

---

## 🔒 Security Notes

### What's Public vs Private

**Public (Safe to share):**
- ✅ Firebase API Key
- ✅ Project ID  
- ✅ Auth Domain

**Private (Keep secret):**
- ❌ User passwords (stored by Firebase Auth)
- ❌ Service account keys (not used here)

**The API key is safe** because:
- Protected by Security Rules
- Only allows what rules permit
- Can't be used without rules allowing it

---

## 🎯 Benefits Over localStorage/GitHub

| Feature | localStorage | GitHub API | Firebase |
|---------|-------------|------------|----------|
| **Cloud storage** | ❌ | ✅ | ✅ |
| **Setup complexity** | ⭐ Easy | ⭐⭐⭐⭐ Hard | ⭐⭐ Medium |
| **Token management** | None | Complex | None |
| **Real-time sync** | ❌ | ❌ | ✅ |
| **Built-in auth** | ❌ | ❌ | ✅ |
| **Data export** | Manual | Manual | Easy |
| **Cost** | Free | Free | Free tier |

---

## 🆘 Troubleshooting

### "Firebase is not defined"

Check that Firebase scripts are loaded before your code:
```html
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
```

### "Permission denied" errors

Check your Firestore security rules. For testing, you can temporarily use:
```javascript
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

### Registration fails

- Check password is at least 6 characters
- Check username doesn't already exist
- Look at browser console for specific error

### Can't see data in Firestore

- Wait a few seconds (database updates may take a moment)
- Refresh Firebase Console
- Check browser console for errors

---

## ✅ Migration Checklist

- [ ] Created Firebase project
- [ ] Enabled Firestore Database
- [ ] Set security rules
- [ ] Enabled Authentication (Email/Password)
- [ ] Copied Firebase config
- [ ] Created `firebase-storage.js`
- [ ] Updated `index.html` with Firebase CDNs
- [ ] Added config to `script.js`
- [ ] Updated all storage functions
- [ ] Tested registration
- [ ] Tested login
- [ ] Tested saving annotation
- [ ] Tested loading annotation
- [ ] Verified data in Firebase Console
- [ ] Deployed to GitHub Pages

---

## 🎉 You're Done!

Your annotation tool now uses Firebase! Much simpler than GitHub API:

- ✅ No tokens to manage
- ✅ Built-in authentication
- ✅ Real-time cloud storage
- ✅ Easy data export
- ✅ Free tier is generous

**Next:** Share your tool URL with annotators - they just need to register!

---

**Questions? Check the browser console for helpful error messages.**

