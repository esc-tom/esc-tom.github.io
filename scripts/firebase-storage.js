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
        this.customUserId = null; // Store custom user ID (Prolific ID or username)
        this.initialized = false;
    }

    /**
     * Get the custom user ID (Prolific participant ID or username)
     * This is the Firestore document ID for the user
     * @returns {string|null} - Custom user ID or null if not available
     */
    getCustomUserId() {
        return this.customUserId;
    }

    /**
     * Set the custom user ID (called after login/registration)
     * @param {string} customId - The custom user ID (Prolific ID or username)
     */
    setCustomUserId(customId) {
        this.customUserId = customId;
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
     * @param {Array<string>} candidateDialogues - Array of CANDIDATE dialogue IDs (not yet assigned)
     * @param {Object} prolificData - Optional Prolific metadata {participantId, studyId, sessionId}
     * @returns {Promise<Object>} - {success, uid, message}
     */
    async registerUser(username, password, candidateDialogues = [], prolificData = null) {
        try {
            // Determine custom user ID: Prolific participant ID for Prolific users, username for regular users
            const customUserId = prolificData ? prolificData.participantId : username;

            // Create email from username (Firebase Auth requires email)
            const email = `${username}@annotation.local`;

            // Create user account with Firebase Auth
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            this.currentUser = userCredential.user;

            // Perform Transactional Assignment
            const assignedIds = await this.assignDialoguesTransactional(
                customUserId,
                5, // DIALOGUES_PER_USER (hardcoded or passed config)
                candidateDialogues,
                [] // excludeIds
            );

            // Prepare base user document fields (assignment handled by transaction above/below? 
            // Wait, transaction wrote 'assignedDialogues', but we need to set other metadata)

            // NOTE: The transaction sets 'assignedDialogues'. We need to update with the rest of the profile.
            // We use {merge: true} to not overwrite what the transaction wrote.

            const userDoc = {
                username: username,
                email: email,
                authUid: this.currentUser.uid,
                // assignedDialogues: assignedIds, // Already set by transaction
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastActiveAt: firebase.firestore.FieldValue.serverTimestamp() // vital for reclamation
            };

            // Add Prolific metadata if provided
            if (prolificData) {
                userDoc.prolific = {
                    participantId: prolificData.participantId,
                    studyId: prolificData.studyId,
                    sessionId: prolificData.sessionId,
                    password: password,
                    originalAssignedDialogues: assignedIds,
                    registeredAt: firebase.firestore.FieldValue.serverTimestamp()
                };
            }

            // Store user profile
            await this.db.collection('users').doc(customUserId).set(userDoc, { merge: true });

            // Store custom user ID for this session
            this.setCustomUserId(customUserId);

            console.log('User registered:', username, `(custom ID: ${customUserId})`);
            console.log('📋 Assigned dialogues:', assignedIds.length);
            return {
                success: true,
                uid: customUserId,
                authUid: this.currentUser.uid,
                username: username,
                assignedDialogues: assignedIds
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

            // Look up user by custom ID (username is the custom ID for regular users)
            const userDoc = await this.db.collection('users').doc(username).get();
            if (!userDoc.exists) {
                // Fallback: try to find by Auth UID (for backward compatibility)
                const userDocByUid = await this.db.collection('users').doc(this.currentUser.uid).get();
                if (userDocByUid.exists) {
                    console.log('User logged in (found by Auth UID):', username);
                    return {
                        success: true,
                        uid: username, // Return username as custom ID
                        authUid: this.currentUser.uid,
                        username: username
                    };
                }
                return { success: false, message: 'User profile not found. Please register first.' };
            }

            // Verify Auth UID matches (for security)
            const userData = userDoc.data();
            if (userData.authUid && userData.authUid !== this.currentUser.uid) {
                console.warn('Auth UID mismatch - user may have been recreated');
            }

            // Store custom user ID for this session
            this.setCustomUserId(username);

            console.log('User logged in:', username, `(custom ID: ${username})`);
            return {
                success: true,
                uid: username, // Return custom ID (username)
                authUid: this.currentUser.uid,
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
            this.customUserId = null; // Clear custom user ID on logout
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
     * Ensure user document exists in Firestore
     * Creates it if missing, updates lastActiveAt if it exists
     * @param {string} uid - User UID
     * @param {string} username - Username
     * @param {string} email - User email
     * @returns {Promise<boolean>} - True if document exists/created, false on error
     */
    async ensureUserDocumentExists(customUserId, username, email) {
        if (!this.db) {
            console.error('Firestore not initialized');
            return false;
        }

        try {
            // Use custom user ID (Prolific ID or username) as document ID
            const userDocRef = this.db.collection('users').doc(customUserId);
            const userDoc = await userDocRef.get();

            if (!userDoc.exists) {
                // Create user document with minimal required fields
                // Use merge: true to avoid overwriting if document gets created concurrently
                await userDocRef.set({
                    username: username,
                    email: email || `${username}@annotation.local`,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                // Verify document was created
                const verifyDoc = await userDocRef.get();
                if (!verifyDoc.exists) {
                    console.error('❌ Failed to verify user document creation');
                    return false;
                }

                console.log('✅ Created missing user document:', uid);
                return true;
            } else {
                // Document exists - update lastActiveAt timestamp
                // Also ensure username is set if missing (shouldn't happen, but defensive)
                const updateData = {
                    lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                const existingData = userDoc.data();
                if (!existingData.username) {
                    updateData.username = username;
                }
                if (!existingData.email) {
                    updateData.email = email || `${username}@annotation.local`;
                }

                await userDocRef.update(updateData).catch(err => {
                    // If update fails, try set with merge as fallback
                    console.warn('Update failed, trying set with merge:', err);
                    return userDocRef.set(updateData, { merge: true });
                });

                return true;
            }
        } catch (error) {
            console.error('❌ Error ensuring user document exists:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                uid: uid,
                username: username
            });
            return false;
        }
    }

    /**
     * Save annotation to Firestore
     * @param {string} username - Current username
     * @param {string} dialogueId - Dialogue ID
     * @param {Object} annotation - Annotation data
     * @param {string} collectionName - Collection name (default: 'annotations')
     * @returns {Promise<boolean>}
     */
    async saveAnnotation(username, dialogueId, annotation, collectionName = 'annotations') {
        // Ensure database is initialized
        if (!this.db) {
            throw new Error('Firestore database not initialized. Please initialize Firebase first.');
        }

        if (!this.auth) {
            throw new Error('Firebase Auth not initialized. Please initialize Firebase first.');
        }

        // Sync currentUser with auth.currentUser to ensure we have the latest state
        if (this.auth.currentUser) {
            this.currentUser = this.auth.currentUser;
        }

        // Check authentication - use both currentUser and auth.currentUser as fallback
        const user = this.currentUser || this.auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated. Please login first.');
        }

        // Ensure we have a valid UID
        if (!user.uid) {
            throw new Error('Invalid user: missing UID. Please login again.');
        }

        try {
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId() || username;

            // Ensure the user document exists before writing to subcollection
            // This is required by Firestore security rules - parent document must exist
            const userDocExists = await this.ensureUserDocumentExists(
                customUserId,
                username,
                user.email || `${username}@annotation.local`
            );

            if (!userDocExists) {
                throw new Error('Failed to ensure user document exists. Cannot save annotation.');
            }

            // Use per-user annotations subcollection: users/{customUserId}/{collectionName}/{dialogueId}
            const userDocRef = this.db.collection('users').doc(customUserId);
            const annRef = userDocRef.collection(collectionName).doc(dialogueId);

            // Ensure currentUser is set for future operations
            this.currentUser = user;

            // Write annotation to subcollection
            // Use customUserId in the userId field to match the document path
            await annRef.set({
                userId: customUserId, // Use custom ID (participantId or username) instead of Auth UID
                username: username,
                dialogueId: dialogueId,
                ...annotation,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); // merge: true allows updates

            console.log(`✅ Saved annotation in user collection: ${username}/${dialogueId}`);
            return true;
        } catch (error) {
            console.error('❌ Error saving annotation:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                uid: user.uid,
                username: username,
                dialogueId: dialogueId
            });

            // Provide more specific error messages with debugging info
            if (error.code === 'permission-denied') {
                const debugInfo = `User: ${username} (${user.uid}), Dialogue: ${dialogueId}, Collection: ${collectionName}`;
                console.error('Permission denied details:', debugInfo);
                throw new Error(`Permission denied when saving annotation. This usually means:\n1. Firestore security rules don't allow writing to users/${user.uid}/${collectionName}/${dialogueId}\n2. The user document doesn't exist (should be auto-created)\n3. Authentication token is invalid\n\nDebug: ${debugInfo}\n\nPlease check Firestore security rules allow authenticated users to write to their own ${collectionName} subcollection.`);
            } else if (error.code === 'unavailable') {
                throw new Error('Firestore is unavailable. Please check your internet connection and try again.');
            } else if (error.code === 'unauthenticated') {
                throw new Error('Authentication expired. Please login again.');
            } else if (error.code === 'failed-precondition') {
                throw new Error('Firestore precondition failed. The user document may be in an invalid state. Please try logging out and back in.');
            } else if (error.message) {
                throw new Error(`Failed to save annotation: ${error.message}`);
            } else {
                throw new Error(`Failed to save annotation: ${error.code || 'Unknown error'}`);
            }
        }
    }

    /**
     * Load annotation from Firestore
     * @param {string} username - Current username
     * @param {string} dialogueId - Dialogue ID
     * @param {string} collectionName - Collection name (default: 'annotations')
     * @returns {Promise<Object|null>} - Annotation data or null
     */
    async loadAnnotation(username, dialogueId, collectionName = 'annotations') {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return null;
        }

        try {
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId() || username;

            // First try new per-user annotations subcollection
            const userDocRef = this.db.collection('users').doc(customUserId);
            let doc = await userDocRef.collection(collectionName).doc(dialogueId).get();

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
     * @param {string} collectionName - Collection name (default: 'annotations')
     * @returns {Promise<string[]>} - Array of dialogue IDs
     */
    async getUserAnnotations(collectionName = 'annotations') {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return [];
        }

        try {
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                console.warn('Custom user ID not set, cannot get all annotation IDs');
                return [];
            }

            const userDocRef = this.db.collection('users').doc(customUserId);
            const snapshot = await userDocRef.collection(collectionName).get();

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
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                console.warn('Custom user ID not set, cannot get assigned dialogues');
                return [];
            }

            const userDoc = await this.db.collection('users').doc(customUserId).get();

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
     * @param {string} collectionName - Collection name (default: 'annotations')
     * @returns {Promise<boolean>}
     */
    async annotationExists(username, dialogueId, collectionName = 'annotations') {
        if (!this.currentUser) {
            return false;
        }

        try {
            const userDocRef = this.db.collection('users').doc(this.currentUser.uid);
            const doc = await userDocRef.collection(collectionName).doc(dialogueId).get();
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
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                return null;
            }

            const doc = await this.db.collection('users').doc(customUserId).get();
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
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                throw new Error('Custom user ID not set');
            }

            const userDocRef = this.db.collection('users').doc(customUserId);
            await userDocRef.collection('annotations').doc(dialogueId).delete();

            // Best-effort cleanup of any legacy document (using Auth UID for legacy)
            const legacyDocId = `${this.currentUser.uid}_${dialogueId}`;
            await this.db.collection('annotations').doc(legacyDocId).delete().catch(() => { });

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

            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                console.warn('Custom user ID not set, cannot get all annotations');
                return {};
            }

            // Get all annotations from user subcollection
            const annotationsSnapshot = await this.db.collection('users')
                .doc(customUserId)
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
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                console.warn('Custom user ID not set, cannot mark Prolific complete');
                return false;
            }

            await this.db.collection('users').doc(customUserId).update({
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
     * Mark Prolific submission as rejected with reason
     * @param {string} reason - Reason for rejection
     * @param {Object} qualityCheckData - Data about the quality check failure
     * @returns {Promise<boolean>}
     */
    async markProlificRejected(reason, qualityCheckData = {}) {
        if (!this.currentUser) {
            console.warn('User not authenticated');
            return false;
        }

        try {
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                console.warn('Custom user ID not set, cannot mark Prolific rejected');
                return false;
            }

            await this.db.collection('users').doc(customUserId).update({
                'prolific.rejectedAt': firebase.firestore.FieldValue.serverTimestamp(),
                'prolific.status': 'rejected',
                'prolific.rejectionReason': reason,
                'prolific.qualityCheckData': qualityCheckData
            });

            console.log('Marked Prolific submission as rejected:', reason);
            return true;
        } catch (error) {
            console.error('Error marking Prolific rejected:', error);
            return false;
        }
    }

    /**
     * Get user data including instruction reading stats
     * @returns {Promise<Object|null>}
     */
    async getUserData() {
        if (!this.currentUser) {
            return null;
        }

        try {
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                return null;
            }

            const userDoc = await this.db.collection('users').doc(customUserId).get();
            if (!userDoc.exists) {
                return null;
            }

            return userDoc.data();
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
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
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                return null;
            }

            const userDoc = await this.db.collection('users').doc(customUserId).get();
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
     * Get Prolific user data by participant ID
     * @param {string} participantId - Prolific participant ID
     * @returns {Promise<Object|null>} - User document data or null
     */
    async getProlificUserByParticipantId(participantId) {
        try {
            // For Prolific users, participantId is the custom user ID (document ID)
            const doc = await this.db.collection('users').doc(participantId).get();

            if (!doc.exists) {
                // Fallback: try query by field (for backward compatibility with old data)
                const snapshot = await this.db.collection('users')
                    .where('prolific.participantId', '==', participantId)
                    .limit(1)
                    .get();

                if (snapshot.empty) {
                    return null;
                }

                const oldDoc = snapshot.docs[0];
                return {
                    uid: oldDoc.id,
                    ...oldDoc.data()
                };
            }

            return {
                uid: doc.id, // This will be the participantId (custom ID)
                ...doc.data()
            };
        } catch (error) {
            console.error('Error getting Prolific user:', error);
            return null;
        }
    }

    /**
     * Check if Firebase Auth account exists for Prolific username
     * @param {string} participantId - Prolific participant ID
     * @returns {Promise<{exists: boolean, email: string|null}>}
     */
    async checkProlificAuthAccount(participantId) {
        try {
            const username = `prolific_${participantId}`;
            const email = `${username}@annotation.local`;

            const methods = await this.auth.fetchSignInMethodsForEmail(email);
            return {
                exists: methods.length > 0,
                email: email,
                username: username
            };
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                return { exists: false, email: null, username: null };
            }
            console.error('Error checking Prolific Auth account:', error);
            return { exists: false, email: null, username: null };
        }
    }

    /**
     * Recreate Prolific user Firestore profile from Auth account
     * Attempts to recover assigned dialogues from existing annotations
     * @param {string} participantId - Prolific participant ID
     * @param {string} password - User's password (must be known)
     * @param {Object} prolificParams - Prolific parameters
     * @returns {Promise<Object>} - {success, uid, username, assignedDialogues, message}
     */
    async recreateProlificProfile(participantId, password, prolificParams) {
        try {
            const username = `prolific_${participantId}`;
            const email = `${username}@annotation.local`;

            // First, try to sign in to get the Auth user
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            const authUser = userCredential.user;
            this.currentUser = authUser;

            // Try to recover original assigned dialogues from prolific metadata first
            // Priority: 1) originalAssignedDialogues in metadata, 2) assignedDialogues in doc, 3) reconstruct from annotations
            let originalAssignedDialogues = [];

            // First, check if the current user document still exists (might be partially corrupted)
            try {
                const currentUserDoc = await this.db.collection('users').doc(authUser.uid).get();
                if (currentUserDoc.exists) {
                    const data = currentUserDoc.data();
                    if (data.prolific?.originalAssignedDialogues && data.prolific.originalAssignedDialogues.length > 0) {
                        originalAssignedDialogues = data.prolific.originalAssignedDialogues;
                        console.log(`📋 Found original assigned dialogues in current doc metadata: ${originalAssignedDialogues.length}`);
                    } else if (data.assignedDialogues && data.assignedDialogues.length > 0) {
                        originalAssignedDialogues = data.assignedDialogues;
                        console.log(`📋 Found assigned dialogues in current doc: ${originalAssignedDialogues.length}`);
                    }
                }
            } catch (error) {
                console.warn('Could not read current user doc:', error);
            }

            // If not found in current doc, check other documents with same participantId
            // (in case profile was deleted but another doc exists)
            if (originalAssignedDialogues.length === 0) {
                try {
                    const prolificQuery = await this.db.collection('users')
                        .where('prolific.participantId', '==', prolificParams.participantId)
                        .limit(1)
                        .get();

                    if (!prolificQuery.empty) {
                        const existingDoc = prolificQuery.docs[0].data();
                        if (existingDoc.prolific?.originalAssignedDialogues && existingDoc.prolific.originalAssignedDialogues.length > 0) {
                            originalAssignedDialogues = existingDoc.prolific.originalAssignedDialogues;
                            console.log(`📋 Found original assigned dialogues in another doc metadata: ${originalAssignedDialogues.length}`);
                        } else if (existingDoc.assignedDialogues && existingDoc.assignedDialogues.length > 0) {
                            originalAssignedDialogues = existingDoc.assignedDialogues;
                            console.log(`📋 Found assigned dialogues in another doc: ${originalAssignedDialogues.length}`);
                        }
                    }
                } catch (error) {
                    console.warn('Could not query for original dialogues:', error);
                }
            }

            // Try to recover critical user data to preserve it during recreation
            let existingFirstInstructionRead = null;
            let existingAnnotationsWithoutBdiEdits = null;

            try {
                // Check current doc first (Auth UID)
                const currentUserDoc = await this.db.collection('users').doc(authUser.uid).get();
                if (currentUserDoc.exists) {
                    const data = currentUserDoc.data();
                    if (data.first_instruction_read) {
                        existingFirstInstructionRead = data.first_instruction_read;
                        console.log('📋 Found first_instruction_read in current doc, will preserve it');
                    }
                    if (data.annotations_without_bdi_edits !== undefined) {
                        existingAnnotationsWithoutBdiEdits = data.annotations_without_bdi_edits;
                        console.log('📋 Found annotations_without_bdi_edits in current doc, will preserve it');
                    }
                }

                // If not found, check participantId doc
                if (!existingFirstInstructionRead || existingAnnotationsWithoutBdiEdits === null) {
                    const participantDoc = await this.db.collection('users').doc(participantId).get();
                    if (participantDoc.exists) {
                        const data = participantDoc.data();
                        if (!existingFirstInstructionRead && data.first_instruction_read) {
                            existingFirstInstructionRead = data.first_instruction_read;
                            console.log('📋 Found first_instruction_read in participantId doc, will preserve it');
                        }
                        if (existingAnnotationsWithoutBdiEdits === null && data.annotations_without_bdi_edits !== undefined) {
                            existingAnnotationsWithoutBdiEdits = data.annotations_without_bdi_edits;
                            console.log('📋 Found annotations_without_bdi_edits in participantId doc, will preserve it');
                        }
                    }
                }

                // If still not found, query by participantId
                if (!existingFirstInstructionRead || existingAnnotationsWithoutBdiEdits === null) {
                    const prolificQuery = await this.db.collection('users')
                        .where('prolific.participantId', '==', prolificParams.participantId)
                        .limit(1)
                        .get();

                    if (!prolificQuery.empty) {
                        const queryDoc = prolificQuery.docs[0].data();
                        if (!existingFirstInstructionRead && queryDoc.first_instruction_read) {
                            existingFirstInstructionRead = queryDoc.first_instruction_read;
                            console.log('📋 Found first_instruction_read in query doc, will preserve it');
                        }
                        if (existingAnnotationsWithoutBdiEdits === null && queryDoc.annotations_without_bdi_edits !== undefined) {
                            existingAnnotationsWithoutBdiEdits = queryDoc.annotations_without_bdi_edits;
                            console.log('📋 Found annotations_without_bdi_edits in query doc, will preserve it');
                        }
                    }
                }
            } catch (error) {
                console.warn('Could not recover user data fields:', error);
            }

            // Check if there are any existing annotations (to recover assigned dialogues as fallback)
            let existingAnnotations = [];
            let recoveredDialoguesFromAnnotations = [];

            try {
                // Try by custom ID first (participantId), then fallback to Auth UID
                let annotationsSnapshot = null;
                try {
                    annotationsSnapshot = await this.db.collection('users')
                        .doc(participantId)
                        .collection('annotations')
                        .get();
                } catch (err) {
                    // Fallback to Auth UID for backward compatibility
                    annotationsSnapshot = await this.db.collection('users')
                        .doc(authUser.uid)
                        .collection('annotations')
                        .get();
                }

                annotationsSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.dialogueId) {
                        existingAnnotations.push(data.dialogueId);
                        recoveredDialoguesFromAnnotations.push(data.dialogueId);
                    }
                });

                console.log(`📋 Found ${recoveredDialoguesFromAnnotations.length} dialogues from existing annotations`);
            } catch (error) {
                console.warn('Could not recover annotations:', error);
            }

            // Prioritize original assigned dialogues, fallback to annotations
            // If we have original, use it; otherwise use annotations (which might be incomplete)
            let assignedDialogues = originalAssignedDialogues.length > 0
                ? originalAssignedDialogues
                : recoveredDialoguesFromAnnotations;

            if (assignedDialogues.length === 0) {
                console.warn('⚠️ No assigned dialogues found - profile recreation will need new assignment');
                // Return empty array - caller should handle this case (only for brand new profiles)
            } else {
                console.log(`✅ Using ${assignedDialogues.length} assigned dialogues (${originalAssignedDialogues.length > 0 ? 'original' : 'recovered from annotations'})`);
            }

            // Recreate the Firestore profile
            const userDoc = {
                username: username,
                email: email,
                authUid: authUser.uid, // CRITICAL: Store Auth UID for security rules
                assignedDialogues: assignedDialogues,
                prolific: {
                    participantId: prolificParams.participantId,
                    studyId: prolificParams.studyId,
                    sessionId: prolificParams.sessionId,
                    password: password, // Store password again
                    originalAssignedDialogues: assignedDialogues, // Store as backup for future recovery
                    registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
                    profileRecreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    recreated: true
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // CRITICAL: Preserve important user data fields if they exist
            if (existingFirstInstructionRead) {
                userDoc.first_instruction_read = existingFirstInstructionRead;
                console.log('✅ Preserved first_instruction_read during profile recreation');
            }
            if (existingAnnotationsWithoutBdiEdits !== null) {
                userDoc.annotations_without_bdi_edits = existingAnnotationsWithoutBdiEdits;
                console.log('✅ Preserved annotations_without_bdi_edits during profile recreation');
            }

            // Store using participantId as custom user ID (document ID)
            await this.db.collection('users').doc(participantId).set(userDoc);

            // Set custom user ID for this session
            this.setCustomUserId(participantId);

            console.log('🔄 Recreated Prolific user profile:', username, `(custom ID: ${participantId})`);
            return {
                success: true,
                uid: participantId, // Return custom ID (participantId) instead of Auth UID
                authUid: authUser.uid, // Also return Auth UID for reference
                username: username,
                assignedDialogues: assignedDialogues,
                recoveredDialogues: recoveredDialoguesFromAnnotations.length > 0,
                message: 'Profile recreated successfully'
            };
        } catch (error) {
            console.error('❌ Error recreating Prolific profile:', error);

            if (error.code === 'auth/wrong-password') {
                return {
                    success: false,
                    message: 'Incorrect password. Cannot recreate profile without correct password.'
                };
            } else if (error.code === 'auth/user-not-found') {
                return {
                    success: false,
                    message: 'Auth account not found. Cannot recreate profile.'
                };
            }

            return { success: false, message: error.message || 'Failed to recreate profile' };
        }
    }

    /**
     * Check if Prolific user has completed all assigned annotations
     * @param {string} uid - User UID
     * @returns {Promise<boolean>}
     */
    async hasCompletedAllAnnotations(customUserId) {
        try {
            // Get user document by custom ID (Prolific ID or username)
            const userDoc = await this.db.collection('users').doc(customUserId).get();
            if (!userDoc.exists) {
                return false;
            }

            const userData = userDoc.data();
            const assignedDialogues = userData.assignedDialogues || [];

            if (assignedDialogues.length === 0) {
                return false; // No dialogues assigned
            }

            // Get all annotations for this user
            const annotationsSnapshot = await this.db.collection('users')
                .doc(customUserId)
                .collection('annotations')
                .get();

            const annotatedIds = new Set();
            annotationsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.dialogueId) {
                    annotatedIds.add(data.dialogueId);
                }
            });

            // Check if all assigned dialogues are annotated
            const allCompleted = assignedDialogues.every(id => annotatedIds.has(id));

            return allCompleted;
        } catch (error) {
            console.error('Error checking completion status:', error);
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
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                console.warn('Custom user ID not set, cannot save feedback');
                return false;
            }

            await this.db.collection('users').doc(customUserId).update({
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
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                return false;
            }

            const userDoc = await this.db.collection('users').doc(customUserId).get();
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

    /**
     * Log instruction read attempt (for first-time users only)
     * Only records once - does not update if already recorded
     * @param {number} scrollPercentage - Percentage of instructions read (0-100)
     * @returns {Promise<boolean>}
     */
    async logInstructionReadAttempt(scrollPercentage, readingTimeSeconds = 0) {
        console.log('logInstructionReadAttempt called with:', { scrollPercentage, readingTimeSeconds });

        if (!this.currentUser || !this.currentUser.uid) {
            console.warn('User not authenticated, cannot log instruction read attempt');
            console.warn('currentUser:', this.currentUser);
            return false;
        }

        if (!this.db) {
            console.error('Firestore not initialized');
            return false;
        }

        try {
            // Get custom user ID (Prolific ID or username)
            // Fall back to Auth UID for backward compatibility with old system
            const customUserId = this.getCustomUserId() || this.currentUser.uid;
            console.log('Using custom user ID:', customUserId);

            const userDocRef = this.db.collection('users').doc(customUserId);
            const userDoc = await userDocRef.get();
            console.log('User document exists:', userDoc.exists);

            // Check if instruction read data already exists - if so, don't update
            if (userDoc.exists) {
                const data = userDoc.data();
                if (data.first_instruction_read) {
                    console.log('Instruction read already recorded in Firebase, skipping update');
                    console.log('Existing data:', data.first_instruction_read);
                    return true; // Already recorded, don't update
                }
            }

            // Ensure user document exists before updating
            if (!userDoc.exists) {
                console.log('User document does not exist, creating it...');
                // Get username from current user data or use email
                const username = await this.getUsername() || this.currentUser.email?.split('@')[0] || 'unknown';
                const email = this.currentUser.email || `${username}@annotation.local`;
                await this.ensureUserDocumentExists(customUserId, username, email);
            }

            // Store the first instruction read attempt (only once)
            // Use set with merge instead of update to avoid errors if document doesn't exist
            console.log('Attempting to save first_instruction_read to Firebase...');
            await userDocRef.set({
                first_instruction_read: {
                    scrollPercentage: scrollPercentage,
                    readingTimeSeconds: readingTimeSeconds,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    reachedBottom: scrollPercentage >= 99.5 // Consider 99.5%+ as reached bottom
                },
                lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); // Use merge to avoid overwriting other fields

            console.log(`✅ Successfully saved first instruction read: ${scrollPercentage.toFixed(1)}%, ${readingTimeSeconds}s to Firebase`);
            return true;
        } catch (error) {
            console.error('❌ Error logging instruction read attempt:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                uid: this.currentUser?.uid,
                customUserId: this.getCustomUserId(),
                scrollPercentage: scrollPercentage
            });
            return false;
        }
    }

    /**
     * Update user summary statistics for annotations without BDI edits
     * @param {boolean} hasNoBdiEdits - Whether the annotation has no BDI edits
     * @returns {Promise<boolean>}
     */
    async updateUserSummaryStats(hasNoBdiEdits) {
        if (!this.currentUser || !this.currentUser.uid) {
            console.warn('User not authenticated, cannot update summary stats');
            return false;
        }

        if (!this.db) {
            console.error('Firestore not initialized');
            return false;
        }

        try {
            // Get custom user ID (Prolific ID or username)
            const customUserId = this.getCustomUserId();
            if (!customUserId) {
                console.warn('Custom user ID not set, cannot update user summary stats');
                return false;
            }

            const userDocRef = this.db.collection('users').doc(customUserId);

            if (hasNoBdiEdits) {
                // Increment the counter for annotations without BDI edits
                await userDocRef.update({
                    annotations_without_bdi_edits: firebase.firestore.FieldValue.increment(1),
                    lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('✅ Updated user summary: incremented annotations_without_bdi_edits');
            } else {
                // Just update the timestamp (BDI was modified, so don't increment counter)
                await userDocRef.update({
                    lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            return true;
        } catch (error) {
            console.error('Error updating user summary stats:', error);
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

