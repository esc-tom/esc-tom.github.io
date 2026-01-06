/**
 * Firebase Storage Client for Annotation Tool
 * 
 * Simple cloud storage using Firebase Firestore and Authentication
 * Much simpler than GitHub API - no tokens needed!
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
            console.log('✅ Firebase initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            return false;
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
            
            console.log('✅ User registered:', username);
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
            
            console.log('✅ User logged in:', username);
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
            console.log('✅ User logged out');
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
            // Document ID format: userId_dialogueId
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            
            // Save to Firestore
            await this.db.collection('annotations').doc(docId).set({
                userId: this.currentUser.uid,
                username: username,
                dialogueId: dialogueId,
                ...annotation,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); // merge: true allows updates
            
            console.log(`✅ Saved annotation: ${username}/${dialogueId}`);
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
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            const doc = await this.db.collection('annotations').doc(docId).get();
            
            if (doc.exists) {
                console.log(`✅ Loaded annotation: ${dialogueId}`);
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
            const snapshot = await this.db.collection('annotations')
                .where('userId', '==', this.currentUser.uid)
                .get();
            
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
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            const doc = await this.db.collection('annotations').doc(docId).get();
            return doc.exists;
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
            const docId = `${this.currentUser.uid}_${dialogueId}`;
            await this.db.collection('annotations').doc(docId).delete();
            
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
            const snapshot = await this.db.collection('annotations').get();
            const annotations = [];
            
            snapshot.forEach(doc => {
                annotations.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
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

            // Get all annotations
            const annotationsSnapshot = await this.db.collection('annotations')
                .where('userId', '==', this.currentUser.uid)
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
            
            console.log('✅ Marked Prolific study as complete');
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
}

// Create and export global instance
if (typeof window !== 'undefined') {
    window.FirebaseStorage = FirebaseStorage;
    window.firebaseStorage = new FirebaseStorage();
    console.log('🔥 Firebase Storage client loaded');
}

