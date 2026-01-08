/**
 * Firebase Storage Client for Annotation Tool
 * 
 * COLLECTION STRUCTURE:
 * ====================
 * Each annotator has their own annotations collection:
 * 
 * users/{uid}
 *   ├── username: string
 *   ├── email: string
 *   ├── assignedDialogues: string[]
 *   └── annotations/{dialogueId}  <-- Per-user annotations subcollection
 *       ├── userId: string
 *       ├── username: string
 *       ├── dialogueId: string
 *       ├── belief: string (with edit markers)
 *       ├── desire: string (with edit markers)
 *       ├── intention: string (with edit markers)
 *       ├── cognitive_appraisals: array
 *       ├── modified_utterances: object
 *       ├── dialogue_snapshot: array
 *       ├── edit_stats: object
 *       ├── min_context_turn: number
 *       └── timestamp: timestamp
 * 
 * This structure ensures:
 * - Each annotator's annotations are isolated in their own subcollection
 * - Easy to query all annotations for a specific user
 * - Easy to resume incomplete annotation tasks
 * - Clear data organization per annotator
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
     * @param {Object} config - Firebase configuration object
     * @returns {Promise<boolean>}
     */
    async init(config) {
        try {
            // Initialize Firebase (only once)
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            
            this.db = firebase.firestore();
            this.auth = firebase.auth();
            
            // Listen for authentication state changes
            this.auth.onAuthStateChanged((user) => {
                this.currentUser = user;
                if (user) {
                    console.log('🔐 User authenticated:', user.email);
                } else {
                    console.log('🔓 User logged out');
                }
            });
            
            this.initialized = true;
            console.log('Firebase initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            return false;
        }
    }

    /**
     * Wait for Firebase Auth to resolve current session
     * @returns {Promise<firebase.User|null>}
     */
    waitForAuthReady() {
        if (!this.auth) {
            throw new Error('Firebase not initialized');
        }

        // If auth state is already available, resolve immediately
        if (this.auth.currentUser) {
            this.currentUser = this.auth.currentUser;
            return Promise.resolve(this.currentUser);
        }

        // Otherwise, wait for the first auth state callback
        return new Promise((resolve) => {
            const unsubscribe = this.auth.onAuthStateChanged(
                (user) => {
                    this.currentUser = user;
                    unsubscribe();
                    resolve(user);
                },
                () => {
                    unsubscribe();
                    resolve(null);
                }
            );
        });
    }

    /**
     * Fetch a user's profile from Firestore
     * @param {string} uid - Firebase Auth UID
     * @returns {Promise<Object|null>}
     */
    async getUserProfile(uid) {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }

        try {
            const doc = await this.db.collection('users').doc(uid).get();
            if (!doc.exists) {
                return null;
            }
            return { uid: doc.id, ...doc.data() };
        } catch (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
    }

    /**
     * Register new user with username and password
     * Creates email from username for Firebase Auth
     * @param {string} username - User's chosen username
     * @param {string} password - User's password (min 6 chars)
     * @param {Array<string>} assignedDialogues - Array of dialogue IDs assigned to user
     * @param {Object} prolificData - Optional Prolific metadata {participantId, studyId, sessionId}
     * @returns {Promise<Object>} - {success, uid, message}
     */
    async registerUser(username, password, assignedDialogues = [], prolificData = null) {
        try {
            // Create email from username (Firebase Auth requires email)
            // Format: username@annotation.local
            const email = `${username}@annotation.local`;
            
            // Create user account with Firebase Auth
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            this.currentUser = userCredential.user;
            
            // Prepare user document
            const userDoc = {
                username: username,
                email: email,
                assignedDialogues: assignedDialogues,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Add Prolific metadata if provided
            if (prolificData) {
                userDoc.prolific = {
                    participantId: prolificData.participantId,
                    studyId: prolificData.studyId,
                    sessionId: prolificData.sessionId,
                    registeredAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                console.log('👥 Prolific participant registered:', prolificData.participantId);
            }
            
            // Store user profile in Firestore with assigned dialogues
            await this.db.collection('users').doc(this.currentUser.uid).set(userDoc);
            
            console.log('User registered:', username);
            console.log('📋 Assigned dialogues:', assignedDialogues.length);
            return { 
                success: true, 
                uid: this.currentUser.uid,
                username: username,
                assignedDialogues: assignedDialogues
            };
        } catch (error) {
            console.error('❌ Registration error:', error);
            
            // Handle specific Firebase Auth errors
            if (error.code === 'auth/email-already-in-use') {
                return { success: false, message: 'Username already exists' };
            } else if (error.code === 'auth/weak-password') {
                return { success: false, message: 'Password should be at least 6 characters' };
            } else if (error.code === 'auth/invalid-email') {
                return { success: false, message: 'Invalid username format' };
            }
            
            return { success: false, message: error.message };
        }
    }

    /**
     * Login existing user
     * @param {string} username - User's username
     * @param {string} password - User's password
     * @returns {Promise<Object>} - {success, uid, message}
     */
    async loginUser(username, password) {
        try {
            const email = `${username}@annotation.local`;
            
            // Sign in with Firebase Auth
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            this.currentUser = userCredential.user;
            
            console.log('User logged in:', username);
            return { 
                success: true, 
                uid: this.currentUser.uid,
                username: username
            };
        } catch (error) {
            console.error('❌ Login error:', error);
            
            // Handle specific errors
            if (error.code === 'auth/user-not-found') {
                return { success: false, message: 'Username not found. Please register first.' };
            } else if (error.code === 'auth/wrong-password') {
                return { success: false, message: 'Incorrect password' };
            } else if (error.code === 'auth/invalid-email') {
                return { success: false, message: 'Invalid username format' };
            }
            
            return { success: false, message: error.message };
        }
    }

    /**
     * Logout current user
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            await this.auth.signOut();
            this.currentUser = null;
            console.log('User logged out');
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }

    /**
     * Get all usernames (for display in login modal)
     * @returns {Promise<string[]>} - Array of usernames
     */
    async getAllUsers() {
        try {
            const snapshot = await this.db.collection('users').get();
            const users = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.username) {
                    users.push(data.username);
                }
            });
            
            console.log(`📋 Found ${users.length} registered users`);
            return users.sort(); // Alphabetical order
        } catch (error) {
            console.error('Error loading users:', error);
            return [];
        }
    }

    /**
     * Check if username is already taken
     * @param {string} username - Username to check
     * @returns {Promise<boolean>} - True if username exists, false if available
     */
    async isUsernameTaken(username) {
        try {
            const email = `${username}@annotation.local`;
            const methods = await this.auth.fetchSignInMethodsForEmail(email);
            return methods.length > 0; // If methods exist, username is taken
        } catch (error) {
            // If error is "user not found", username is available
            if (error.code === 'auth/user-not-found') {
                return false;
            }
            console.error('Error checking username:', error);
            return false; // On error, assume available to not block registration
        }
    }

    /**
     * Check username presence in Auth and Firestore
     * @param {string} username
     * @returns {Promise<{existsInAuth: boolean, existsInFirestore: boolean, authUid: string|null}>}
     */
    async getUsernameStatus(username) {
        const email = `${username}@annotation.local`;
        
        let existsInAuth = false;
        let existsInFirestore = false;
        let authUid = null;

        // Check Firebase Auth (email-based)
        try {
            const methods = await this.auth.fetchSignInMethodsForEmail(email);
            existsInAuth = methods.length > 0;
        } catch (error) {
            if (error.code !== 'auth/user-not-found') {
                console.error('Error checking username in Auth:', error);
            }
        }

        // Check Firestore profile
        try {
            const snap = await this.db.collection('users')
                .where('username', '==', username)
                .limit(1)
                .get();
            existsInFirestore = !snap.empty;
            if (existsInFirestore) {
                authUid = snap.docs[0].id;
            }
        } catch (error) {
            console.error('Error checking username in Firestore:', error);
        }

        return { existsInAuth, existsInFirestore, authUid };
    }

    /**
     * Reclaim an orphaned Auth account (Auth exists but no Firestore profile)
     * This attempts to sign in with the old password and recreate the Firestore profile
     * @param {string} username
     * @param {string} password - The original password for the orphaned account
     * @param {Array<string>} assignedDialogues
     * @returns {Promise<Object>} - {success, uid, username, message}
     */
    async reclaimOrphanedAccount(username, password, assignedDialogues = []) {
        try {
            const email = `${username}@annotation.local`;
            
            // Attempt to sign in with the old account
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            this.currentUser = userCredential.user;
            
            // Check if Firestore profile exists
            const existingProfile = await this.db.collection('users').doc(this.currentUser.uid).get();
            
            if (existingProfile.exists) {
                // Profile already exists, this is not an orphaned account
                return {
                    success: true,
                    uid: this.currentUser.uid,
                    username: username,
                    message: 'Account already exists with profile'
                };
            }
            
            // Recreate the Firestore profile
            const userDoc = {
                username: username,
                email: email,
                assignedDialogues: assignedDialogues,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                reclaimed: true,
                reclaimedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await this.db.collection('users').doc(this.currentUser.uid).set(userDoc);
            
            console.log('🔄 Orphaned account reclaimed:', username);
            return {
                success: true,
                uid: this.currentUser.uid,
                username: username,
                assignedDialogues: assignedDialogues,
                message: 'Account successfully reclaimed'
            };
        } catch (error) {
            console.error('❌ Error reclaiming account:', error);
            
            if (error.code === 'auth/wrong-password') {
                return { 
                    success: false, 
                    message: 'This username has an orphaned account. Please use the original password, or contact the researcher to delete it from Firebase Console.' 
                };
            } else if (error.code === 'auth/user-not-found') {
                return { 
                    success: false, 
                    message: 'User not found. Please register as new user.' 
                };
            } else if (error.code === 'auth/too-many-requests') {
                return {
                    success: false,
                    message: 'Too many failed attempts. Please wait a moment and try again, or contact the researcher.'
                };
            }
            
            return { success: false, message: 'Error reclaiming account: ' + error.message };
        }
    }

    /**
     * Delete current user's Auth account (can only delete own account)
     * @returns {Promise<boolean>}
     */
    async deleteCurrentAuthAccount() {
        if (!this.currentUser) {
            throw new Error('No user signed in');
        }

        try {
            await this.currentUser.delete();
            this.currentUser = null;
            console.log('🗑️ Auth account deleted');
            return true;
        } catch (error) {
            console.error('Error deleting auth account:', error);
            throw error;
        }
    }

    /**
     * Save annotation to Firestore
     * @param {string} username - Current username
     * @param {string} dialogueId - Dialogue ID
     * @param {Object} annotation - Annotation data
     * @returns {Promise<boolean>}
     */
    async saveAnnotation(username, dialogueId, annotation) {
        if (!this.currentUser) {
            throw new Error('User not authenticated. Please login first.');
        }

        try {
            // Use per-user annotations subcollection: users/{uid}/annotations/{dialogueId}
            const userDocRef = this.db.collection('users').doc(this.currentUser.uid);
            const annRef = userDocRef.collection('annotations').doc(dialogueId);

            await annRef.set({
                userId: this.currentUser.uid,
                username: username,
                dialogueId: dialogueId,
                ...annotation,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); // merge: true allows updates
            
            console.log(`Saved annotation in user collection: ${username}/${dialogueId}`);
            return true;
        } catch (error) {
            console.error('Error saving annotation:', error);
            throw error;
        }
    }

    /**
     * Load annotation from Firestore
     * @param {string} username - Current username
     * @param {string} dialogueId - Dialogue ID
     * @returns {Promise<Object|null>} - Annotation data or null
     */
    async loadAnnotation(username, dialogueId) {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return null;
        }
        
        try {
            // First try new per-user annotations subcollection
            const userDocRef = this.db.collection('users').doc(this.currentUser.uid);
            let doc = await userDocRef.collection('annotations').doc(dialogueId).get();
            
            if (doc.exists) {
                console.log(`Loaded annotation from user collection: ${dialogueId}`);
                return doc.data();
            }

            // Fallback to legacy top-level annotations collection (for older data)
            const legacyDocId = `${this.currentUser.uid}_${dialogueId}`;
            doc = await this.db.collection('annotations').doc(legacyDocId).get();
            if (doc.exists) {
                console.log(`Loaded legacy annotation: ${dialogueId}`);
                return doc.data();
            }
            
            console.log(`📄 No annotation found for: ${dialogueId}`);
            return null;
        } catch (error) {
            console.error('Error loading annotation:', error);
            return null;
        }
    }

    /**
     * Get list of all annotated dialogue IDs for current user
     * @returns {Promise<string[]>} - Array of dialogue IDs
     */
    async getUserAnnotations() {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return [];
        }
        
        try {
            const userDocRef = this.db.collection('users').doc(this.currentUser.uid);
            const snapshot = await userDocRef.collection('annotations').get();
            
            const dialogueIds = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.dialogueId) {
                    dialogueIds.push(data.dialogueId);
                }
            });
            
            console.log(`📊 Found ${dialogueIds.length} annotations for current user`);
            return dialogueIds;
        } catch (error) {
            console.error('Error getting user annotations:', error);
            return [];
        }
    }

    /**
     * Get assigned dialogues for current user
     * @returns {Promise<Array<string>>} - Array of dialogue IDs
     */
    async getAssignedDialogues() {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return [];
        }

        try {
            const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
            
            if (userDoc.exists) {
                const data = userDoc.data();
                const assigned = data.assignedDialogues || [];
                console.log(`📋 User has ${assigned.length} assigned dialogues`);
                return assigned;
            }
            
            return [];
        } catch (error) {
            console.error('Error getting assigned dialogues:', error);
            return [];
        }
    }

    /**
     * Get all assigned dialogues (from all users) for tracking
     * @returns {Promise<Array<string>>} - Array of all assigned dialogue IDs
     */
    async getAllAssignedDialogues() {
        try {
            const snapshot = await this.db.collection('users').get();
            const allAssigned = new Set();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.assignedDialogues && Array.isArray(data.assignedDialogues)) {
                    data.assignedDialogues.forEach(id => allAssigned.add(id));
                }
            });
            
            console.log(`📊 Total assigned dialogues across all users: ${allAssigned.size}`);
            return Array.from(allAssigned);
        } catch (error) {
            console.error('Error getting all assigned dialogues:', error);
            return [];
        }
    }

    /**
     * Check if annotation exists
     * @param {string} username - Username
     * @param {string} dialogueId - Dialogue ID
     * @returns {Promise<boolean>}
     */
    async annotationExists(username, dialogueId) {
        if (!this.currentUser) {
            return false;
        }

        try {
            const userDocRef = this.db.collection('users').doc(this.currentUser.uid);
            const doc = await userDocRef.collection('annotations').doc(dialogueId).get();
            if (doc.exists) return true;

            // Also check legacy location just in case
            const legacyDocId = `${this.currentUser.uid}_${dialogueId}`;
            const legacyDoc = await this.db.collection('annotations').doc(legacyDocId).get();
            return legacyDoc.exists;
        } catch (error) {
            console.error('Error checking annotation:', error);
            return false;
        }
    }

    /**
     * Get current username from Firestore
     * @returns {Promise<string|null>}
     */
    async getCurrentUsername() {
        if (!this.currentUser) {
            return null;
        }

        try {
            const doc = await this.db.collection('users').doc(this.currentUser.uid).get();
            if (doc.exists) {
                return doc.data().username;
            }
            return null;
        } catch (error) {
            console.error('Error getting username:', error);
            return null;
        }
    }

    /**
     * Delete annotation (optional - for cleanup)
     * @param {string} username - Username
     * @param {string} dialogueId - Dialogue ID
     * @returns {Promise<boolean>}
     */
    async deleteAnnotation(username, dialogueId) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            const userDocRef = this.db.collection('users').doc(this.currentUser.uid);
            await userDocRef.collection('annotations').doc(dialogueId).delete();
            
            // Best-effort cleanup of any legacy document
            const legacyDocId = `${this.currentUser.uid}_${dialogueId}`;
            await this.db.collection('annotations').doc(legacyDocId).delete().catch(() => {});
            
            console.log(`🗑️ Deleted annotation: ${dialogueId}`);
            return true;
        } catch (error) {
            console.error('Error deleting annotation:', error);
            throw error;
        }
    }

    /**
     * Get all annotations (admin function)
     * @returns {Promise<Array>} - All annotations
     */
    async getAllAnnotations() {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            const annotations = [];
            
            // Iterate over all users and their annotations subcollections
            const usersSnap = await this.db.collection('users').get();
            for (const userDoc of usersSnap.docs) {
                const userId = userDoc.id;
                const annSnap = await this.db.collection('users')
                    .doc(userId)
                    .collection('annotations')
                    .get();
                
                annSnap.forEach(doc => {
                    annotations.push({
                        id: doc.id,
                        userId,
                        ...doc.data()
                    });
                });
            }
            
            console.log(`📊 Retrieved ${annotations.length} total annotations`);
            return annotations;
        } catch (error) {
            console.error('Error getting all annotations:', error);
            return [];
        }
    }

    /**
     * Export current user's data as JSON
     * @returns {Promise<Object>} - User data and annotations
     */
    async exportUserData() {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            // Get user profile
            const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
            const userData = userDoc.data();

            // Get all annotations from user subcollection
            const annotationsSnapshot = await this.db.collection('users')
                .doc(this.currentUser.uid)
                .collection('annotations')
                .get();
            
            const annotations = {};
            annotationsSnapshot.forEach(doc => {
                const data = doc.data();
                annotations[data.dialogueId] = data;
            });

            return {
                user: userData,
                annotations: annotations,
                exportDate: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error exporting data:', error);
            throw error;
        }
    }

    /**
     * Mark Prolific study as completed
     * @param {number} completionTime - Time taken to complete (in seconds)
     * @returns {Promise<boolean>}
     */
    async markProlificComplete(completionTime) {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return false;
        }

        try {
            await this.db.collection('users').doc(this.currentUser.uid).update({
                'prolific.completedAt': firebase.firestore.FieldValue.serverTimestamp(),
                'prolific.completionTime': completionTime,
                'prolific.status': 'completed'
            });
            
            console.log('Marked Prolific study as complete');
            return true;
        } catch (error) {
            console.error('Error marking Prolific complete:', error);
            return false;
        }
    }

    /**
     * Get Prolific data for current user
     * @returns {Promise<Object|null>}
     */
    async getProlificData() {
        if (!this.currentUser) {
            return null;
        }

        try {
            const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                return data.prolific || null;
            }
            return null;
        } catch (error) {
            console.error('Error getting Prolific data:', error);
            return null;
        }
    }

    /**
     * Check if Prolific participant already exists
     * @param {string} participantId - Prolific participant ID
     * @returns {Promise<boolean>}
     */
    async isProlificParticipantRegistered(participantId) {
        try {
            const snapshot = await this.db.collection('users')
                .where('prolific.participantId', '==', participantId)
                .get();
            
            return !snapshot.empty;
        } catch (error) {
            console.error('Error checking Prolific participant:', error);
            return false;
        }
    }

    /**
     * Save user feedback about the annotation tool
     * @param {Object} feedbackData - Feedback data {rating, comments}
     * @returns {Promise<boolean>}
     */
    async saveFeedback(feedbackData) {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return false;
        }

        try {
            // Save feedback in user's document
            await this.db.collection('users').doc(this.currentUser.uid).update({
                feedback: {
                    rating: feedbackData.rating || 0,
                    comments: feedbackData.comments || '',
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
                }
            });

            console.log('✅ Feedback saved successfully');
            return true;
        } catch (error) {
            console.error('Error saving feedback:', error);
            return false;
        }
    }

    /**
     * Check if user has already submitted feedback
     * @returns {Promise<boolean>}
     */
    async hasFeedback() {
        if (!this.currentUser) {
            return false;
        }

        try {
            const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                return !!(data.feedback && data.feedback.submittedAt);
            }
            return false;
        } catch (error) {
            console.error('Error checking feedback:', error);
            return false;
        }
    }
}

// Create and export global instance
if (typeof window !== 'undefined') {
    window.FirebaseStorage = FirebaseStorage;
    window.firebaseStorage = new FirebaseStorage();
    console.log('🔥 Firebase Storage client loaded');
}

