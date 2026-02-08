// ========== FIREBASE CONFIGURATION ==========
// Firebase configuration for cloud storage
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDMdDN31UcSnoUHM-u9O4c0rXqmVBxWsh0",
    authDomain: "esc-tom.firebaseapp.com",
    projectId: "esc-tom",
    storageBucket: "esc-tom.firebasestorage.app",
    messagingSenderId: "968824960752",
    appId: "1:968824960752:web:ab6bb791e86ed2bdda3435",
    measurementId: "G-W75L4XKYZ6"
};

let firebaseStorage = null;
let firebaseReady = false;

async function initFirebaseStorage() {
    if (firebaseReady) return true;

    firebaseStorage = window.firebaseStorage;
    const success = await firebaseStorage.init(FIREBASE_CONFIG);

    if (success) {
        firebaseReady = true;
        console.log('Firebase ready');
    } else {
        console.error('❌ Firebase initialization failed');
    }

    return success;
}
// ========== END FIREBASE CONFIGURATION ==========


// Global state
let currentUsername = null; // Current logged-in user
let allDialogues = []; // All available dialogues from dataset
let assignedDialogues = []; // Dialogue IDs assigned to current user
let currentDialogue = null;
let currentTurnIndex = 0;
let cognitiveDimensions = []; // Now stores hierarchical structure
let selectedCoarseAppraisals = []; // Phase 1: Selected coarse-grained categories
let selectedAppraisals = []; // Phase 2: Final 5 selected fine-grained appraisals
let originalAppraisals = []; // Store original ground truth appraisals for comparison
let minContextTurnIndex = null; // Tracks which turn provides minimum necessary context
let modifiedUtterances = {}; // Track modified utterances { turnIndex: { plain, marked } }
let annotatedIdList = []; // List of already annotated dialogue IDs from annotated_id_list.json
let appraisalDragCount = 0; // Track number of drag/reorder operations for appraisals
let appraisalPhase = 1; // Current phase: 1 for coarse selection, 2 for fine selection
let dialogueRatings = { // Track dialogue quality ratings
    realism: 0,
    persona: 0,
    bdi: 0,
    appraisals: 0
};
const MAX_APPRAISALS = 5;
const DIALOGUES_PER_USER = 5; // Number of dialogues to assign per user

// Prolific integration state
let isProlific = false; // Whether current session is from Prolific
let prolificParams = null; // Prolific URL parameters
let studyStartTime = null; // When study started (for timing)

// Sona integration state
let isSona = false; // Whether current session is from Sona
let sonaParams = null; // Sona URL parameters

// DOM Elements
const dialogueSelect = document.getElementById('dialogue-select');
const dialogueContainer = document.getElementById('dialogue-container');
const progressText = document.getElementById('progress-text');
const saveBtn = document.getElementById('save-btn');
// Clear button removed - clearAnnotations() function kept for internal use

// Annotation inputs
const beliefInput = document.getElementById('belief');
const desireInput = document.getElementById('desire');
const intentionInput = document.getElementById('intention');
const appraisalOptionsContainer = document.getElementById('appraisal-options');
const selectedAppraisalsContainer = document.getElementById('selected-appraisals');
const loadDemoBtn = document.getElementById('load-demo-btn');

// LocalStorage keys
const STORAGE_KEYS = {
    CURRENT_USER: 'annotation_username',
    INSTRUCTIONS_SEEN: 'instructions_seen',
    TOUR_SEEN: 'annotation_tour_seen'
};

// Initialize
async function init() {
    // Load dialogues first (needed for registration sampling)
    await loadDialogues();
    await loadCognitiveDimensions();
    await loadAnnotatedIdList();

    // Check if this is a Prolific session
    isProlific = isProlificSession();
    if (isProlific) {
        prolificParams = getProlificParams();
        studyStartTime = Date.now();
        logProlificInfo('Prolific session detected', prolificParams);

        // Handle Prolific participant
        await handleProlificSession();
        return;
    }

    // Check if this is a Sona session
    isSona = isSonaSession();
    if (isSona) {
        sonaParams = getSonaParams();
        studyStartTime = Date.now();
        logSonaInfo('Sona session detected', sonaParams);

        // Handle Sona participant
        await handleSonaSession();
        return;
    }

    // Regular session flow
    setupLoginListeners();
    setupInstructionListeners(); // Setup instruction modal listeners

    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    // Wait for persisted Firebase auth session (if any)
    const authUser = await firebaseStorage.waitForAuthReady();
    if (authUser) {
        // Try to find user by username first (for regular users) or by Auth UID (fallback)
        // We need to query by username since we don't know the custom ID yet
        let profile = null;
        try {
            // Try to get profile by querying username field
            const usernameSnapshot = await firebaseStorage.db.collection('users')
                .where('username', '==', authUser.email?.split('@')[0] || '')
                .limit(1)
                .get();

            if (!usernameSnapshot.empty) {
                const doc = usernameSnapshot.docs[0];
                profile = { uid: doc.id, ...doc.data() };
                firebaseStorage.setCustomUserId(doc.id); // Set custom ID
            } else {
                // Fallback: try by Auth UID (for backward compatibility)
                profile = await firebaseStorage.getUserProfile(authUser.uid);
                if (profile) {
                    // If found by Auth UID, the document ID is the custom ID
                    firebaseStorage.setCustomUserId(profile.uid);
                }
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }

        if (profile && profile.username) {
            currentUsername = profile.username;
            hideLoginModal();
            await initializeApp();
            return;
        }

        // If auth exists but no profile, force logout and show login
        if (currentUsername) {
            localStorage.removeItem(STORAGE_KEYS.TOUR_SEEN);
            await firebaseStorage.logout();
        }
    }

    // No authenticated user; show login modal
    showLoginModal();
}

// Handle Prolific participant session
async function handleProlificSession() {
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        // Check if this participant already registered
        let prolificUser = await firebaseStorage.getProlificUserByParticipantId(prolificParams.participantId);

        // If Firestore profile is missing but Auth account exists, try to recreate it
        if (!prolificUser) {
            logProlificInfo('Firestore profile not found, checking if Auth account exists');

            const authCheck = await firebaseStorage.checkProlificAuthAccount(prolificParams.participantId);

            if (authCheck.exists) {
                logProlificInfo('Auth account exists but Firestore profile missing, attempting to recreate');

                // Try to recover password from sessionStorage first
                let password = sessionStorage.getItem('prolific_temp_password');

                // If not in sessionStorage, generate deterministic password
                // This works because Prolific passwords are now deterministic based on participantId
                if (!password) {
                    password = generateProlificPassword(prolificParams.participantId);
                    logProlificInfo('Using deterministic password for recovery', { participantId: prolificParams.participantId });
                }

                // Try to recreate the profile
                const recreateResult = await firebaseStorage.recreateProlificProfile(
                    prolificParams.participantId,
                    password,
                    prolificParams
                );

                if (recreateResult.success) {
                    logProlificInfo('Successfully recreated Prolific profile');

                    // Use the recovered assigned dialogues - NEVER sample new ones when resuming
                    // If no dialogues were recovered, this is an error case (shouldn't happen for existing users)
                    if (recreateResult.assignedDialogues.length === 0) {
                        logProlificInfo('⚠️ WARNING: No assigned dialogues recovered - this should not happen for existing users');
                        console.error('Profile recreation returned empty assigned dialogues - user may have lost their assignment');
                        // Don't sample new dialogues - this would change their assignment
                        // Instead, show error or try to recover from prolific metadata
                        showProlificError('Unable to recover your assigned dialogues. Please contact the researcher.');
                        return;
                    } else {
                        assignedDialogues = recreateResult.assignedDialogues;
                        logProlificInfo(`Using recovered assigned dialogues: ${assignedDialogues.length} dialogues`);
                    }

                    currentUsername = recreateResult.username;

                    // Store password for future sessions (recreateResult.uid is now participantId - custom ID)
                    await firebaseStorage.db.collection('users').doc(recreateResult.uid).update({
                        'prolific.password': password
                    });

                    // Set custom user ID (Prolific participant ID is the custom ID)
                    firebaseStorage.setCustomUserId(recreateResult.uid);

                    // Check if they've completed all annotations (now that user is authenticated)
                    const isCompletedEarly = await firebaseStorage.hasCompletedAllAnnotations(recreateResult.uid);
                    if (isCompletedEarly) {
                        logProlificInfo('Participant has already completed all annotations (checked after early profile recreation)');
                        hideLoginModal();
                        showProlificCompletionMessage();
                        return;
                    }

                    hideLoginModal();
                    showProlificResumeMessage();
                    await initializeApp();
                    return;
                } else {
                    // Recreation failed - might be wrong password
                    // The Auth account exists but we don't have the correct password
                    // We can't proceed automatically - the password was lost when Firestore was deleted
                    logProlificInfo('Profile recreation failed - password mismatch', {
                        reason: recreateResult.message
                    });

                    // Try registration anyway - it will fail with "email already exists"
                    // But we'll handle that case below
                }
            }
        }

        if (prolificUser) {
            logProlificInfo('Participant already registered, checking completion status');

            // If this participant was previously REJECTED, immediately show
            // the rejection message again and send them back to Prolific.
            const prolificStatus = prolificUser.prolific?.status;
            if (prolificStatus === 'rejected') {
                logProlificInfo('Participant previously rejected - showing rejection message and redirecting');

                // Show rejection screen (no detailed metrics available here, so pass empty object)
                showProlificRejectionScreen({
                    scrollPercentage: prolificUser.first_instruction_read?.scrollPercentage ?? 0,
                    readingTimeSeconds: prolificUser.first_instruction_read?.readingTimeSeconds ?? 0
                });

                // Redirect back to Prolific after short delay
                if (PROLIFIC_CONFIG.redirectOnComplete) {
                    setTimeout(() => {
                        const redirectURL = getProlificRejectionURL();
                        logProlificInfo('Redirecting to Prolific for previously rejected participant', { url: redirectURL });
                        window.location.href = redirectURL;
                    }, 3000); // 3s delay for consistency with other redirects
                }
                return;
            }

            // Validate profile is complete
            if (!prolificUser.username || !prolificUser.uid) {
                logProlificInfo('Profile incomplete, will attempt recreation below');
                prolificUser = null; // Will fall through to recreation logic below
            }

            // Only proceed if profile is complete
            if (prolificUser && prolificUser.username && prolificUser.uid) {
                // Profile is complete, proceed with login first (need auth to check completion status)
                logProlificInfo('Participant profile found, attempting auto-login to resume session');

                const username = prolificUser.username;
                let password = prolificUser.prolific?.password;

                // If password is missing, try to recover using deterministic password
                if (!password) {
                    logProlificInfo('Password not found in Firestore, attempting recovery with deterministic password');
                    password = generateProlificPassword(prolificParams.participantId);
                }

                // Try to login with stored or recovered password
                let loginResult = await firebaseStorage.loginUser(username, password);

                // If login fails, try with deterministic password (in case stored password was wrong)
                if (!loginResult.success && prolificUser.prolific?.password) {
                    logProlificInfo('Stored password failed, trying deterministic password recovery');
                    const recoveredPassword = generateProlificPassword(prolificParams.participantId);
                    if (recoveredPassword !== password) {
                        loginResult = await firebaseStorage.loginUser(username, recoveredPassword);
                        if (loginResult.success) {
                            password = recoveredPassword;
                            // Update Firestore with recovered password (prolificUser.uid is now participantId - custom ID)
                            try {
                                await firebaseStorage.db.collection('users').doc(prolificUser.uid).update({
                                    'prolific.password': recoveredPassword
                                });
                                logProlificInfo('Updated Firestore with recovered password');
                            } catch (err) {
                                console.warn('Failed to update password in Firestore:', err);
                            }
                        }
                    }
                }

                if (!loginResult.success) {
                    console.error('Auto-login failed after recovery attempts:', loginResult.message);
                    // Last resort: try to recreate the profile
                    logProlificInfo('Login failed, attempting to recreate profile');
                    const recreateResult = await firebaseStorage.recreateProlificProfile(
                        prolificParams.participantId,
                        password,
                        prolificParams
                    );

                    if (recreateResult.success) {
                        logProlificInfo('Successfully recreated profile after login failure');

                        // Use the recovered assigned dialogues - NEVER sample new ones when resuming
                        if (recreateResult.assignedDialogues.length === 0) {
                            logProlificInfo('⚠️ WARNING: No assigned dialogues recovered after login failure');
                            console.error('Profile recreation returned empty assigned dialogues');
                            showProlificError('Unable to recover your assigned dialogues. Please contact the researcher.');
                            return;
                        } else {
                            assignedDialogues = recreateResult.assignedDialogues;
                            logProlificInfo(`Using recovered assigned dialogues: ${assignedDialogues.length} dialogues`);

                            // Update password in Firestore (recreateResult.uid is now participantId - custom ID)
                            try {
                                await firebaseStorage.db.collection('users').doc(recreateResult.uid).update({
                                    'prolific.password': password
                                });
                            } catch (err) {
                                console.warn('Failed to update password:', err);
                            }
                        }

                        currentUsername = recreateResult.username;

                        // Set custom user ID (Prolific participant ID is the custom ID)
                        firebaseStorage.setCustomUserId(recreateResult.uid); // uid is now the participantId (custom ID)

                        // Check if they've completed all annotations (now that user is authenticated)
                        const isCompletedAfterRecreate = await firebaseStorage.hasCompletedAllAnnotations(recreateResult.uid);
                        if (isCompletedAfterRecreate) {
                            logProlificInfo('Participant has already completed all annotations (checked after profile recreation)');
                            hideLoginModal();
                            showProlificCompletionMessage();
                            return;
                        }

                        hideLoginModal();
                        showProlificResumeMessage();
                        await initializeApp();
                        return;
                    } else {
                        showProlificError('Unable to resume session. Please contact the researcher.');
                        return;
                    }
                }

                // Now that user is authenticated, check if they've completed all annotations
                logProlificInfo('User authenticated, checking completion status');
                const isCompleted = await firebaseStorage.hasCompletedAllAnnotations(prolificUser.uid);

                if (isCompleted) {
                    // Already completed - show completion message
                    logProlificInfo('Participant has already completed all annotations');
                    hideLoginModal();
                    showProlificCompletionMessage();
                    return;
                }

                logProlificInfo('Participant has not completed all annotations, proceeding to resume session');

                // Update session ID if it's different (new Prolific session)
                // prolificUser.uid is now the participantId (custom ID)
                if (prolificParams.sessionId && prolificUser.prolific?.sessionId !== prolificParams.sessionId) {
                    try {
                        await firebaseStorage.db.collection('users').doc(prolificUser.uid).update({
                            'prolific.sessionId': prolificParams.sessionId,
                            'prolific.lastResumedAt': firebase.firestore.FieldValue.serverTimestamp()
                        });
                        logProlificInfo('Updated session ID for resumed participant');
                    } catch (error) {
                        console.warn('Failed to update session ID:', error);
                    }
                }

                // Get assigned dialogues - ALWAYS use what's stored, NEVER modify during resume
                // The original 5 dialogues assigned at registration must be preserved
                assignedDialogues = prolificUser.assignedDialogues || [];
                if (assignedDialogues.length === 0) {
                    console.warn('⚠️ WARNING: User profile has no assigned dialogues - this should not happen');
                } else {
                    logProlificInfo(`Resuming with ${assignedDialogues.length} originally assigned dialogues`);
                }
                currentUsername = username;

                // Set custom user ID (Prolific participant ID is the custom ID)
                firebaseStorage.setCustomUserId(prolificUser.uid); // uid is now the participantId (custom ID)

                // Hide login modal and resume annotation
                hideLoginModal();
                showProlificResumeMessage();
                await initializeApp();
                return;
            } // End of if (prolificUser && prolificUser.username && prolificUser.uid)
        } // End of if (prolificUser) block

        // Not registered - proceed with registration
        logProlificInfo('New Prolific participant, auto-registering', { participantId: prolificParams.participantId });

        // Auto-register Prolific participant
        const username = `prolific_${prolificParams.participantId}`;
        // Use deterministic password based on participantId for recovery capability
        const password = generateProlificPassword(prolificParams.participantId);

        // Store password temporarily for this session
        sessionStorage.setItem('prolific_temp_password', password);

        logProlificInfo('Auto-registering Prolific participant', { username });

        // Sample dialogues
        const sampledDialogues = await sampleDialogues(DIALOGUES_PER_USER);

        // Register user with Prolific metadata
        let result = await firebaseStorage.registerUser(
            username,
            password,
            sampledDialogues,
            prolificParams
        );

        // If registration fails because email already exists, try to recreate profile
        if (!result.success && result.message && result.message.includes('already exists')) {
            logProlificInfo('Auth account exists but Firestore profile missing, recreating profile');

            // The password we generated should work (it's deterministic)
            // Try to recreate with this password
            const recreateResult = await firebaseStorage.recreateProlificProfile(
                prolificParams.participantId,
                password, // This is the deterministic password we just generated
                prolificParams
            );

            if (recreateResult.success) {
                logProlificInfo('Successfully recreated profile after registration conflict');

                // Prioritize recovered assigned dialogues over newly sampled ones
                // This ensures we preserve the original assignment if it exists
                if (recreateResult.assignedDialogues.length > 0) {
                    // Use recovered dialogues (original assignment)
                    assignedDialogues = recreateResult.assignedDialogues;
                    logProlificInfo(`Using recovered assigned dialogues: ${assignedDialogues.length} dialogues`);

                    // Update password in Firestore (recreateResult.uid is now participantId - custom ID)
                    try {
                        await firebaseStorage.db.collection('users').doc(recreateResult.uid).update({
                            'prolific.password': password
                        });
                    } catch (err) {
                        console.warn('Failed to update password:', err);
                    }
                } else {
                    // Only use newly sampled dialogues if this is truly a new profile
                    // (no existing annotations or original assignment found)
                    logProlificInfo('No existing assignment found, using newly sampled dialogues');
                    await firebaseStorage.db.collection('users').doc(recreateResult.uid).update({
                        assignedDialogues: sampledDialogues,
                        'prolific.password': password,
                        'prolific.originalAssignedDialogues': sampledDialogues // Store as original
                    });
                    assignedDialogues = sampledDialogues;
                }

                currentUsername = recreateResult.username;

                // Set custom user ID (Prolific participant ID is the custom ID)
                firebaseStorage.setCustomUserId(recreateResult.uid); // uid is now the participantId (custom ID)

                hideLoginModal();
                showProlificResumeMessage();
                await initializeApp();
                return;
            } else {
                // Recreation failed - Auth account exists with different password
                // We can't automatically recover without the original password
                console.error('Profile recreation failed - Auth account password mismatch');
                logProlificInfo('Cannot automatically recreate: Auth account exists but password is unknown');

                // Show helpful error message
                showProlificError(
                    'Your account exists but the profile was deleted. ' +
                    'Automatic recovery failed because the password is unknown. ' +
                    'Please contact the researcher to restore your account, or the system will attempt to create a new profile.'
                );

                // Don't return - let it try to show the error, but we could also try to continue
                // For now, return to prevent further errors
                return;
            }
        }

        if (!result.success) {
            console.error('Prolific registration failed:', result.message);
            showProlificError('Registration failed. Please contact the researcher.');
            return;
        }

        currentUsername = username;
        assignedDialogues = result.assignedDialogues || sampledDialogues;

        // Set custom user ID (Prolific participant ID is the custom ID)
        firebaseStorage.setCustomUserId(result.uid); // uid is now the participantId (custom ID)

        // Hide login modal and start annotation
        hideLoginModal();
        showProlificWelcome();
        await initializeApp();

    } catch (error) {
        console.error('Error handling Prolific session:', error);
        showProlificError('An error occurred. Please contact the researcher.');
    }
}

// Handle Sona participant session
async function handleSonaSession() {
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        // For testing: use fake user if participant_id is 'test_sona_user'
        if (sonaParams.participantId === 'test_sona_user') {
            logSonaInfo('Using test Sona user for local testing');
            // Use a test username based on participant ID
            const testUsername = `sona_${sonaParams.participantId}`;
            const testPassword = generateSonaPassword(sonaParams.participantId);

            // Try to login first
            let loginResult = await firebaseStorage.loginUser(testUsername, testPassword);

            if (!loginResult.success) {
                // User doesn't exist, register them
                logSonaInfo('Test user not found, registering new test user');
                const registerResult = await firebaseStorage.registerUser(testUsername, testPassword);

                if (!registerResult.success) {
                    logSonaInfo('Registration failed', { error: registerResult.message });
                    showSonaError('Failed to register test user. Please check console for details.');
                    return;
                }

                // Sample dialogues for the test user
                assignedDialogues = sampleDialogues(10, []);

                // Create user profile with Sona metadata
                await firebaseStorage.db.collection('users').doc(registerResult.uid).set({
                    username: testUsername,
                    uid: registerResult.uid,
                    assignedDialogues: assignedDialogues,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    sona: {
                        participantId: sonaParams.participantId,
                        surveyId: sonaParams.surveyId,
                        sessionId: sonaParams.sessionId,
                        surveyCode: sonaParams.surveyCode,
                        password: testPassword,
                        registeredAt: firebase.firestore.FieldValue.serverTimestamp()
                    }
                });

                firebaseStorage.setCustomUserId(registerResult.uid);
                currentUsername = testUsername;

                hideLoginModal();
                showSonaWelcome();
                await initializeApp();
                return;
            } else {
                // User exists, get their profile
                const userProfile = await firebaseStorage.getUserProfile(loginResult.user.uid);
                if (userProfile) {
                    assignedDialogues = userProfile.assignedDialogues || [];
                    currentUsername = userProfile.username;
                    firebaseStorage.setCustomUserId(loginResult.user.uid);

                    // Check if completed
                    const isCompleted = await firebaseStorage.hasCompletedAllAnnotations(loginResult.user.uid);
                    if (isCompleted) {
                        hideLoginModal();
                        showSonaCompletionMessage();
                        return;
                    }

                    hideLoginModal();
                    showSonaResumeMessage();
                    await initializeApp();
                    return;
                }
            }
        }

        // Regular Sona flow: Check if this participant already registered
        // Query by sona.participantId field
        let sonaUser = null;
        try {
            const userQuery = await firebaseStorage.db.collection('users')
                .where('sona.participantId', '==', sonaParams.participantId)
                .limit(1)
                .get();

            if (!userQuery.empty) {
                const doc = userQuery.docs[0];
                sonaUser = { uid: doc.id, ...doc.data() };
            }
        } catch (error) {
            logSonaInfo('Error querying for Sona user', error);
        }

        if (sonaUser) {
            logSonaInfo('Participant already registered, checking completion status');

            // Check if previously rejected
            const sonaStatus = sonaUser.sona?.status;
            if (sonaStatus === 'rejected') {
                logSonaInfo('Participant previously rejected - showing rejection message');
                showSonaRejectionScreen({
                    scrollPercentage: sonaUser.first_instruction_read?.scrollPercentage ?? 0,
                    readingTimeSeconds: sonaUser.first_instruction_read?.readingTimeSeconds ?? 0
                });

                if (SONA_CONFIG.redirectOnComplete) {
                    setTimeout(() => {
                        const redirectURL = getSonaRejectionURL();
                        logSonaInfo('Redirecting to Sona for previously rejected participant', { url: redirectURL });
                        window.location.href = redirectURL;
                    }, 3000);
                }
                return;
            }

            // Try to login
            const username = sonaUser.username;
            let password = sonaUser.sona?.password;

            if (!password) {
                password = generateSonaPassword(sonaParams.participantId);
            }

            const loginResult = await firebaseStorage.loginUser(username, password);

            if (!loginResult.success) {
                // Try with deterministic password
                const recoveredPassword = generateSonaPassword(sonaParams.participantId);
                if (recoveredPassword !== password) {
                    const retryLogin = await firebaseStorage.loginUser(username, recoveredPassword);
                    if (retryLogin.success) {
                        password = recoveredPassword;
                        // Update password in Firestore
                        try {
                            await firebaseStorage.db.collection('users').doc(sonaUser.uid).update({
                                'sona.password': recoveredPassword
                            });
                        } catch (err) {
                            console.warn('Failed to update password:', err);
                        }
                    }
                }
            }

            if (loginResult.success || (password && await firebaseStorage.loginUser(username, password).then(r => r.success))) {
                // Check completion status
                const isCompleted = await firebaseStorage.hasCompletedAllAnnotations(sonaUser.uid);
                if (isCompleted) {
                    hideLoginModal();
                    showSonaCompletionMessage();
                    return;
                }

                assignedDialogues = sonaUser.assignedDialogues || [];
                currentUsername = username;
                firebaseStorage.setCustomUserId(sonaUser.uid);

                hideLoginModal();
                showSonaResumeMessage();
                await initializeApp();
                return;
            }
        }

        // New participant - register them
        logSonaInfo('New Sona participant, registering');

        const username = `sona_${sonaParams.participantId}`;
        const password = generateSonaPassword(sonaParams.participantId);

        // Store password temporarily in sessionStorage (similar to Prolific)
        sessionStorage.setItem('sona_temp_password', password);

        const registerResult = await firebaseStorage.registerUser(username, password);

        if (!registerResult.success) {
            logSonaInfo('Registration failed', { error: registerResult.message });
            showSonaError(`Registration failed: ${registerResult.message}`);
            return;
        }

        // Sample dialogues for new participant
        assignedDialogues = sampleDialogues(10, []);

        // Create user profile with Sona metadata
        await firebaseStorage.db.collection('users').doc(registerResult.uid).set({
            username: username,
            uid: registerResult.uid,
            assignedDialogues: assignedDialogues,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            sona: {
                participantId: sonaParams.participantId,
                surveyId: sonaParams.surveyId,
                sessionId: sonaParams.sessionId,
                surveyCode: sonaParams.surveyCode,
                password: password,
                status: 'active',
                registeredAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        });

        firebaseStorage.setCustomUserId(registerResult.uid);
        currentUsername = username;

        hideLoginModal();
        showSonaWelcome();
        await initializeApp();

    } catch (error) {
        console.error('Error handling Sona session:', error);
        showSonaError('An error occurred. Please contact the researcher.');
    }
}

// Helper to sync user progress (instructions read, tour seen) from Firebase to LocalStorage
async function syncUserProgress() {
    if (!firebaseStorage) return;

    try {
        const customUserId = firebaseStorage.getCustomUserId() || firebaseStorage.currentUser?.uid;
        if (customUserId) {
            const userDoc = await firebaseStorage.db.collection('users').doc(customUserId).get();

            if (userDoc.exists) {
                // Sync Instructions Seen
                if (userDoc.data().first_instruction_read) {
                    console.log('Syncing instructions read status from Firebase');
                    localStorage.setItem(STORAGE_KEYS.INSTRUCTIONS_SEEN, 'true');
                } else {
                    // Not seen in Firebase, clear local to be safe (unless we want local to win?)
                    // Safest to clear if we treat Firebase as source of truth for "first time"
                    console.log('Instructions not marked read in Firebase');
                }

                // Sync Tour Seen - STRICT MODE
                if (userDoc.data().tour_seen) {
                    console.log('Syncing tour completion from Firebase: TRUE');
                    localStorage.setItem(STORAGE_KEYS.TOUR_SEEN, '1');
                } else {
                    // Critical for multi-user device usage:
                    // If Firebase says FALSE (or undefined), trust it and clear local state.
                    console.log('Syncing tour completion from Firebase: FALSE (clearing local)');
                    localStorage.removeItem(STORAGE_KEYS.TOUR_SEEN);
                }
            }
        }
    } catch (error) {
        console.error('Error syncing user progress:', error);
    }
}

// Initialize the main app after login
async function initializeApp() {
    updateUserBadge();

    // Sync user progress (tour & instructions) BEFORE doing anything else UI-related
    await syncUserProgress();

    // Show instructions immediately after sync found the user state
    showInstructionModal();

    // Load dialogues if not already loaded (e.g., during direct login from saved session)
    if (allDialogues.length === 0) {
        await loadDialogues();
        await loadCognitiveDimensions();
    } else {
        // Dialogues already loaded, just load assigned dialogues for this user
        await loadAssignedDialogues();
        populateDialogueSelector();
    }

    setupEventListeners();
    setupTour();
    setupNotificationListeners();
    setupInstructionListeners(); // Setup instruction modal listeners after login

    // Agreement Mode button listener
    const agreementBtn = document.getElementById('load-agreement-btn');
    if (agreementBtn) {
        const allowedUsers = ["hainiu"];
        if (allowedUsers.includes(currentUsername)) {
            agreementBtn.disabled = false;
            agreementBtn.addEventListener('click', toggleAgreementMode);
            agreementBtn.title = "Switch to Agreement Annotation Mode";
        } else {
            agreementBtn.disabled = true;
            agreementBtn.style.opacity = '0.5';
            agreementBtn.style.cursor = 'not-allowed';
            agreementBtn.title = "Access restricted to authorized users";
            // Remove listener just in case it was added elsewhere (though it shouldn't be)
            agreementBtn.removeEventListener('click', toggleAgreementMode);
        }
    }

    await checkAnnotationProgress();

    // Automatically load first unannotated dialogue or first dialogue
    if (allDialogues.length > 0) {
        const firstUnannotated = await findFirstUnannotatedDialogue();
        const indexToLoad = firstUnannotated !== -1 ? firstUnannotated : 0;
        dialogueSelect.value = indexToLoad;
        await handleDialogueChange();
    }
}

// -----------------------------
// Guided Tour (lightweight)
// -----------------------------
let tourState = {
    stepIndex: 0,
    steps: [],
    overlay: null,
    highlight: null,
    tooltip: null,
    activeTarget: null,
    virtualCursor: null,
    audioFinished: false,
    animationFinished: true
};

function setupTour() {
    // Define steps
    tourState.steps = [
        {
            selector: '#dialogue-select',
            title: 'Dialogue Selection',
            body: 'When finishing an annotation, the next dialogue is automaically loaded for you. Use this dropdown if you wish to check your previous annotations.',
            placement: 'right',
            audio: 'assets/audios/demo-1.wav'
        },
        {
            selector: '.header-actions',
            title: 'User Info & Instructions',
            body: 'Your username is displayed here. You can also click the Instructions button to review the annotation guidelines at any time.',
            placement: 'bottom',
            audio: 'assets/audios/demo-2.wav'
        },
        {
            selector: '.progress-section',
            title: 'Progress Bar',
            body: 'This progress bar shows your annotation completion status across all assigned dialogues.',
            placement: 'bottom',
            audio: 'assets/audios/demo-3.wav'
        },
        {
            selector: '#persona-section',
            title: 'Patient profile',
            body: 'Review the patient\'s profile (name, occupation, Big Five traits) to keep your annotations consistent with their persona.',
            placement: 'right',
            audio: 'assets/audios/demo-4.wav'
        },
        {
            selector: '#dialogue-container',
            title: 'Mark minimum context',
            body: 'Read from the start and click the earliest turn pair where you have enough information to annotate.<br><br><b>BDI</b> <i>(noun)</i>: The patient\'s mental state (Belief, Desire, Intention) <b>before</b> the bothering event occurred.<br><br><b>Cognitive Appraisal</b> <i>(noun)</i>: How the patient subjectively perceives their situation <b>after</b> the event.',
            placement: 'right',
            audio: 'assets/audios/demo-5.wav'
        },
        {
            selector: '#bdi-section',
            title: 'Revise BDI',
            body: '<b>BDI</b> <i>(noun)</i>: The patient\'s mental state (Belief, Desire, Intention) <b>before</b> the bothering event occurred.<br><br>Revise these fields to reflect the patient’s PRE-event mindset.',
            placement: 'bottom',
            scrollOffset: -350,
            audio: 'assets/audios/demo-6.wav'
        },
        {
            selector: '#appraisals-section',
            title: 'Step 2.1: Select Appraisal Descriptions',
            body: '<b>Cognitive Appraisal</b> <i>(noun)</i>: How the patient subjectively perceives their situation <b>after</b> the event.<br><br>Select the descriptions that best explain the emergence of the patient\'s negative emotions.',
            placement: 'top',
            audio: 'assets/audios/demo-7-1.wav'
        },
        {
            selector: '#appraisals-section',
            title: 'Step 2.2: Select Appraisal Dimensions',
            body: '<b>Cognitive Appraisal</b> <i>(noun)</i>: How the patient subjectively perceives their situation <b>after</b> the event.<br><br>Select the appraisal dimensions under each description.',
            placement: 'top',
            audio: 'assets/audios/demo-7-2.wav'
        },
        {
            selector: '#selected-appraisals',
            title: 'Step 2.3: Rank & Explain',
            body: 'Drag to rank the dimensions by importance (1 = most important).<br><br>Then, for each selected appraisal, provide a brief rationale explaining why you chose it.',
            placement: 'top',
            audio: 'assets/audios/demo-7-3-new.wav'
        },
        {
            selector: '#dialogue-rating-section',
            title: 'Rate quality',
            body: 'Provide 1-5 star ratings for realism, persona, BDI, and appraisals.',
            placement: 'top',
            scrollOffset: 200,
            audio: 'assets/audios/demo-8.wav'
        },
        {
            selector: '#save-btn',
            title: 'Save your work',
            body: 'Click Save. You’ll see a confirmation dialog—review the summary and confirm to submit.',
            placement: 'top',
            audio: 'assets/audios/demo-9.wav'
        },
        {
            selector: 'header',
            title: 'Thank You!',
            body: 'Thank you for going through the demo and taking part in the study.',
            placement: 'center',
            audio: 'assets/audios/demo-end.wav'
        }
    ];
}

function startTour(force = false) {
    if (!force && localStorage.getItem(STORAGE_KEYS.TOUR_SEEN)) return;
    createTourElements();
    tourState.stepIndex = 0;
    showTourStep();
    startCursorAutoScroll(); // Start monitoring cursor visibility
}

function checkAdvanceCondition() {
    // If either audio or animation is still running, do not enable button
    if (!tourState.audioFinished || !tourState.animationFinished) {
        return;
    }

    const nextBtn = tourState.tooltip?.querySelector('.tour-next');
    if (!nextBtn) return;

    const originalText = tourState.stepIndex === tourState.steps.length - 1 ? 'Finish' : 'Next';
    nextBtn.textContent = originalText;
    nextBtn.disabled = false;
    nextBtn.classList.remove('disabled');
}

function createTourElements() {
    // Overlay - blocks all interactions except tooltip buttons
    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    // Don't end tour on overlay click - block all interactions instead
    // Highlight
    const highlight = document.createElement('div');
    highlight.className = 'tour-highlight';
    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.innerHTML = `
        <div class="tour-title"></div>
        <div class="tour-body"></div>
        <div class="tour-actions">
            <button type="button" class="tour-prev">Back</button>
            <button type="button" class="tour-next">Next</button>
        </div>
    `;
    tooltip.querySelector('.tour-prev').addEventListener('click', (e) => { e.stopPropagation(); tourPrev(); });
    tooltip.querySelector('.tour-next').addEventListener('click', (e) => { e.stopPropagation(); tourNext(); });

    // Virtual cursor for demo animations
    const cursor = document.createElement('div');
    cursor.className = 'tour-virtual-cursor';
    cursor.style.display = 'none';
    // Ensure no state classes are set initially
    cursor.classList.remove('clicking', 'scrolling');

    document.body.appendChild(overlay);
    document.body.appendChild(highlight);
    document.body.appendChild(tooltip);
    document.body.appendChild(cursor);

    tourState.overlay = overlay;
    tourState.highlight = highlight;
    tourState.tooltip = tooltip;
    tourState.virtualCursor = cursor;

    window.addEventListener('resize', positionTour);
    window.addEventListener('scroll', positionTour, true);

    // Prevent scrolling and interactions during tour
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };

    // Prevent browsing interactions (click, keys, etc.)
    // Prevent browsing interactions (click, keys, etc.)
    const preventInteraction = (e) => {
        // Allow programmatic interactions (e.g. from demo script)
        if (e.isTrusted === false) return;

        // Allow interactions with tooltip
        if (e.target.closest('.tour-tooltip')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    };

    // Store handlers for cleanup
    tourState.scrollPrevention = preventScroll;
    tourState.interactionPrevention = preventInteraction;

    // Prevent wheel, touch scrolling
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });

    // Prevent keyboard scrolling
    window.addEventListener('keydown', (e) => {
        // Prevent arrow keys, page up/down, home/end, spacebar from scrolling
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
            // Allow if focus is on tooltip buttons
            if (!e.target.closest('.tour-tooltip')) {
                preventScroll(e);
            }
        }
    });

    // Block ALL user events in capture phase
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keypress', 'keyup'].forEach(evt => {
        window.addEventListener(evt, preventInteraction, true); // Capture phase is key!
    });

    // Prevent clicks and other interactions on overlay
    overlay.addEventListener('click', preventInteraction);
    overlay.addEventListener('mousedown', preventInteraction);
    overlay.addEventListener('mouseup', preventInteraction);
    overlay.addEventListener('contextmenu', preventInteraction);
}

function showTourStep() {
    const step = tourState.steps[tourState.stepIndex];
    if (!step) return endTour();
    const target = document.querySelector(step.selector);
    if (!target) {
        // Skip missing target
        tourNext();
        return;
    }

    // Ensure persona section is visible when touring it
    if (step.selector === '#persona-section') {
        const personaSection = document.getElementById('persona-section');
        if (personaSection && currentDialogue && currentDialogue.persona_profile) {
            personaSection.style.display = 'block';
        }
    }

    // Ensure appraisals section is expanded when touring it
    if (step.selector === '#appraisals-section') {
        const appraisalsSection = document.getElementById('appraisals-section');
        if (appraisalsSection) {
            const header = appraisalsSection.querySelector('.section-header');
            const content = appraisalsSection.querySelector('.section-content');
            if (header && content && header.classList.contains('collapsed')) {
                header.classList.remove('collapsed');
                content.classList.remove('collapsed');
            }
        }
    }

    // Show virtual cursor from the start of the tour
    if (tourState.virtualCursor) {
        tourState.virtualCursor.style.display = 'block';
    }

    // Animate virtual cursor for min context step
    if (step.selector === '#dialogue-container') {
        // Animation runs while countdown is active
        animateMinContextSelection();
    } else if (step.selector === '#bdi-section') {
        // Animation runs while countdown is active
        animateBDIInteraction();
    } else if (step.selector === '#appraisals-section') {
        // Animation runs automatically based on step
        if (tourState.stepIndex === 6) {
            // Delay animation by 4 seconds to sync with audio
            setTimeout(() => {
                if (tourState.stepIndex === 6) {
                    animateCategorySelection();
                }
            }, 4000);
        } else if (tourState.stepIndex === 7) {
            animateAppraisalDimensionSelection();
        }
    } else if (step.selector === '#selected-appraisals') {
        // Ranking animation runs automatically only for the ranking step
        if (step.title.includes('Rank')) {
            demoRankingAnimation();
        }
    } else if (step.selector === '#dialogue-rating-section') {
        // Wait for potential scroll to complete before animating (approx 600-800ms for smooth scroll)
        setTimeout(() => {
            animateDialogueRatingsForTour();
        }, 1000);
    } else {
        // For other steps, position cursor at the target element
        setTimeout(() => {
            if (tourState.virtualCursor && target) {
                tourState.virtualCursor.classList.remove('scrolling');
                tourState.virtualCursor.classList.remove('clicking');
                const targetRect = target.getBoundingClientRect();
                tourState.virtualCursor.style.top = `${targetRect.top + targetRect.height / 2}px`;
                tourState.virtualCursor.style.left = `${targetRect.left + targetRect.width / 2}px`;
            }
        }, 600); // Wait for scroll to complete
    }

    // Mark current target as "keep sharp" (above blurred overlay)
    // Remove tour-target-active from previous target
    if (tourState.activeTarget && tourState.activeTarget !== target) {
        tourState.activeTarget.classList.remove('tour-target-active');
    }
    tourState.activeTarget = target;
    tourState.activeTarget.classList.add('tour-target-active');

    // Check if scrolling is actually needed
    const targetRect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const isTargetVisible = (
        targetRect.top >= 0 &&
        targetRect.left >= 0 &&
        targetRect.bottom <= viewportHeight &&
        targetRect.right <= viewportWidth
    );

    // Calculate if we need to scroll (considering scrollOffset too)
    const needsScroll = !isTargetVisible ||
        (typeof step.scrollOffset === 'number' && step.scrollOffset !== 0) ||
        targetRect.top < 100 ||
        targetRect.bottom > viewportHeight - 100;

    // Only show scrolling cursor if scrolling is actually needed
    if (needsScroll && tourState.virtualCursor) {
        tourState.virtualCursor.classList.add('scrolling');
        tourState.virtualCursor.classList.remove('clicking');
    } else if (tourState.virtualCursor) {
        // Remove scrolling class if not needed
        tourState.virtualCursor.classList.remove('scrolling');
    }

    // Only scroll if needed
    // Special handling for selected-appraisals step (2.3) - scroll to center section (no scrolling cursor for positioning)
    if (step.selector === '#selected-appraisals') {
        // Find the parent section-content element
        const parentSection = target.closest('.annotation-section');
        let sectionContent = null;
        if (parentSection) {
            sectionContent = parentSection.querySelector('.section-content');
        }
        if (!sectionContent) {
            sectionContent = target.closest('.section-content');
        }

        const viewportHeight = window.innerHeight;
        const cursor = tourState.virtualCursor;

        // Don't show scrolling cursor - this is just positioning, not scrolling through content
        if (cursor) {
            cursor.classList.remove('scrolling', 'clicking', 'dragging');
        }

        // Center the selected-appraisals section in viewport
        const scrollPos = centerElementInViewport(target, false);
        window.scrollTo({ top: scrollPos.scrollY, left: scrollPos.scrollX, behavior: 'smooth' });

        // Wait for scroll to complete, then position tour
        setTimeout(() => {
            positionTour();
        }, 900);
    } else if (step.selector === '#dialogue-container') {
        // Special handling for dialogue-container step - skip auto-scroll, let animateMinContextSelection handle it
        // Don't scroll here, the animation function will handle all scrolling
        setTimeout(() => {
            positionTour();
        }, 100);
    } else if (step.selector === '#bdi-section') {
        // Special handling for BDI step - ensure it scrolls up enough and cursor stays visible
        // Ensure cursor is visible and positioned
        if (tourState.virtualCursor) {
            tourState.virtualCursor.style.display = 'block';
            tourState.virtualCursor.classList.add('scrolling');
            tourState.virtualCursor.classList.remove('clicking');
            // Position cursor immediately at current target location
            const initialRect = target.getBoundingClientRect();
            tourState.virtualCursor.style.top = `${initialRect.top + initialRect.height / 2}px`;
            tourState.virtualCursor.style.left = `${initialRect.left + initialRect.width / 2}px`;
        }

        // Expand BDI section first
        const header = target.querySelector('.section-header');
        const content = target.querySelector('.section-content');
        if (header && content && header.classList.contains('collapsed')) {
            header.classList.remove('collapsed');
            content.classList.remove('collapsed');
        }

        // Wait for expansion, then position tooltip first, then scroll
        setTimeout(() => {
            // First, position the tooltip to know where it will be (but skip auto-scroll)
            const sectionRect = target.getBoundingClientRect();
            const padding = 12;
            const tooltip = tourState.tooltip;

            // Calculate tooltip position (same logic as positionTour)
            let tooltipTop = sectionRect.top + window.scrollY + sectionRect.height + padding + 12;
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.left = `${sectionRect.left + window.scrollX}px`;

            // Get actual tooltip dimensions
            const tooltipRect = tooltip.getBoundingClientRect();
            const tooltipHeight = tooltipRect.height;
            const tooltipBottomInDocument = tooltipTop + tooltipHeight;

            // Calculate scroll to show both BDI section and tooltip
            // We want the BDI section to be visible and tooltip to fit below it
            const viewportHeight = window.innerHeight;
            const topPadding = 80; // Space at top for header/navigation
            const bottomPadding = 50; // Space at bottom

            // Calculate: we want tooltip bottom to be visible
            // Scroll so tooltip bottom is near bottom of viewport (with padding)
            const desiredTooltipBottomInViewport = viewportHeight - bottomPadding;
            const targetScrollY = tooltipBottomInDocument - desiredTooltipBottomInViewport;

            // Ensure scrolling cursor is shown during scroll
            if (tourState.virtualCursor) {
                tourState.virtualCursor.classList.add('scrolling');
                tourState.virtualCursor.classList.remove('clicking', 'dragging');
            }
            window.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'smooth' });

            // Update cursor position during scroll
            const updateCursorPosition = () => {
                if (tourState.virtualCursor && header) {
                    const headerRect = header.getBoundingClientRect();
                    tourState.virtualCursor.style.top = `${headerRect.top + headerRect.height / 2}px`;
                    tourState.virtualCursor.style.left = `${headerRect.left + headerRect.width / 2}px`;
                }
            };

            // Update cursor position a few times during scroll
            setTimeout(updateCursorPosition, 200);
            setTimeout(updateCursorPosition, 400);

            // After scroll completes, finalize positioning (positionTour will see everything is already positioned)
            setTimeout(() => {
                if (tourState.virtualCursor) {
                    tourState.virtualCursor.classList.remove('scrolling');
                    updateCursorPosition();
                }
                // Call positionTour but it should see tooltip is already visible and not auto-scroll
                positionTour();
            }, 700);
        }, 100);
    } else if (needsScroll) {
        // Add scrolling class for scroll animation
        if (tourState.virtualCursor) {
            tourState.virtualCursor.classList.add('scrolling');
            tourState.virtualCursor.classList.remove('clicking', 'dragging');
        }
        // Center target in viewport
        const scrollPos = centerElementInViewport(target, false);
        window.scrollTo({ top: scrollPos.scrollY, left: scrollPos.scrollX, behavior: 'smooth' });
        // Optional per-step scroll adjustment (negative = scroll further up)
        if (typeof step.scrollOffset === 'number' && step.scrollOffset !== 0) {
            setTimeout(() => {
                window.scrollBy({ top: step.scrollOffset, behavior: 'smooth' });
            }, 260);
        }

        // Remove scrolling state after scroll completes
        setTimeout(() => {
            if (tourState.virtualCursor) {
                tourState.virtualCursor.classList.remove('scrolling');
            }
            positionTour();
        }, 600);
    } else {
        // No scrolling needed, just position the tour
        setTimeout(() => {
            positionTour();
        }, 100);
    }

    tourState.tooltip.querySelector('.tour-title').textContent = step.title;
    tourState.tooltip.querySelector('.tour-body').innerHTML = step.body;

    const prevBtn = tourState.tooltip.querySelector('.tour-prev');
    const nextBtn = tourState.tooltip.querySelector('.tour-next');
    prevBtn.disabled = tourState.stepIndex === 0;

    // Clean up any existing countdown timer
    if (tourState.countdownInterval) {
        clearInterval(tourState.countdownInterval);
        tourState.countdownInterval = null;
    }

    // Determine countdown duration based on step index
    // Stop any existing audio
    if (tourState.audio) {
        tourState.audio.pause();
        tourState.audio = null;
    }

    // Audio Integration Logic
    // 1. Disable Next button initially
    // 2. Play audio for current step
    // 3. Enable Next button only after audio finishes + 3 seconds delay

    // Use audio defined in step
    let audioFiles = [];
    if (step.audio) {
        audioFiles = [step.audio];
    }

    // Initial button state
    const originalText = tourState.stepIndex === tourState.steps.length - 1 ? 'Finish' : 'Next';
    nextBtn.disabled = true;
    nextBtn.classList.add('disabled');
    nextBtn.textContent = 'Playing Audio...';

    // Reset flags
    tourState.audioFinished = false;
    tourState.animationFinished = true; // Default to true, specific steps will set to false

    // Helper to play sequence
    let currentAudioIndex = 0;

    const playNext = () => {
        if (currentAudioIndex >= audioFiles.length) {
            // All audio finished
            tourState.audioFinished = true;
            checkAdvanceCondition();
            return;
        }

        const file = audioFiles[currentAudioIndex];
        tourState.audio = new Audio(file);

        tourState.audio.addEventListener('ended', () => {
            currentAudioIndex++;
            playNext();
        });

        tourState.audio.addEventListener('error', (e) => {
            console.warn(`Audio failed to load: ${file}`, e);
            currentAudioIndex++;
            playNext();
        });

        tourState.audio.play().catch(e => {
            console.error(`Audio playback error for ${file}:`, e);
            currentAudioIndex++;
            playNext();
        });
    };

    // Determine if we need to wait for animation
    if (step.selector === '#dialogue-container' ||
        step.selector === '#bdi-section' ||
        (step.selector === '#selected-appraisals' && step.title.includes('Rank')) ||
        step.selector === '#dialogue-rating-section' ||
        (step.selector === '#appraisals-section' && (tourState.stepIndex === 6 || tourState.stepIndex === 7))) {
        tourState.animationFinished = false;
    }

    // Start playback sequence
    playNext();
}

function positionTour() {
    const step = tourState.steps[tourState.stepIndex];
    if (!step) return;
    const target = document.querySelector(step.selector);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const padding = 12; // extra padding so borders/background are fully covered

    // Highlight box
    tourState.highlight.style.top = `${rect.top - padding + window.scrollY}px`;
    tourState.highlight.style.left = `${rect.left - padding + window.scrollX}px`;
    tourState.highlight.style.width = `${rect.width + padding * 2}px`;
    tourState.highlight.style.height = `${rect.height + padding * 2}px`;

    // Tooltip positioning
    const tooltip = tourState.tooltip;
    const tRect = tooltip.getBoundingClientRect();
    let top = rect.top + window.scrollY;
    let left = rect.left + window.scrollX;

    // For annotation sections, dynamically determine placement based on element position
    let effectivePlacement = step.placement;
    const isAnnotationSection = target.classList.contains('annotation-section') ||
        step.selector === '#appraisals-section' ||
        step.selector === '#bdi-section';

    if (isAnnotationSection) {
        // Determine if element is on left or right side of viewport
        const viewportWidth = window.innerWidth;
        const elementCenterX = rect.left + rect.width / 2;
        const isOnLeftSide = elementCenterX < viewportWidth / 2;

        // Place tooltip on opposite side
        effectivePlacement = isOnLeftSide ? 'right' : 'left';
    }

    switch (effectivePlacement) {
        case 'right':
            left += rect.width + padding + 12;
            // Center tooltip vertically relative to target
            top = rect.top + window.scrollY + (rect.height / 2) - (tRect.height / 2);
            // Ensure tooltip doesn't go above viewport
            top = Math.max(12, top);
            // Ensure tooltip doesn't go off right edge of viewport
            const maxLeft = window.innerWidth - tRect.width - 12;
            if (left > maxLeft) {
                left = maxLeft;
            }
            break;
        case 'left':
            left = Math.max(12, left - tRect.width - padding - 12);
            // Center tooltip vertically relative to target
            top = rect.top + window.scrollY + (rect.height / 2) - (tRect.height / 2);
            // Ensure tooltip doesn't go above viewport
            top = Math.max(12, top);
            break;
        case 'top':
            top = Math.max(12, top - tRect.height - padding - 12);
            break;
        case 'center':
            // Center in viewport
            left = window.innerWidth / 2 - tRect.width / 2 + window.scrollX;
            top = window.innerHeight / 2 - tRect.height / 2 + window.scrollY;
            break;
        case 'bottom':
        default:
            top += rect.height + padding + 12;
            break;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Ensure tooltip is visible in viewport – auto-scroll if needed
    // Skip auto-scroll for BDI step - scroll is handled separately
    if (step.selector !== '#bdi-section') {
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;
        const tooltipTop = top;
        const tooltipBottom = top + tRect.height;
        let scrollTarget = null;

        if (tooltipBottom > viewportBottom - 16) {
            scrollTarget = tooltipBottom - window.innerHeight + 16;
        } else if (tooltipTop < viewportTop + 16) {
            scrollTarget = Math.max(0, tooltipTop - 16);
        }

        if (scrollTarget !== null) {
            // Add scrolling class for scroll animation
            if (tourState.virtualCursor) {
                tourState.virtualCursor.classList.add('scrolling');
                tourState.virtualCursor.classList.remove('clicking', 'dragging');
            }
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            // Remove scrolling class after scroll completes
            setTimeout(() => {
                if (tourState.virtualCursor) {
                    tourState.virtualCursor.classList.remove('scrolling');
                }
            }, 600);
        }
    }
}

// Helper function to enable/disable Next button
function setTourNextButtonEnabled(enabled) {
    const nextBtn = tourState.tooltip?.querySelector('.tour-next');
    if (nextBtn) {
        nextBtn.disabled = !enabled;
        if (enabled) {
            nextBtn.classList.remove('disabled');
        } else {
            nextBtn.classList.add('disabled');
        }
    }
}

// Helper function to center an element in the viewport
function centerElementInViewport(element, allowExceedBottom = false) {
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const currentScrollY = window.scrollY;
    const currentScrollX = window.scrollX;

    // Calculate the center position of the viewport
    const viewportCenterY = viewportHeight / 2;
    const viewportCenterX = viewportWidth / 2;

    // Calculate element's center position relative to viewport
    const elementCenterY = rect.top + rect.height / 2;
    const elementCenterX = rect.left + rect.width / 2;

    // Calculate how much we need to scroll to center the element
    const scrollY = currentScrollY + (elementCenterY - viewportCenterY);
    const scrollX = currentScrollX + (elementCenterX - viewportCenterX);

    // If allowExceedBottom is false, ensure we don't scroll beyond document bounds
    // If true, allow scrolling beyond (useful for dialogue container)
    let finalScrollY = scrollY;
    if (!allowExceedBottom) {
        const maxScrollY = document.documentElement.scrollHeight - viewportHeight;
        finalScrollY = Math.max(0, Math.min(scrollY, maxScrollY));
    }

    const finalScrollX = Math.max(0, Math.min(scrollX, document.documentElement.scrollWidth - viewportWidth));

    return { scrollY: finalScrollY, scrollX: finalScrollX };
}

// Helper function to ensure cursor stays visible in viewport during animations
async function ensureCursorVisible(cursor, options = {}) {
    const {
        margin = 100,  // Pixels from viewport edge
        behavior = 'smooth',
        duration = 400
    } = options;

    const rect = cursor.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let needsScroll = false;
    let scrollY = window.scrollY;
    let scrollX = window.scrollX;

    // Check if cursor is too close to edges or outside viewport
    if (rect.top < margin) {
        scrollY += (rect.top - margin);
        needsScroll = true;
    } else if (rect.bottom > viewportHeight - margin) {
        scrollY += (rect.bottom - (viewportHeight - margin));
        needsScroll = true;
    }

    if (rect.left < margin) {
        scrollX += (rect.left - margin);
        needsScroll = true;
    } else if (rect.right > viewportWidth - margin) {
        scrollX += (rect.right - (viewportWidth - margin));
        needsScroll = true;
    }

    if (needsScroll) {
        cursor.classList.add('scrolling');
        window.scrollTo({
            top: Math.max(0, scrollY),
            left: Math.max(0, scrollX),
            behavior
        });

        return new Promise(resolve => {
            setTimeout(() => {
                cursor.classList.remove('scrolling');
                resolve();
            }, duration);
        });
    }

    return Promise.resolve();
}

// Animate virtual cursor to demonstrate min context selection
function animateMinContextSelection() {
    const cursor = tourState.virtualCursor;
    if (!cursor) return;

    const dialogueContainer = document.getElementById('dialogue-container');
    if (!dialogueContainer) return;

    // Find turn 8 (turn pair number 8)
    const turn8 = document.querySelector('[data-turn-pair-number="8"]');
    if (!turn8) return;

    // Ensure cursor is visible
    cursor.style.display = 'block';
    cursor.classList.remove('clicking', 'dragging');

    // Step 1: First scroll the PAGE down to show the dialogue container
    setTimeout(() => {
        const containerRect = dialogueContainer.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Always scroll down - scroll to the bottom of the dialogue container element
        cursor.classList.add('scrolling');
        cursor.classList.remove('clicking', 'dragging');

        // Position cursor at dialogue container center
        cursor.style.top = `${containerRect.top + containerRect.height / 2}px`;
        cursor.style.left = `${containerRect.left + containerRect.width / 2}px`;

        // Scroll page down significantly
        // Use both document.documentElement.scrollTop and window.scrollTo for maximum compatibility
        const scrollDownAmount = 500; // Scroll down 1200px from current position
        const maxScrollY = document.documentElement.scrollHeight - viewportHeight;
        const currentScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

        // Always scroll if we can scroll down more
        if (currentScrollY < maxScrollY) {
            // Calculate target scroll position
            const targetScrollY = Math.min(currentScrollY + scrollDownAmount, maxScrollY);

            // window.scrollTo doesn't work (likely blocked by scroll prevention handlers)
            // Use smooth scroll animation with direct scrollTop assignment
            const startScrollY = currentScrollY;
            const distance = targetScrollY - startScrollY;
            const duration = 600; // Animation duration in ms
            const startTime = performance.now();

            function smoothScroll(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Easing function for smooth animation (ease-out)
                const easeOut = 1 - Math.pow(1 - progress, 3);

                const currentScroll = startScrollY + (distance * easeOut);

                // Use the fallback method that works
                document.documentElement.scrollTop = currentScroll;
                document.body.scrollTop = currentScroll;

                if (progress < 1) {
                    requestAnimationFrame(smoothScroll);
                }
            }

            // Start the smooth scroll animation
            requestAnimationFrame(smoothScroll);

            // Wait for page scroll to complete, then proceed to scroll dialogue container
            setTimeout(() => {
                scrollDialogueContainerToBottom();
            }, 800);
        } else {
            // Already at bottom, proceed directly to dialogue container scroll
            scrollDialogueContainerToBottom();
        }
    }, 500);

    // Helper function: Scroll dialogue container to bottom, then scroll back up to turn 8
    function scrollDialogueContainerToBottom() {
        // Position cursor at dialogue container center
        const containerRect = dialogueContainer.getBoundingClientRect();
        cursor.style.top = `${containerRect.top + containerRect.height / 2}px`;
        cursor.style.left = `${containerRect.left + containerRect.width / 2}px`;

        // Step 2: Scroll ALL THE WAY TO THE BOTTOM of the dialogue container
        cursor.classList.add('scrolling');
        cursor.classList.remove('clicking', 'dragging');

        // Scroll to the very bottom of the dialogue container (allow exceeding bottom)
        const maxScrollTop = dialogueContainer.scrollHeight - dialogueContainer.clientHeight - 1600;
        dialogueContainer.scrollTo({ top: maxScrollTop, behavior: 'smooth' });

        // Wait for scroll to bottom to complete
        setTimeout(() => {
            // Step 3: Now scroll back up through the dialogues to center turn 8 in the container
            const turn8Rect = turn8.getBoundingClientRect();
            const containerRect = dialogueContainer.getBoundingClientRect();

            // Calculate the position of turn 8 relative to the container
            const turn8OffsetTop = turn8.offsetTop;
            const containerHeight = dialogueContainer.clientHeight;

            // Calculate scroll position to center turn 8 within the container viewport
            const targetScrollTop = turn8OffsetTop - (containerHeight / 2) + (turn8Rect.height / 2);
            // const targetScrollTop = turn8OffsetTop;

            // Keep scrolling cursor visible while scrolling back up
            cursor.classList.add('scrolling');
            cursor.classList.remove('clicking', 'dragging');

            // Scroll back up to center turn 8 in the container
            dialogueContainer.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });

            // Wait for scroll to turn 8 to complete
            setTimeout(() => {
                cursor.classList.remove('scrolling');

                // Step 4: Move cursor to turn 8 and click
                const finalTurn8Rect = turn8.getBoundingClientRect();
                cursor.style.top = `${finalTurn8Rect.top + finalTurn8Rect.height / 2}px`;
                cursor.style.left = `${finalTurn8Rect.left + finalTurn8Rect.width / 2}px`;

                // Step 5: Click animation
                setTimeout(() => {
                    cursor.classList.add('clicking');
                    cursor.classList.remove('scrolling', 'dragging');
                    // Actually click the turn pair
                    turn8.click();

                    // Step 6: Remove clicking animation but keep cursor visible
                    setTimeout(() => {
                        cursor.classList.remove('clicking');
                        // Animation finished
                        tourState.animationFinished = true;
                        checkAdvanceCondition();
                    }, 200);
                }, 400);
            }, 800);
        }, 800);
    }
}

// Animate virtual cursor to demonstrate BDI interaction
function animateBDIInteraction() {
    const cursor = tourState.virtualCursor;
    if (!cursor) return;

    const bdiSection = document.getElementById('bdi-section');
    if (!bdiSection) return;

    // Ensure cursor is visible
    cursor.style.display = 'block';

    const header = bdiSection.querySelector('.section-header');
    const beliefInput = document.getElementById('belief');

    // Wait for scroll to complete (handled in showTourStep), then animate cursor
    setTimeout(() => {
        // Position cursor at the section header first
        if (header) {
            const headerRect = header.getBoundingClientRect();
            cursor.style.top = `${headerRect.top + headerRect.height / 2}px`;
            cursor.style.left = `${headerRect.left + headerRect.width / 2}px`;

            // Animate a click gesture on header
            setTimeout(() => {
                cursor.classList.add('clicking');
                cursor.classList.remove('scrolling');
                setTimeout(() => {
                    cursor.classList.remove('clicking');

                    // Move cursor to the first input field (Belief)
                    if (beliefInput) {
                        const inputRect = beliefInput.getBoundingClientRect();
                        cursor.style.top = `${inputRect.top + inputRect.height / 2}px`;
                        cursor.style.left = `${inputRect.left + inputRect.width / 2}px`;

                        // Show a brief click animation on input
                        setTimeout(() => {
                            cursor.classList.add('clicking');
                            setTimeout(() => {
                                cursor.classList.remove('clicking');
                                // Animation finished
                                tourState.animationFinished = true;
                                checkAdvanceCondition();
                            }, 200);
                        }, 400);
                    } else {
                        // If input not found, still finish
                        tourState.animationFinished = true;
                        checkAdvanceCondition();
                    }
                }, 200);
            }, 500);
        } else {
            // Header not found
            tourState.animationFinished = true;
            checkAdvanceCondition();
        }
    }, 800);
}

// Helper: derive and (optionally) select a few coarse categories from ground truth, with animation.
// Called only when the user clicks "Next" from the coarse step to the fine-grained step in the tour.
// Combined animation: select categories (which reveal dimensions) then select dimensions
// Helper: Step 6 - Select Appraisal Categories (Descriptions)
function animateCategorySelection() {
    // Disable Next button during animation
    setTourNextButtonEnabled(false);

    // Ensure options are rendered
    renderAppraisalOptions();

    // Ensure appraisals section maintains tour-target-active class for white background
    const appraisalsSection = document.getElementById('appraisals-section');
    if (appraisalsSection) {
        appraisalsSection.classList.add('tour-target-active');
        // Expand if collapsed
        const header = appraisalsSection.querySelector('.section-header');
        const content = appraisalsSection.querySelector('.section-content');
        if (header && content && header.classList.contains('collapsed')) {
            header.classList.remove('collapsed');
            content.classList.remove('collapsed');
        }
    }

    const cursor = tourState.virtualCursor;
    if (!cursor) {
        // Fallback
        if (tourState.stepIndex < tourState.steps.length - 1) {
            tourState.stepIndex += 1;
            showTourStep();
        }
        return;
    }

    // Ensure cursor is visible
    cursor.style.display = 'block';
    cursor.classList.remove('scrolling', 'clicking', 'dragging');

    // Scroll section into view if needed
    if (appraisalsSection) {
        cursor.classList.add('scrolling');
        const scrollPos = centerElementInViewport(appraisalsSection, false);
        window.scrollTo({ top: scrollPos.scrollY, left: scrollPos.scrollX, behavior: 'smooth' });
        setTimeout(() => {
            cursor.classList.remove('scrolling');
        }, 800);
    }

    // Wait for DOM to settle and scroll to complete
    setTimeout(() => {
        // Ensure appraisals section maintains tour-target-active class throughout animation
        const ensureTourClass = setInterval(() => {
            if (appraisalsSection && !appraisalsSection.classList.contains('tour-target-active')) {
                appraisalsSection.classList.add('tour-target-active');
            }
        }, 100);

        // Step 1: Select categories
        const coarseOptions = Array.from(document.querySelectorAll('.coarse-option'));
        if (coarseOptions.length === 0) {
            clearInterval(ensureTourClass);
            return;
        }

        // Targets: self_cause (0), unpredictability_of_event (1), self_control (3), goal_incongruence (5), unacceptable_consequences (6)
        const targetIndices = [0, 1, 3, 5, 6];
        const categoryTargets = targetIndices
            .filter(idx => idx < coarseOptions.length)
            .map(idx => coarseOptions[idx]);

        if (categoryTargets.length === 0) {
            clearInterval(ensureTourClass);
            return;
        }

        // Sequentially click categories with smooth cursor movement
        cursor.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';

        (async () => {
            for (let idx = 0; idx < categoryTargets.length; idx++) {
                const el = categoryTargets[idx];

                if (idx > 0) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }

                // Scroll logic to Ensure Visibility before interacting
                let rect = el.getBoundingClientRect();
                const viewportHeight = window.innerHeight;

                // If element is low in viewport (or off screen), scroll it up to center
                // This proactively handles the case where previous expansions pushed this element down
                if (rect.bottom > viewportHeight - 150 || rect.top < 100) {
                    cursor.classList.add('scrolling');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(resolve => setTimeout(resolve, 800)); // Wait for scroll
                    cursor.classList.remove('scrolling');

                    // Update rect after scroll
                    rect = el.getBoundingClientRect();
                }

                // Move cursor to element
                const updateCursorPos = () => {
                    const r = el.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    cursor.style.left = `${cx}px`;
                    cursor.style.top = `${cy}px`;
                };

                updateCursorPos();

                // Double check visibility with the generic helper
                await ensureCursorVisible(cursor, { duration: 300 });
                await new Promise(resolve => setTimeout(resolve, 400));

                // Re-align in case of minor shifts
                updateCursorPos();

                // Click sequence
                el.classList.add('tour-coarse-highlight');
                cursor.classList.add('clicking');

                await new Promise(resolve => setTimeout(resolve, 250));

                el.click(); // This will reveal dimensions
                cursor.classList.remove('clicking');

                // Wait for expansion animation
                await new Promise(resolve => setTimeout(resolve, 500));

                el.classList.remove('tour-coarse-highlight');
                updateCursorPos(); // stick directly to element if it moved slightly

                // Visual feedback
                const categoryContainer = el.closest('.appraisal-category-container');
                const dimensionsContainer = categoryContainer?.querySelector('.appraisal-dimensions-container');
                if (dimensionsContainer && dimensionsContainer.style.display !== 'none') {
                    dimensionsContainer.style.transition = 'background-color 0.3s ease';
                    dimensionsContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    setTimeout(() => {
                        dimensionsContainer.style.backgroundColor = '';
                    }, 400);
                }

                // POST-EXPANSION SCROLL CHECK
                // After expansion, the category content (dimensions) appears. 
                // We should ensure this content is visible, as users need to read it.
                if (dimensionsContainer) {
                    const dimRect = dimensionsContainer.getBoundingClientRect();
                    if (dimRect.bottom > window.innerHeight - 50) {
                        cursor.classList.add('scrolling');
                        // Scroll so the dimensions are centered or at least fully visible
                        // Using scrollBy to just nudge it enough
                        window.scrollBy({ top: Math.min(dimRect.height + 20, 200), behavior: 'smooth' });

                        await new Promise(resolve => setTimeout(resolve, 600));
                        cursor.classList.remove('scrolling');

                        // Update cursor to stay on the category header (el)
                        updateCursorPos();
                    }
                }
            }
        })();

        // After categories are selected, simply stop the interval.
        // We DO NOT enable the Next button here. We let the audio 'onended' listener
        // in showTourStep handle enabling the button to ensure audio finishes first.
        const totalDelay = categoryTargets.length * 750 + 1500;
        setTimeout(() => {
            clearInterval(ensureTourClass);
            tourState.animationFinished = true;
            checkAdvanceCondition();
        }, totalDelay);
    }, 1000);
}

// Helper: Step 7 - Select Appraisal Dimensions
function animateAppraisalDimensionSelection() {
    const cursor = tourState.virtualCursor;
    if (!cursor) {
        // Fallback
        if (tourState.stepIndex < tourState.steps.length - 1) {
            tourState.stepIndex += 1;
            showTourStep();
        }
        return;
    }

    // Keep section highlighted
    const appraisalsSection = document.getElementById('appraisals-section');
    let ensureTourClass = null;
    if (appraisalsSection) {
        ensureTourClass = setInterval(() => {
            if (appraisalsSection && !appraisalsSection.classList.contains('tour-target-active')) {
                appraisalsSection.classList.add('tour-target-active');
            }
        }, 100);
    }

    // Wait for DOM to handle transition from previous step
    setTimeout(() => {
        // The specific appraisals to select
        const targetAppraisals = [
            'self_cause',
            'unpredictability_of_event',
            'unacceptable_consequences',
            'self_control',
            'goal_incongruence'
        ];

        // Find visible fine options
        const fineOptions = Array.from(document.querySelectorAll('.fine-option'));
        const dimensionTargets = fineOptions.filter(option => {
            const dimensionKey = option.dataset.key;
            if (!targetAppraisals.includes(dimensionKey)) return false;

            // Check visibility
            const dimensionsContainer = option.closest('.appraisal-dimensions-container');
            if (!dimensionsContainer) return false;

            const computedStyle = window.getComputedStyle(dimensionsContainer);
            return computedStyle.display !== 'none' &&
                computedStyle.visibility !== 'hidden' &&
                computedStyle.opacity !== '0';
        });

        if (dimensionTargets.length === 0) {
            // If empty (shouldn't be if step 6 ran), try retry or skip
            console.warn('No dimensions found for Step 7');
            if (ensureTourClass) clearInterval(ensureTourClass);
            if (tourState.stepIndex < tourState.steps.length - 1) {
                tourState.stepIndex += 1;
                showTourStep();
            }
            return;
        }

        // Sequentially select dimensions
        animatespecificDimensionSelection(dimensionTargets, ensureTourClass);

    }, 1000);
}

// Sub-helper for iterating dimensions
async function animatespecificDimensionSelection(dimensionTargets, ensureTourClass) {
    const cursor = tourState.virtualCursor;

    // Enable smooth cursor transitions
    cursor.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';

    for (let idx = 0; idx < dimensionTargets.length; idx++) {
        const el = dimensionTargets[idx];

        if (idx > 0) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        // Scroll logic to Ensure Visibility
        const rect = el.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        if (rect.bottom > viewportHeight - 100 || rect.top < 100) {
            cursor.classList.add('scrolling');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 800));
            cursor.classList.remove('scrolling');
        }

        // Move cursor
        const updatedRect = el.getBoundingClientRect();
        const centerX = updatedRect.left + updatedRect.width / 2;
        const centerY = updatedRect.top + updatedRect.height / 2;

        cursor.style.left = `${centerX}px`;
        cursor.style.top = `${centerY}px`;

        await ensureCursorVisible(cursor, { duration: 300 });
        await new Promise(resolve => setTimeout(resolve, 400));

        // Click logic
        const finalRect = el.getBoundingClientRect();
        cursor.style.left = `${finalRect.left + finalRect.width / 2}px`;
        cursor.style.top = `${finalRect.top + finalRect.height / 2}px`;

        await new Promise(resolve => setTimeout(resolve, 250));

        el.classList.add('tour-coarse-highlight');
        cursor.classList.add('clicking');

        await new Promise(resolve => setTimeout(resolve, 150));

        el.click();
        cursor.classList.remove('clicking');

        await new Promise(resolve => setTimeout(resolve, 300));
        el.classList.remove('tour-coarse-highlight');
    }

    if (ensureTourClass) clearInterval(ensureTourClass);
    cursor.style.transition = '';

    // Transition to Step 8 (Ranking)
    // Scroll to #selected-appraisals to set up next step
    const selectedAppraisalsSection = document.getElementById('selected-appraisals');
    if (selectedAppraisalsSection) {
        cursor.classList.add('scrolling');
        // Add a small delay to ensure DOM is stable
        await new Promise(resolve => setTimeout(resolve, 300));

        // Manual Scroll: Align Top with 150px Buffer
        // This is safer than centering for tall lists and avoids header occlusion
        const rect = selectedAppraisalsSection.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetTop = rect.top + scrollTop - 150;

        window.scrollTo({
            top: targetTop,
            behavior: 'smooth'
        });
        await new Promise(resolve => setTimeout(resolve, 1200));

        // Dynamic Tooltip follows target
        if (tourState.tooltip && tourState.highlight) {
            const rect = selectedAppraisalsSection.getBoundingClientRect();
            const tRect = tourState.tooltip.getBoundingClientRect();
            const padding = 12;

            const hlTop = rect.top + window.scrollY - padding;
            const hlLeft = rect.left + window.scrollX - padding;

            tourState.highlight.style.transition = 'all 0.8s ease';
            tourState.highlight.style.top = `${hlTop}px`;
            tourState.highlight.style.left = `${hlLeft}px`;
            tourState.highlight.style.width = `${rect.width + padding * 2}px`;
            tourState.highlight.style.height = `${rect.height + padding * 2}px`;

            let ttTop = rect.top + window.scrollY + (rect.height / 2) - (tRect.height / 2);
            let ttLeft = rect.left + window.scrollX - tRect.width - 12 - padding;
            if (ttLeft < 0) ttLeft = rect.right + window.scrollX + 12 + padding;

            tourState.tooltip.style.transition = 'all 0.8s ease';
            tourState.tooltip.style.top = `${ttTop}px`;
            tourState.tooltip.style.left = `${ttLeft}px`;
        }

        cursor.classList.remove('scrolling');
        positionTour();
    }

    // Animation finished
    tourState.animationFinished = true;
    checkAdvanceCondition();
}


// Helper: automatically select specific fine-grained appraisals during tour (legacy - kept for compatibility)
function autoSelectFineAppraisalsForTour() {
    // Disable Next button during animation
    setTourNextButtonEnabled(false);

    const cursor = tourState.virtualCursor;
    if (!cursor) {
        // Fallback: re-enable and advance if cursor not available
        // Button is now controlled by countdown timer
        // setTourNextButtonEnabled(true);
        if (tourState.stepIndex < tourState.steps.length - 1) {
            tourState.stepIndex += 1;
            showTourStep();
        }
        return;
    }

    // Ensure cursor is visible
    cursor.style.display = 'block';
    cursor.classList.remove('scrolling');

    // The specific appraisals to select (using their dimension keys)
    const targetAppraisals = [
        'self_cause',
        'unpredictability_of_event',
        'unacceptable_consequences',
        'self_control',
        'goal_incongruence'
    ];

    // Wait for DOM to settle
    setTimeout(() => {
        // Find all fine-grained option elements
        const fineOptions = Array.from(document.querySelectorAll('.fine-option'));

        if (fineOptions.length === 0) return;

        // Filter to only the target appraisals
        const targets = fineOptions.filter(option => {
            const dimensionKey = option.dataset.key;
            return targetAppraisals.includes(dimensionKey);
        });

        if (targets.length === 0) return;

        // Sequentially move cursor to and click each fine-grained appraisal
        targets.forEach((el, idx) => {
            setTimeout(() => {
                // Get the appraisal box position
                const rect = el.getBoundingClientRect();

                // Position cursor at the center of the appraisal box
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                // Position cursor smoothly
                cursor.style.left = `${centerX}px`;
                cursor.style.top = `${centerY}px`;

                // Wait for cursor to smoothly move to position, then click
                setTimeout(() => {
                    // Final position check after cursor movement
                    const finalRect = el.getBoundingClientRect();
                    const finalCenterX = finalRect.left + finalRect.width / 2;
                    const finalCenterY = finalRect.top + finalRect.height / 2;
                    cursor.style.left = `${finalCenterX}px`;
                    cursor.style.top = `${finalCenterY}px`;

                    // Brief pause, then highlight and click
                    setTimeout(() => {
                        el.classList.add('tour-coarse-highlight');
                        cursor.classList.add('clicking');

                        // Click the appraisal
                        setTimeout(() => {
                            el.click(); // trigger regular selection logic
                            cursor.classList.remove('clicking');
                            setTimeout(() => el.classList.remove('tour-coarse-highlight'), 300);
                        }, 150);
                    }, 250);
                }, 400);
            }, idx * 800);
        });

        // After all selections complete, scroll to show the selected appraisals
        const totalSelectionDelay = targets.length * 800 + 1200; // Total time for all selections + buffer
        setTimeout(() => {
            const selectedAppraisalsSection = document.getElementById('selected-appraisals');
            if (selectedAppraisalsSection) {
                // Show scrolling cursor
                cursor.classList.add('scrolling');

                // First, center the selected appraisals section in viewport
                const scrollPos = centerElementInViewport(selectedAppraisalsSection, false);
                window.scrollTo({ top: scrollPos.scrollY, left: scrollPos.scrollX, behavior: 'smooth' });

                // Wait for initial scroll to complete, then update tooltip
                setTimeout(() => {
                    // Update cursor position to the selected appraisals section
                    const updatedRect = selectedAppraisalsSection.getBoundingClientRect();
                    cursor.style.left = `${updatedRect.left + updatedRect.width / 2}px`;
                    cursor.style.top = `${updatedRect.top + updatedRect.height / 2}px`;

                    // Wait for scroll to complete, then update tooltip
                    setTimeout(() => {
                        positionTour();

                        // Remove scrolling state after scroll completes
                        cursor.classList.remove('scrolling');

                        // Re-enable Next button before advancing (it will be disabled again for the new step if needed)
                        // Button is now controlled by countdown timer
                        // setTourNextButtonEnabled(true);

                        // Advance to step 2.3 (selected-appraisals) after scroll completes
                        if (tourState.stepIndex < tourState.steps.length - 1) {
                            tourState.stepIndex += 1;
                            showTourStep();
                        }
                    }, 900);
                }, 800);
            }
        }, totalSelectionDelay);
    }, 300);
}

// Helper: demo ranking animation - drag items to reorder
function demoRankingAnimation() {
    const cursor = tourState.virtualCursor;
    if (!cursor) {
        // Fallback: advance to next step if cursor not available
        if (tourState.stepIndex < tourState.steps.length - 1) {
            tourState.stepIndex += 1;
            showTourStep();
        }

        // Ensure the section is fully visible before starting animation
        const selectedAppraisalsSection = document.getElementById('selected-appraisals');
        if (selectedAppraisalsSection) {
            cursor.classList.add('scrolling');

            // Force scroll to center to ensure all items are visible
            selectedAppraisalsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });

            // Wait for scroll to settle
            setTimeout(() => {
                cursor.classList.remove('scrolling');
                startDemoRankingSequence();
            }, 1000);
            return;
        }

        startDemoRankingSequence();
        return;
    }

    startDemoRankingSequence();
}

function startDemoRankingSequence() {
    const cursor = tourState.virtualCursor;
    // Wait for selected appraisals to be rendered
    setTimeout(() => {
        const items = Array.from(document.querySelectorAll('.appraisal-item'));
        if (items.length < 5) {
            // Fallback: advance to next step if not enough items
            if (tourState.stepIndex < tourState.steps.length - 1) {
                tourState.stepIndex += 1;
                showTourStep();
            }
            return;
        }

        // Find the items we need to drag
        const selfCauseItem = items.find(item => item.dataset.dimension === 'self_cause');
        const unacceptableItem = items.find(item => item.dataset.dimension === 'unacceptable_consequences');

        if (!selfCauseItem || !unacceptableItem) {
            // Fallback: advance to next step if items not found
            if (tourState.stepIndex < tourState.steps.length - 1) {
                tourState.stepIndex += 1;
                showTourStep();
            }
            return;
        }

        // Animation 1: Drag "self_cause" to first position
        setTimeout(() => {
            // Find the first item (position 1, index 0)
            const firstItem = items[0];
            if (!firstItem) return;

            // Position cursor at self_cause item
            const selfCauseRect = selfCauseItem.getBoundingClientRect();
            const dragHandle = selfCauseItem.querySelector('.drag-handle');
            const handleRect = dragHandle ? dragHandle.getBoundingClientRect() : selfCauseRect;

            cursor.style.left = `${handleRect.left + handleRect.width / 2}px`;
            cursor.style.top = `${handleRect.top + handleRect.height / 2}px`;

            // Wait, then start drag
            setTimeout(() => {
                // Add dragging class to cursor
                cursor.classList.add('dragging');
                cursor.classList.remove('clicking', 'scrolling');

                // Simulate drag start
                const dragStartEvent = new DragEvent('dragstart', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: new DataTransfer()
                });
                draggedElement = selfCauseItem;
                selfCauseItem.classList.add('dragging');

                // Move cursor to first position, and make the dragged item follow vertically
                const firstRect = firstItem.getBoundingClientRect();
                const firstMidpoint = firstRect.top + firstRect.height / 2;

                // Calculate the vertical offset for the dragged item to follow cursor
                const handleCenterY = handleRect.top + handleRect.height / 2;
                const offsetY = handleCenterY - selfCauseRect.top;

                // Animate cursor movement (move cursor to target position)
                cursor.style.top = `${firstMidpoint}px`;
                cursor.style.left = `${firstRect.left + firstRect.width / 2}px`;

                // Make the dragged item follow the cursor vertically only (no horizontal movement)
                const targetY = firstMidpoint - offsetY;

                // Apply transform to make item float and follow cursor vertically
                selfCauseItem.style.transform = `translateY(${targetY - selfCauseRect.top}px) scale(1.05)`;
                selfCauseItem.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                selfCauseItem.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.4)';

                // Simulate drag over (before first item)
                setTimeout(() => {
                    firstItem.classList.add('drag-over-before');

                    // Simulate drop
                    setTimeout(() => {
                        // Perform the actual reorder
                        const draggedIndex = selectedAppraisals.findIndex(a => a.dimension === 'self_cause');
                        const targetIndex = 0;

                        if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
                            const [draggedItem] = selectedAppraisals.splice(draggedIndex, 1);
                            selectedAppraisals.splice(targetIndex, 0, draggedItem);
                            renderSelectedAppraisals();
                        }

                        // Clean up drag state - reset transform and styles
                        cursor.classList.remove('dragging');
                        selfCauseItem.classList.remove('dragging');
                        firstItem.classList.remove('drag-over-before');
                        draggedElement = null;

                        // Reset transform after re-render
                        setTimeout(() => {
                            const updatedItems = Array.from(document.querySelectorAll('.appraisal-item'));
                            const updatedSelfCause = updatedItems.find(item => item.dataset.dimension === 'self_cause');
                            if (updatedSelfCause) {
                                updatedSelfCause.style.transform = '';
                                updatedSelfCause.style.transition = '';
                                updatedSelfCause.style.boxShadow = '';
                            }
                        }, 100);

                        // Animation 2: Drag "unacceptable_consequences" to third position
                        setTimeout(() => {
                            const newItems = Array.from(document.querySelectorAll('.appraisal-item'));
                            const newUnacceptableItem = newItems.find(item => item.dataset.dimension === 'unacceptable_consequences');
                            if (!newUnacceptableItem) return;

                            // Find the third item (position 3, index 2)
                            const thirdItem = newItems[2];
                            if (!thirdItem) return;

                            // Position cursor at unacceptable item
                            const unacceptableRect = newUnacceptableItem.getBoundingClientRect();
                            const unacceptableHandle = newUnacceptableItem.querySelector('.drag-handle');
                            const unacceptableHandleRect = unacceptableHandle ? unacceptableHandle.getBoundingClientRect() : unacceptableRect;

                            cursor.style.left = `${unacceptableHandleRect.left + unacceptableHandleRect.width / 2}px`;
                            cursor.style.top = `${unacceptableHandleRect.top + unacceptableHandleRect.height / 2}px`;

                            // Wait, then start drag
                            setTimeout(() => {
                                // Add dragging class to cursor
                                cursor.classList.add('dragging');

                                // Simulate drag start
                                draggedElement = newUnacceptableItem;
                                newUnacceptableItem.classList.add('dragging');

                                // Move cursor to third position, and make the dragged item follow vertically
                                const thirdRect = thirdItem.getBoundingClientRect();
                                const thirdMidpoint = thirdRect.top + thirdRect.height / 2;

                                // Calculate the vertical offset for the dragged item to follow cursor
                                const unacceptableHandleCenterY = unacceptableHandleRect.top + unacceptableHandleRect.height / 2;
                                const unacceptableOffsetY = unacceptableHandleCenterY - unacceptableRect.top;

                                // Animate cursor movement (move cursor to target position)
                                cursor.style.top = `${thirdMidpoint}px`;
                                cursor.style.left = `${thirdRect.left + thirdRect.width / 2}px`;

                                // Make the dragged item follow the cursor vertically only (no horizontal movement)
                                const unacceptableTargetY = thirdMidpoint - unacceptableOffsetY;

                                // Apply transform to make item float and follow cursor vertically
                                newUnacceptableItem.style.transform = `translateY(${unacceptableTargetY - unacceptableRect.top}px) scale(1.05)`;
                                newUnacceptableItem.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                                newUnacceptableItem.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.4)';

                                // Simulate drag over (before third item)
                                setTimeout(() => {
                                    thirdItem.classList.add('drag-over-before');

                                    // Simulate drop
                                    setTimeout(() => {
                                        // Perform the actual reorder
                                        const draggedIndex2 = selectedAppraisals.findIndex(a => a.dimension === 'unacceptable_consequences');
                                        const targetIndex2 = 2; // Third position (index 2)

                                        if (draggedIndex2 !== -1 && draggedIndex2 !== targetIndex2) {
                                            const [draggedItem2] = selectedAppraisals.splice(draggedIndex2, 1);
                                            selectedAppraisals.splice(targetIndex2, 0, draggedItem2);
                                            renderSelectedAppraisals();
                                        }

                                        // Clean up drag state - reset transform and styles
                                        cursor.classList.remove('dragging');
                                        newUnacceptableItem.classList.remove('dragging');
                                        thirdItem.classList.remove('drag-over-before');
                                        draggedElement = null;

                                        // Reset transform after re-render
                                        setTimeout(() => {
                                            const finalItems = Array.from(document.querySelectorAll('.appraisal-item'));
                                            const finalUnacceptable = finalItems.find(item => item.dataset.dimension === 'unacceptable_consequences');
                                            if (finalUnacceptable) {
                                                finalUnacceptable.style.transform = '';
                                                finalUnacceptable.style.transition = '';
                                                finalUnacceptable.style.boxShadow = '';

                                                // Position cursor at final location
                                                const finalRect = finalUnacceptable.getBoundingClientRect();
                                                cursor.style.left = `${finalRect.left + finalRect.width / 2}px`;
                                                cursor.style.top = `${finalRect.top + finalRect.height / 2}px`;
                                            }

                                            // Re-enable Next button and advance to the next step after ranking animation completes
                                            setTimeout(() => {
                                                // Start rationale input animation AFTER ranking is fully done and DOM is stable
                                                demoRationaleInputAnimation();
                                            }, 500);
                                        }, 100);
                                    }, 300);
                                }, 400);
                            }, 500);
                        }, 800);
                    }, 300);
                }, 400);
            }, 500);
        }, 500);
    }, 100);
}

// Justifications from data/example_entry.json
const DEMO_RATIONALES = {
    'self_cause': "Vanessa's own decision to leave Miso tied up and go to the meeting caused the event and serves as a major source of her guilt and self-hatred.",
    'goal_incongruence': "Vanessa's intention was to protect Miso. The outcome directly conflicts with that primary goal.",
    'unacceptable_consequences': "The consequences of Miso being terrified and possibly harmed feel unbearable to her.",
    'self_control': "Vanessa had control over her decision to leave Miso tied up and go to the meeting, which amplifies her guilt and self-blame.",
    'unpredictability_of_event': "Vanessa was not expecting Miso to get hurt and this surprising event is a major source of her trauma and guilt."
};

function demoRationaleInputAnimation() {
    const cursor = tourState.virtualCursor;
    if (!cursor) {
        tourState.animationFinished = true;
        checkAdvanceCondition();
        return;
    }

    const items = Array.from(document.querySelectorAll('.appraisal-item'));
    if (items.length === 0) {
        tourState.animationFinished = true;
        checkAdvanceCondition();
        return;
    }

    let itemIndex = 0;

    function processNextItem() {
        if (itemIndex >= items.length) {
            // All inputs done
            tourState.animationFinished = true;
            checkAdvanceCondition();
            return;
        }

        const item = items[itemIndex];
        const dimension = item.dataset.dimension;
        const rationaleText = DEMO_RATIONALES[dimension];
        const textarea = item.querySelector('.appraisal-rationale-input');

        if (!rationaleText || !textarea) {
            itemIndex++;
            processNextItem();
            return;
        }

        // Scroll item into view if needed
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Move cursor to textarea
        setTimeout(() => {
            const rect = textarea.getBoundingClientRect();
            cursor.style.left = `${rect.left + 20}px`; // Start a bit inside
            cursor.style.top = `${rect.top + 15}px`;
            cursor.classList.remove('scrolling', 'dragging');

            // Click
            setTimeout(() => {
                cursor.classList.add('clicking');
                setTimeout(() => {
                    cursor.classList.remove('clicking');
                    textarea.focus();

                    // Type text
                    typeTextEffect(textarea, rationaleText, () => {
                        // After typing, move to next
                        itemIndex++;
                        setTimeout(processNextItem, 500);
                    });
                }, 200);
            }, 600); // Wait for cursor move
        }, 600); // Wait for scroll
    }

    processNextItem();
}

function typeTextEffect(element, text, callback) {
    let i = 0;
    element.value = '';

    // Typing speed: 10ms per char for demo speed (fast typing)
    const interval = setInterval(() => {
        element.value += text.charAt(i);
        // Trigger input event to update model
        element.dispatchEvent(new Event('input', { bubbles: true }));
        i++;
        if (i >= text.length) {
            clearInterval(interval);
            if (callback) callback();
        }
    }, 5);
}


// Animate dialogue rating selection for tour
function animateDialogueRatingsForTour() {
    setTourNextButtonEnabled(false);
    const cursor = tourState.virtualCursor;
    if (!cursor) {
        // Fallback: advance tour if cursor not available
        tourState.stepIndex += 1;
        showTourStep();
        return;
    }

    // Ensure cursor is visible
    cursor.style.display = 'block';
    cursor.classList.remove('scrolling', 'dragging');

    // Define ratings: realism=4, persona=3, bdi=5, appraisals=5
    const ratings = [
        { category: 'realism', value: 4 },
        { category: 'persona', value: 3 },
        { category: 'bdi', value: 5 },
        { category: 'appraisals', value: 5 }
    ];

    let ratingIndex = 0;

    function selectNextRating() {
        if (ratingIndex >= ratings.length) {
            // All ratings selected
            tourState.animationFinished = true;
            checkAdvanceCondition();
            return;
        }

        const { category, value } = ratings[ratingIndex];
        const container = document.getElementById(`rating-${category}`);
        const stars = container?.querySelectorAll('.star');

        if (!container || !stars || stars.length === 0) {
            // Skip if not found, advance to next rating
            ratingIndex++;
            setTimeout(selectNextRating, 200);
            return;
        }

        // Find the target star (the one with data-value matching the rating)
        const targetStar = Array.from(stars).find(star =>
            parseInt(star.getAttribute('data-value')) === value
        );

        if (!targetStar) {
            // Skip if target star not found
            ratingIndex++;
            setTimeout(selectNextRating, 200);
            return;
        }

        // Get position of target star
        const starRect = targetStar.getBoundingClientRect();
        const starCenterX = starRect.left + starRect.width / 2;
        const starCenterY = starRect.top + starRect.height / 2;

        // Move cursor to star position
        cursor.style.left = `${starCenterX}px`;
        cursor.style.top = `${starCenterY}px`;
        cursor.classList.remove('scrolling', 'dragging', 'clicking');

        // Wait for cursor to move to position, then add clicking class and click
        setTimeout(() => {
            // Add clicking class now that cursor is at position
            cursor.classList.add('clicking');

            // Brief pause, then click the star
            setTimeout(() => {
                // Click the star
                targetStar.click();

                // Remove clicking class after click
                setTimeout(() => {
                    cursor.classList.remove('clicking');

                    // Move to next rating
                    ratingIndex++;
                    setTimeout(selectNextRating, 500);
                }, 200);
            }, 150);
        }, 300);
    }

    // First, scroll to the rating items grid to ensure the interface is visible
    const ratingSection = document.getElementById('dialogue-rating-section');
    if (ratingSection) {
        // Find the specific grid of rating items
        const ratingGrid = ratingSection.querySelector('.rating-items-grid');
        const targetElement = ratingGrid || ratingSection;

        cursor.classList.remove('scrolling', 'clicking', 'dragging');

        // Scroll to ensure the rating interface is fully visible
        // Using scrollIntoView to guarantee the entire grid is shown
        // Scroll to ensure the rating interface is fully visible
        // Manual Scroll: Align Top with 150px Buffer
        const rect = targetElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetTop = rect.top + scrollTop - 150;

        window.scrollTo({
            top: targetTop,
            behavior: 'smooth'
        });

        // Wait for scroll to complete before starting rating selection
        setTimeout(() => {
            // Start selecting ratings after scroll completes
            setTimeout(selectNextRating, 300);
        }, 800);
    } else {
        // Start selecting ratings immediately if section not found
        setTimeout(selectNextRating, 300);
    }
}

function tourNext() {
    if (tourState.stepIndex < tourState.steps.length - 1) {
        const currentStep = tourState.steps[tourState.stepIndex];

        // For other steps, advance normally
        tourState.stepIndex += 1;
        showTourStep();
    } else {
        endTour();
    }
}

function tourPrev() {
    if (tourState.stepIndex > 0) {
        const currentStep = tourState.steps[tourState.stepIndex];
        const previousStepIndex = tourState.stepIndex - 1;
        const previousStep = tourState.steps[previousStepIndex];

        // If going back from ranking step to appraisal selection step,
        // reset the appraisal selections so the demo can be replayed properly
        if (currentStep && currentStep.selector === '#selected-appraisals') {
            // Check if we're going back to step 2 (appraisals-section)
            if (previousStep && previousStep.selector === '#appraisals-section') {
                // Reset appraisal selections
                selectedCoarseAppraisals = [];
                selectedAppraisals = [];
                appraisalPhase = 1;

                // Update the UI to reflect the reset
                renderAppraisalOptions();
                renderSelectedAppraisals();
                updateAppraisalOptions();
            }
        }

        tourState.stepIndex -= 1;
        showTourStep();
    }
}

function endTour() {
    if (tourState.activeTarget) {
        tourState.activeTarget.classList.remove('tour-target-active');
        tourState.activeTarget = null;
    }
    if (tourState.overlay) tourState.overlay.remove();
    if (tourState.highlight) tourState.highlight.remove();
    if (tourState.tooltip) tourState.tooltip.remove();
    if (tourState.virtualCursor) {
        tourState.virtualCursor.style.display = 'none';
        tourState.virtualCursor.classList.remove('clicking', 'scrolling');
        tourState.virtualCursor.remove();
    }
    window.removeEventListener('resize', positionTour);
    window.removeEventListener('scroll', positionTour, true);

    // Remove scroll and interaction prevention handlers
    if (tourState.scrollPrevention) {
        window.removeEventListener('wheel', tourState.scrollPrevention);
        window.removeEventListener('touchmove', tourState.scrollPrevention);
        tourState.scrollPrevention = null;
    }

    // Cleanup global interaction blockers
    if (tourState.interactionPrevention) {
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keypress', 'keyup'].forEach(evt => {
            window.removeEventListener(evt, tourState.interactionPrevention, true);
        });

        // Remove overlay handlers
        if (tourState.overlay) {
            tourState.overlay.removeEventListener('click', tourState.interactionPrevention);
            tourState.overlay.removeEventListener('mousedown', tourState.interactionPrevention);
            tourState.overlay.removeEventListener('mouseup', tourState.interactionPrevention);
            tourState.overlay.removeEventListener('contextmenu', tourState.interactionPrevention);
        }

        tourState.interactionPrevention = null;
    }

    // Clean up countdown timer if active
    if (tourState.countdownInterval) {
        clearInterval(tourState.countdownInterval);
        tourState.countdownInterval = null;
    }

    // Stop and clear audio if playing
    if (tourState.audio) {
        tourState.audio.pause();
        tourState.audio = null;
    }

    localStorage.setItem(STORAGE_KEYS.TOUR_SEEN, '1');

    // Sync tour seen status to Firebase
    if (firebaseStorage && currentUsername) {
        console.log('Syncing tour completion to Firebase');
        const userId = firebaseStorage.getCustomUserId() || firebaseStorage.currentUser?.uid;
        if (userId) {
            firebaseStorage.db.collection('users').doc(userId).update({
                tour_seen: true
            }).catch(err => console.warn('Failed to sync tour status to Firebase:', err));
        }
    }

    tourState.overlay = null;
    tourState.highlight = null;
    tourState.tooltip = null;
    tourState.virtualCursor = null;

    // Automatically load the first assigned entry after demo tour ends
    if (assignedDialogues.length > 0 && allDialogues.length > 0) {
        // Find the first assigned dialogue in allDialogues
        const firstAssignedId = assignedDialogues[0];
        const firstAssignedIndex = allDialogues.findIndex(d => d.entry_id === firstAssignedId);

        if (firstAssignedIndex !== -1) {
            // Set the dialogue selector and load it
            dialogueSelect.value = firstAssignedIndex;
            handleDialogueChange().then(() => {
                // Show notification after dialogue is loaded
                showStatus('Demo tour completed! Start annotating your assigned dialogues.', 'success', 5000);
            });
        }
    }
}

// Load all dialogues from JSON file
async function loadDialogues() {
    try {
        const response = await fetch('data/eval_data.json');
        const data = await response.json();

        console.log(`📊 Loading ${Object.keys(data).length} evaluation dialogues...`);

        // Transform dictionary format to array format expected by frontend
        allDialogues = [];
        for (const [entryId, entryData] of Object.entries(data)) {
            // Transform dialogue_history: convert "content" to "utterance"
            const transformedHistory = (entryData.dialogue_history || []).map(turn => ({
                speaker: turn.speaker.toLowerCase(), // Convert "Patient"/"Therapist" to lowercase
                utterance: turn.content
            }));

            const dialogue = {
                'entry_id': entryId,
                'dialogue_history': transformedHistory,
                'situation': entryData.situation || '',
                'thought': entryData.thought || ''
            };

            // Include persona_profile if available
            if (entryData.persona_profile) {
                dialogue['persona_profile'] = entryData.persona_profile;
            }

            // Extract ground truth from BDI and cognitive appraisals
            if (entryData.bdi || entryData.cogapp_dims) {
                dialogue['ground_truth'] = {
                    belief: entryData.bdi?.belief?.content || '',
                    desire: entryData.bdi?.desire?.content || '',
                    intention: entryData.bdi?.intention?.content || '',
                    cognitive_appraisals: (entryData.cogapp_dims || [])
                        .sort((a, b) => a.rank - b.rank) // Sort by rank
                        .slice(0, 5) // Top 5
                        .map(dim => dim.appraisal_name)
                };
            }

            allDialogues.push(dialogue);
        }

        console.log(`Loaded ${allDialogues.length} dialogues with ground truth`);

        // Load assigned dialogues for current user if logged in (existing logic)
    } catch (error) {
        console.error('Error loading dialogues:', error);
    }
}

// Global state for agreement mode
let isAgreementMode = false;

// Load agreement data
async function loadAgreementData() {
    try {
        const response = await fetch('data/agreement_data.json');
        const data = await response.json();

        console.log(`📊 Loading ${Object.keys(data).length} agreement dialogues...`);

        allDialogues = [];
        for (const [entryId, entryData] of Object.entries(data)) {
            // Transform dialogue_history
            const transformedHistory = (entryData.dialogue_history || []).map(turn => ({
                speaker: turn.speaker.toLowerCase(),
                utterance: turn.content
            }));

            const dialogue = {
                'entry_id': entryId,
                'dialogue_history': transformedHistory,
                'situation': entryData.situation || '',
                'thought': entryData.thought || ''
            };

            if (entryData.persona_profile) {
                dialogue['persona_profile'] = entryData.persona_profile;
            }

            if (entryData.bdi || entryData.cogapp_dims) {
                dialogue['ground_truth'] = {
                    belief: entryData.bdi?.belief?.content || '',
                    desire: entryData.bdi?.desire?.content || '',
                    intention: entryData.bdi?.intention?.content || '',
                    cognitive_appraisals: (entryData.cogapp_dims || [])
                        .sort((a, b) => a.rank - b.rank)
                        .slice(0, 5)
                        .map(dim => dim.appraisal_name)
                };
            }

            allDialogues.push(dialogue);
        }

        console.log(`Loaded ${allDialogues.length} agreement dialogues`);
        return true;
    } catch (error) {
        console.error('Error loading agreement data:', error);
        alert('Failed to load agreement data. Please clean cache and try again.');
        return false;
    }
}

async function toggleAgreementMode() {
    const btn = document.getElementById('load-agreement-btn');

    if (!isAgreementMode) {
        // Switch TO Agreement Mode
        const success = await loadAgreementData();
        if (success) {
            isAgreementMode = true;
            btn.classList.add('btn-warning'); // Visual indicator
            btn.textContent = "❌ Exit Agreement Mode";

            // Re-render dropdown
            populateDialogueSelector();

            // Load first dialogue
            if (allDialogues.length > 0) {
                dialogueSelect.value = 0;
                loadDialogue(0);
            }

            alert("Agreement Mode Enabled: Loading data from agreement_data.json");
        }
    } else {
        // Switch OUT OF Agreement Mode (Reload page/app logic)
        isAgreementMode = false;
        btn.classList.remove('btn-warning');
        btn.textContent = "📊 Agreement Annotation";

        // Reload original dialogues
        await loadDialogues(); // This reloads eval_data.json

        if (currentUsername && firebaseReady) {
            await loadAssignedDialogues();
        }

        // Setup dropdown for regular mode
        populateDialogueSelector();

        // Reset view
        document.getElementById('dialogue-container').innerHTML = '<p class="placeholder">Select a dialogue to start.</p>';
        document.getElementById('current-dialogue-info').textContent = '';

        alert("Exited Agreement Mode. Restored evaluation data.");
    }
}
// End of toggleAgreementMode


// Load assigned dialogues for current user
async function loadAssignedDialogues() {
    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        assignedDialogues = await firebaseStorage.getAssignedDialogues();
        console.log(`📋 Loaded ${assignedDialogues.length} assigned dialogues for ${currentUsername}`);
    } catch (error) {
        console.error('Error loading assigned dialogues:', error);
        assignedDialogues = [];
    }
}

// Load example entry as demo
async function startDemoTour() {
    await loadDemoEntry();
    startTour(true);
}

async function loadDemoEntry() {
    try {
        const response = await fetch('data/example_entry.json');
        const data = await response.json();

        // Get the first (and only) entry
        const entryId = Object.keys(data)[0];
        const entryData = data[entryId];

        // Transform dialogue_history: convert "content" to "utterance"
        const transformedHistory = (entryData.dialogue_history || []).map(turn => ({
            speaker: turn.speaker.toLowerCase(), // Convert "Patient"/"Therapist" to lowercase
            utterance: turn.content
        }));

        const dialogue = {
            'entry_id': entryId,
            'dialogue_history': transformedHistory,
            'situation': entryData.situation || '',
            'thought': entryData.thought || ''
        };

        // Include persona_profile if available
        if (entryData.persona_profile) {
            dialogue['persona_profile'] = entryData.persona_profile;
        }

        // Extract ground truth from BDI and cognitive appraisals
        if (entryData.bdi || entryData.cogapp_dims) {
            dialogue['ground_truth'] = {
                belief: entryData.bdi?.belief?.content || '',
                desire: entryData.bdi?.desire?.content || '',
                intention: entryData.bdi?.intention?.content || '',
                cognitive_appraisals: (entryData.cogapp_dims || [])
                    .sort((a, b) => a.rank - b.rank) // Sort by rank
                    .slice(0, 5) // Top 5
                    .map(dim => dim.appraisal_name)
            };
        }

        // Set as current dialogue and load it
        currentDialogue = dialogue;
        currentTurnIndex = 0;
        minContextTurnIndex = null;
        modifiedUtterances = {};
        originalAppraisals = [];

        // Update dialogue info
        updateDialogueInfo();

        // Display persona information
        displayPersonaInfo();

        // Clear and reset
        dialogueContainer.innerHTML = '';
        clearAnnotations();
        clearDialogueRatings();

        // Load ground truth first (pre-populate)
        loadGroundTruth();

        // Automatically show exploration phase turns
        showExplorationTurns();

        // Show dialogue rating section
        showDialogueRatingSection();

        // Enable annotation inputs immediately
        enableAnnotationInputs();

        // Enable controls
        saveBtn.disabled = false;

        updateDialogueProgress();

        // Reset dialogue selector to show demo is loaded
        dialogueSelect.value = '';

        console.log('📚 Demo entry loaded:', entryId);
    } catch (error) {
        console.error('Error loading demo entry:', error);
        showStatus('Error loading demo entry. Make sure data/example_entry.json exists.', 'error');
    }
}

// Sample N dialogues without replacement
async function sampleDialogues(n, excludeIds = []) {
    try {
        // Ensure dialogues are loaded
        if (allDialogues.length === 0) {
            console.error('Cannot sample dialogues: allDialogues is empty!');
            throw new Error('Dialogues not loaded. Please refresh the page.');
        }

        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        // Get all already assigned dialogues to avoid duplicates
        const alreadyAssigned = await firebaseStorage.getAllAssignedDialogues();

        // Filter out dialogues that are:
        // 1. Already in the annotated_id_list.json
        // 2. Already assigned to ongoing annotation tasks
        // 3. In the excludeIds parameter
        const availableDialogues = allDialogues.filter(d => {
            const isAnnotated = isInAnnotatedList(d.entry_id);
            const isAssigned = alreadyAssigned.includes(d.entry_id);
            const isExcluded = excludeIds.includes(d.entry_id);

            return !isAnnotated && !isAssigned && !isExcluded;
        });

        const annotatedCount = allDialogues.filter(d => isInAnnotatedList(d.entry_id)).length;
        console.log(`🎲 Sampling ${n} from ${availableDialogues.length} available dialogues (${alreadyAssigned.length} already assigned, ${annotatedCount} in annotated list)`);

        if (availableDialogues.length < n) {
            console.warn(`⚠️ Only ${availableDialogues.length} dialogues available, requested ${n}`);
        }

        if (availableDialogues.length === 0) {
            throw new Error('No available dialogues to assign. All dialogues may be already assigned.');
        }

        // Shuffle and take first n
        const shuffled = availableDialogues.sort(() => Math.random() - 0.5);
        const sampled = shuffled.slice(0, Math.min(n, shuffled.length));

        return sampled.map(d => d.entry_id);
    } catch (error) {
        console.error('Error sampling dialogues:', error);
        throw error; // Re-throw to let caller handle it
    }
}

// Load cognitive appraisal dimensions from JSON file
async function loadCognitiveDimensions() {
    try {
        const response = await fetch('data/cognitive_dimensions_hierchical.json');
        cognitiveDimensions = await response.json();
        renderAppraisalOptions();
    } catch (error) {
        console.error('Error loading cognitive dimensions:', error);
        showStatus('Error loading cognitive dimensions', 'error');
    }
}

// Load annotated ID list from JSON file
async function loadAnnotatedIdList() {
    try {
        const response = await fetch('data/annotated_id_list.json');
        annotatedIdList = await response.json();
        console.log(`📋 Loaded ${annotatedIdList.length} annotated IDs from annotated_id_list.json`);
    } catch (error) {
        console.error('Error loading annotated ID list:', error);
        // Don't show error to user - just log it, as this is optional
        annotatedIdList = [];
    }
}

// Check if a dialogue ID is in the annotated list
// Handles both exact matches and IDs with "||" suffix
function isInAnnotatedList(entryId) {
    if (!annotatedIdList || annotatedIdList.length === 0) {
        return false;
    }

    // Check for exact match
    if (annotatedIdList.includes(entryId)) {
        return true;
    }

    // Check if entryId matches the base part (before "||") of any annotated ID
    for (const annotatedId of annotatedIdList) {
        // Extract base ID (before "||" if present)
        const baseId = annotatedId.split('||')[0];
        if (baseId === entryId || annotatedId === entryId) {
            return true;
        }
    }

    return false;
}

// Check annotation progress
let annotationStatus = {};

async function checkAnnotationProgress() {
    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    let annotatedCount = 0;

    let totalToAnnotate = allDialogues.length;

    try {
        const collectionName = isAgreementMode ? 'agreement_annotations' : 'annotations';
        const annotatedDialogues = await firebaseStorage.getUserAnnotations(collectionName);

        // Check annotation status for all dialogues
        for (let i = 0; i < allDialogues.length; i++) {
            const dialogue = allDialogues[i];
            const isAnnotated = annotatedDialogues.includes(dialogue.entry_id);
            annotationStatus[dialogue.entry_id] = isAnnotated;

            // Only count if it's in the user's assigned dialogues (unless in agreement mode)
            if (isAnnotated) {
                if (isAgreementMode) {
                    // In agreement mode, count all annotated agreement dialogues
                    annotatedCount++;
                } else if (assignedDialogues.length === 0 || assignedDialogues.includes(dialogue.entry_id)) {
                    // In regular mode, only count if assigned
                    annotatedCount++;
                }
            }
        }

        // Show progress relative to assigned dialogues
        // Show progress relative to assigned dialogues (or all in agreement mode)
        if (isAgreementMode) {
            totalToAnnotate = allDialogues.length;
        } else {
            totalToAnnotate = assignedDialogues.length > 0 ? assignedDialogues.length : allDialogues.length;
        }
        console.log(`📊 Progress: ${annotatedCount}/${totalToAnnotate} dialogues annotated`);
    } catch (error) {
        console.error('Error checking progress:', error);
    }

    // Update progress bar using assigned dialogues only
    updateProgressBar(annotatedCount, totalToAnnotate);
}

function updateProgressBar(completed, total) {
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressBar = document.getElementById('progress-bar');
    const progressBarText = document.getElementById('progress-bar-text');
    const progressText = document.getElementById('progress-text');

    if (progressBar && progressBarText) {
        progressBar.style.width = percentage + '%';
        progressBarText.textContent = percentage + '%';
    }

    if (progressText) {
        progressText.textContent = `Progress: ${completed} / ${total} dialogues annotated`;
    }
}

async function findFirstUnannotatedDialogue() {
    for (let i = 0; i < allDialogues.length; i++) {
        const dialogue = allDialogues[i];

        // Only consider dialogues that are assigned to the current user
        // But in Agreement Mode, ignore assignments and check all loaded dialogues
        if (!isAgreementMode && assignedDialogues.length > 0 && !assignedDialogues.includes(dialogue.entry_id)) {
            continue; // Skip dialogues not assigned to this user (regular mode only)
        }

        if (!annotationStatus[dialogue.entry_id]) {
            return i; // Return index in allDialogues array
        }
    }
    return -1; // All assigned dialogues annotated
}

// Populate dialogue selector dropdown
function populateDialogueSelector() {
    dialogueSelect.innerHTML = '<option value="">-- Select a Dialogue --</option>';

    // Only show assigned dialogues if user is logged in and has assignments
    let dialoguesToShow = allDialogues;

    if (isAgreementMode) {
        // In agreement mode, show all loaded agreement dialogues
        console.log(`📊 Showing all ${allDialogues.length} agreement dialogues`);
    } else if (currentUsername) {
        if (assignedDialogues.length > 0) {
            // Filter to show only assigned dialogues
            dialoguesToShow = allDialogues.filter(d => assignedDialogues.includes(d.entry_id));
            console.log(`📊 Showing ${dialoguesToShow.length} assigned dialogues for ${currentUsername}`);
        } else {
            // User is logged in but has no assignments (shouldn't happen, but defensive)
            console.warn(`⚠️ User ${currentUsername} has no assigned dialogues!`);
            dialoguesToShow = [];
        }
    } else {
        // No user logged in - show all dialogues (shouldn't reach here in normal flow)
        console.log(`📊 Showing all ${allDialogues.length} dialogues (no user logged in)`);
    }

    if (dialoguesToShow.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '-- No dialogues assigned --';
        option.disabled = true;
        dialogueSelect.appendChild(option);
        return;
    }

    dialoguesToShow.forEach((dialogue, displayIndex) => {
        const option = document.createElement('option');
        // Store actual index in allDialogues array
        const actualIndex = allDialogues.findIndex(d => d.entry_id === dialogue.entry_id);
        option.value = actualIndex;
        const isAnnotated = annotationStatus[dialogue.entry_id];
        const marker = isAnnotated ? '✓ ' : '';
        option.textContent = `${marker}${dialogue.entry_id} (${dialogue.dialogue_history.length} turns)`;
        dialogueSelect.appendChild(option);
    });
}

// Render cognitive appraisal options
function renderAppraisalOptions() {
    // Combined single-stage rendering: show categories with their dimensions
    renderCombinedAppraisalOptions();
}

// Combined single-stage rendering: categories with dimensions revealed on selection
function renderCombinedAppraisalOptions() {
    appraisalOptionsContainer.innerHTML = '';

    // Add instruction text
    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'appraisal-phase-instruction';
    const selectedCount = selectedAppraisals.length;
    const remaining = MAX_APPRAISALS - selectedCount;
    let statusText = '';
    if (selectedCount === 0) {
        statusText = `Select ${MAX_APPRAISALS} appraisals`;
    } else if (selectedCount < MAX_APPRAISALS) {
        statusText = `${selectedCount} selected, ${remaining} more needed`;
    } else {
        statusText = `✓ All ${MAX_APPRAISALS} selected - drag to reorder`;
    }
    instructionDiv.innerHTML = `<strong>Select Cognitive Appraisals</strong>Click categories to reveal their dimensions. Click selected dimensions again to remove them. <span style="background: rgba(255,255,255,0.25); padding: 3px 10px; border-radius: 12px; margin-left: 8px;">${statusText}</span>`;
    appraisalOptionsContainer.appendChild(instructionDiv);

    // Render each coarse category with its dimensions
    Object.keys(cognitiveDimensions).forEach(categoryName => {
        const categoryData = cognitiveDimensions[categoryName];
        const isCategorySelected = selectedCoarseAppraisals.includes(categoryName);

        // Create category container
        const categoryContainer = document.createElement('div');
        categoryContainer.className = 'appraisal-category-container';
        categoryContainer.dataset.category = categoryName;

        // Create category option (clickable header)
        const categoryOption = document.createElement('div');
        categoryOption.className = 'appraisal-option coarse-option';
        if (isCategorySelected) {
            categoryOption.classList.add('selected');
        }
        categoryOption.dataset.key = categoryName;
        categoryOption.title = categoryName;

        // Category description
        const descDiv = document.createElement('div');
        descDiv.className = 'appraisal-option-desc';
        descDiv.textContent = categoryData.description;

        categoryOption.appendChild(descDiv);
        categoryOption.addEventListener('click', () => toggleCoarseAppraisal(categoryName, categoryOption, categoryContainer));

        categoryContainer.appendChild(categoryOption);

        // Create dimensions container (hidden by default, shown when category is selected)
        const dimensionsContainer = document.createElement('div');
        dimensionsContainer.className = 'appraisal-dimensions-container';
        dimensionsContainer.style.display = isCategorySelected ? 'grid' : 'none';

        // Render fine-grained dimensions for this category
        categoryData.dimensions.forEach(dimensionObj => {
            const dimensionKey = Object.keys(dimensionObj)[0];
            const dimensionDesc = Object.values(dimensionObj)[0];

            // Check if this dimension is already selected
            const isDimensionSelected = selectedAppraisals.some(a => a.dimension === dimensionKey);

            const dimensionOption = document.createElement('div');
            dimensionOption.className = 'appraisal-option fine-option';
            if (isDimensionSelected) {
                dimensionOption.classList.add('selected');
            }
            dimensionOption.dataset.key = dimensionKey;
            dimensionOption.dataset.category = categoryName;
            dimensionOption.title = `${categoryName}`;

            // Dimension name and description
            const nameDiv = document.createElement('div');
            nameDiv.className = 'appraisal-option-name';
            nameDiv.textContent = dimensionKey.replace(/_/g, ' ');

            const descDiv2 = document.createElement('div');
            descDiv2.className = 'appraisal-option-desc';
            descDiv2.textContent = dimensionDesc;

            dimensionOption.appendChild(nameDiv);
            dimensionOption.appendChild(descDiv2);
            dimensionOption.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent bubbling to parent category
                addAppraisal(dimensionKey, dimensionDesc, categoryName);
            });

            dimensionsContainer.appendChild(dimensionOption);
        });

        categoryContainer.appendChild(dimensionsContainer);
        appraisalOptionsContainer.appendChild(categoryContainer);
    });

    updateAppraisalOptions();

    // Update tour highlight if we're in tour mode
    if (tourState.stepIndex !== undefined && tourState.steps && tourState.stepIndex < tourState.steps.length) {
        const currentStep = tourState.steps[tourState.stepIndex];
        if (currentStep?.selector === '#appraisals-section') {
            setTimeout(() => {
                positionTour();
            }, 150);
        }
    }
}

// Phase 2: Render fine-grained appraisal dimensions from selected coarse categories
function renderFineAppraisalOptions() {
    appraisalOptionsContainer.innerHTML = '';

    // Add instruction text with back button
    const headerDiv = document.createElement('div');
    headerDiv.className = 'appraisal-phase-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'phase-back-btn';
    backBtn.textContent = '← Back to Categories';
    backBtn.addEventListener('click', returnToCoarseSelection);
    headerDiv.appendChild(backBtn);

    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'appraisal-phase-instruction';
    const selectedCount = selectedAppraisals.length;
    const remaining = MAX_APPRAISALS - selectedCount;
    let statusText = '';
    if (selectedCount === 0) {
        statusText = `Select ${MAX_APPRAISALS} appraisals`;
    } else if (selectedCount < MAX_APPRAISALS) {
        statusText = `${selectedCount} selected, ${remaining} more needed`;
    } else {
        statusText = `✓ All ${MAX_APPRAISALS} selected - drag to reorder`;
    }
    instructionDiv.innerHTML = `<strong>Phase 2: Select Fine-Grained Appraisals</strong>Choose exactly ${MAX_APPRAISALS} specific appraisals from the categories below. <span style="background: rgba(255,255,255,0.25); padding: 3px 10px; border-radius: 12px; margin-left: 8px;">${statusText}</span>`;
    headerDiv.appendChild(instructionDiv);

    appraisalOptionsContainer.appendChild(headerDiv);

    // Create a single container for all dimensions (no category grouping)
    const allDimensionsContainer = document.createElement('div');
    allDimensionsContainer.className = 'fine-dimensions-grid';

    // Render fine-grained dimensions from all selected coarse categories
    selectedCoarseAppraisals.forEach(categoryName => {
        const categoryData = cognitiveDimensions[categoryName];

        // Render each fine dimension in this category
        categoryData.dimensions.forEach(dimensionObj => {
            const dimensionKey = Object.keys(dimensionObj)[0];
            const dimensionDesc = Object.values(dimensionObj)[0];

            const option = document.createElement('div');
            option.className = 'appraisal-option fine-option';
            option.dataset.key = dimensionKey;
            option.dataset.category = categoryName;
            option.title = `${categoryName}`; // Show category on hover

            // Show dimension name and description
            const nameDiv = document.createElement('div');
            nameDiv.className = 'appraisal-option-name';
            nameDiv.textContent = dimensionKey.replace(/_/g, ' ');

            const descDiv = document.createElement('div');
            descDiv.className = 'appraisal-option-desc';
            descDiv.textContent = dimensionDesc;

            option.appendChild(nameDiv);
            option.appendChild(descDiv);
            option.addEventListener('click', () => addAppraisal(dimensionKey, dimensionDesc, categoryName));
            allDimensionsContainer.appendChild(option);
        });
    });

    appraisalOptionsContainer.appendChild(allDimensionsContainer);

    updateAppraisalOptions();

    // Update tour highlight if we're in tour mode and on the appraisal selection step
    if (tourState.stepIndex !== undefined && tourState.steps && tourState.stepIndex < tourState.steps.length) {
        const currentStep = tourState.steps[tourState.stepIndex];
        if (currentStep?.selector === '#appraisals-section') {
            // Wait for DOM to fully update, then update highlight
            setTimeout(() => {
                positionTour();
            }, 150);
        }
    }
}

// Toggle selection of a coarse-grained category and show/hide its dimensions
function toggleCoarseAppraisal(categoryName, optionElement, categoryContainer) {
    const index = selectedCoarseAppraisals.indexOf(categoryName);
    const dimensionsContainer = categoryContainer ? categoryContainer.querySelector('.appraisal-dimensions-container') : null;

    if (index > -1) {
        // Deselect category
        selectedCoarseAppraisals.splice(index, 1);
        optionElement.classList.remove('selected');

        // Hide dimensions container
        if (dimensionsContainer) {
            dimensionsContainer.style.display = 'none';
        }

        // Remove any selected dimensions from this category from selectedAppraisals
        const categoryData = cognitiveDimensions[categoryName];
        categoryData.dimensions.forEach(dimensionObj => {
            const dimensionKey = Object.keys(dimensionObj)[0];
            const dimensionIndex = selectedAppraisals.findIndex(a => a.dimension === dimensionKey);
            if (dimensionIndex > -1) {
                selectedAppraisals.splice(dimensionIndex, 1);
            }
        });

        // Re-render selected appraisals display
        renderSelectedAppraisals();
    } else {
        // Select category
        selectedCoarseAppraisals.push(categoryName);
        optionElement.classList.add('selected');

        // Show dimensions container
        if (dimensionsContainer) {
            dimensionsContainer.style.display = 'grid';
        }
    }

    // Update instruction text
    updateAppraisalOptions();
}

// Update coarse phase UI elements without full re-render
function updateCoarsePhaseUI() {
    const instructionDiv = appraisalOptionsContainer.querySelector('.appraisal-phase-instruction');
    const continueBtn = appraisalOptionsContainer.querySelector('.phase-continue-btn');

    if (instructionDiv) {
        const selectedCount = selectedCoarseAppraisals.length;
        const countText = selectedCount > 0 ? ` (${selectedCount} selected)` : '';
        instructionDiv.innerHTML = `<strong>Phase 1: Select Categories</strong>Click all categories that are important to understanding the patient's reaction to the event.${countText}`;
    }

    if (continueBtn) {
        const btnText = selectedCoarseAppraisals.length === 0
            ? 'Select at least one category to continue'
            : `Continue to Fine Selection (${selectedCoarseAppraisals.length} categories) →`;
        continueBtn.innerHTML = btnText;
        continueBtn.disabled = selectedCoarseAppraisals.length === 0;
    }
}

// Proceed from coarse to fine selection
function proceedToFineSelection() {
    if (selectedCoarseAppraisals.length === 0) {
        showStatus('Please select at least one category', 'error');
        setTimeout(() => hideStatus(), 2000);
        return;
    }
    appraisalPhase = 2;
    renderAppraisalOptions();

    // Update tour highlight if we're in tour mode and on the fine selection step
    if (tourState.stepIndex !== undefined && tourState.steps && tourState.stepIndex < tourState.steps.length) {
        const currentStep = tourState.steps[tourState.stepIndex];
        if (currentStep?.selector === '#appraisal-options') {
            // Wait for DOM to update, then update highlight
            setTimeout(() => {
                positionTour();
            }, 100);
        }
    }
}

// Return from fine to coarse selection
function returnToCoarseSelection() {
    // Clear fine-grained selections when returning
    if (selectedAppraisals.length > 0) {
        if (!confirm('Going back will clear your fine-grained selections. Continue?')) {
            return;
        }
        selectedAppraisals = [];
        renderSelectedAppraisals();
    }
    appraisalPhase = 1;
    renderAppraisalOptions();
}

// Setup event listeners
function setupEventListeners() {
    dialogueSelect.addEventListener('change', handleDialogueChange);
    saveBtn.addEventListener('click', saveAnnotation);
    // Clear button removed - clearAnnotations() function kept for internal use

    // Setup demo button (load example + start tour)
    if (loadDemoBtn) {
        loadDemoBtn.addEventListener('click', startDemoTour);
    }

    // Setup collapsible sections
    setupCollapsibleSections();

    // Setup modal listeners
    setupModalListeners();

    // Setup dialogue rating listeners
    setupDialogueRatings();
}

// Setup modal event listeners
function setupModalListeners() {
    const confirmSaveBtn = document.getElementById('confirm-save');
    const confirmCancelBtn = document.getElementById('confirm-cancel');
    const modal = document.getElementById('confirm-modal');

    confirmSaveBtn.addEventListener('click', performSave);
    confirmCancelBtn.addEventListener('click', hideConfirmModal);

    // Close modal when clicking outside
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            hideConfirmModal();
        }
    });
}

// Setup collapsible section functionality
function setupCollapsibleSections() {
    const sectionHeaders = document.querySelectorAll('.section-header');
    sectionHeaders.forEach(header => {
        header.addEventListener('click', function () {
            const sectionId = this.getAttribute('data-section');
            const content = document.getElementById(`${sectionId}-content`);

            // Toggle collapsed state
            this.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        });
    });
}

// Setup dialogue rating star inputs
function setupDialogueRatings() {
    const ratingCategories = ['realism', 'persona', 'bdi', 'appraisals'];

    ratingCategories.forEach(category => {
        const container = document.getElementById(`rating-${category}`);
        const hiddenInput = document.getElementById(`rating-${category}-value`);
        if (!container || !hiddenInput) return;

        const stars = container.querySelectorAll('.star');

        // Click handler
        stars.forEach(star => {
            star.addEventListener('click', function () {
                const value = parseInt(this.getAttribute('data-value'));
                dialogueRatings[category] = value;
                hiddenInput.value = value;

                // Update star display
                updateStarDisplay(container, value);

                console.log(`📊 Dialogue rating - ${category}: ${value} stars`);
            });

            // Hover effect
            star.addEventListener('mouseenter', function () {
                const value = parseInt(this.getAttribute('data-value'));
                updateStarDisplay(container, value, true);
            });
        });

        // Reset hover effect on mouse leave
        container.addEventListener('mouseleave', function () {
            const currentValue = parseInt(hiddenInput.value) || 0;
            updateStarDisplay(container, currentValue);
        });
    });
}

// Update star display (filled/empty)
function updateStarDisplay(container, value, isHover = false) {
    const stars = container.querySelectorAll('.star');
    stars.forEach((star, index) => {
        const starValue = parseInt(star.getAttribute('data-value'));
        if (starValue <= value) {
            star.textContent = '★';
            if (isHover) {
                star.classList.add('hover');
                star.classList.remove('selected');
            } else {
                star.classList.add('selected');
                star.classList.remove('hover');
            }
        } else {
            star.textContent = '☆';
            star.classList.remove('hover', 'selected');
        }
    });
}

// Clear dialogue ratings
function clearDialogueRatings() {
    dialogueRatings = {
        realism: 0,
        persona: 0,
        bdi: 0,
        appraisals: 0
    };

    const ratingCategories = ['realism', 'persona', 'bdi', 'appraisals'];
    ratingCategories.forEach(category => {
        const container = document.getElementById(`rating-${category}`);
        const hiddenInput = document.getElementById(`rating-${category}-value`);
        if (container && hiddenInput) {
            hiddenInput.value = '0';
            updateStarDisplay(container, 0);
        }
    });
}

// Show dialogue rating section
function showDialogueRatingSection() {
    const section = document.getElementById('dialogue-rating-section');
    if (section) {
        section.style.display = 'block';
    }
}

// Hide dialogue rating section
function hideDialogueRatingSection() {
    const section = document.getElementById('dialogue-rating-section');
    if (section) {
        section.style.display = 'none';
    }
}

// Handle dialogue selection change
async function handleDialogueChange() {
    const selectedIndex = dialogueSelect.value;
    if (selectedIndex === '') {
        currentDialogue = null;
        dialogueContainer.innerHTML = '<p class="placeholder">Please select a dialogue to begin annotation.</p>';
        hidePersonaSection();
        saveBtn.disabled = true;
        return;
    }

    currentDialogue = allDialogues[selectedIndex];
    currentTurnIndex = 0;
    minContextTurnIndex = null; // Reset min context marker
    modifiedUtterances = {}; // Reset modified utterances
    originalAppraisals = []; // Reset original appraisals (will be set by loadGroundTruth)

    // Update dialogue info
    updateDialogueInfo();

    // Display persona information
    displayPersonaInfo();

    // Clear and reset
    dialogueContainer.innerHTML = '';
    clearAnnotations();
    clearDialogueRatings();

    // Load ground truth first (pre-populate)
    loadGroundTruth();

    // Try to load existing annotation (will override ground truth if exists)
    await loadExistingAnnotation();

    // Ensure appraisal options are rendered (coarse category phase should be displayed)
    renderAppraisalOptions();

    // Automatically show exploration phase turns
    showExplorationTurns();

    // Show dialogue rating section
    showDialogueRatingSection();

    // Enable annotation inputs immediately
    enableAnnotationInputs();

    // Enable controls
    saveBtn.disabled = false;

    updateDialogueProgress();
}

// Big Five trait mappings
const BIG_FIVE_TRAITS = {
    extraversion: ['extroverted', 'introverted'],
    agreeableness: ['agreeable', 'antagonistic'],
    conscientiousness: ['organized', 'careless'],
    neuroticism: ['emotionally stable', 'emotionally unstable'],
    openness: ['open-minded', 'conservative']
};

const BIG_FIVE_LABELS = {
    extraversion: 'Extraversion',
    agreeableness: 'Agreeableness',
    conscientiousness: 'Conscientiousness',
    neuroticism: 'Neuroticism',
    openness: 'Openness'
};

// Parse traits text to extract Big Five dimensions
function parseBigFiveTraits(traitsText) {
    if (!traitsText) return {};

    const traits = {};
    const lowerText = traitsText.toLowerCase();

    // Check each Big Five dimension
    for (const [dimension, values] of Object.entries(BIG_FIVE_TRAITS)) {
        for (const value of values) {
            if (lowerText.includes(value)) {
                traits[dimension] = capitalizeFirst(value);
                break;
            }
        }
    }

    return traits;
}

// Display persona information
function displayPersonaInfo() {
    const personaSection = document.getElementById('persona-section');

    if (!currentDialogue || !currentDialogue.persona_profile) {
        hidePersonaSection();
        return;
    }

    const profile = currentDialogue.persona_profile;

    // Update persona fields
    document.getElementById('persona-name').textContent = profile.name || 'N/A';
    document.getElementById('persona-gender').textContent = capitalizeFirst(profile.gender) || 'N/A';
    document.getElementById('persona-education').textContent = capitalizeFirst(profile.education) || 'N/A';
    document.getElementById('persona-occupation').textContent = capitalizeFirst(profile.occupation) || 'N/A';

    // Parse and display Big Five traits
    const bigFiveContainer = document.getElementById('persona-big-five');
    const bigFiveTraits = parseBigFiveTraits(profile.traits);

    if (Object.keys(bigFiveTraits).length > 0) {
        bigFiveContainer.innerHTML = '';

        // Create trait badges in a specific order
        const orderedDimensions = ['extraversion', 'agreeableness', 'conscientiousness', 'neuroticism', 'openness'];

        for (const dimension of orderedDimensions) {
            if (bigFiveTraits[dimension]) {
                const badge = document.createElement('div');
                badge.className = 'trait-badge';

                const label = document.createElement('span');
                label.className = 'trait-label';
                label.textContent = BIG_FIVE_LABELS[dimension] + ':';

                const value = document.createElement('span');
                value.className = 'trait-value';
                value.textContent = bigFiveTraits[dimension];

                badge.appendChild(label);
                badge.appendChild(value);
                bigFiveContainer.appendChild(badge);
            }
        }
    } else {
        bigFiveContainer.innerHTML = '<span class="trait-na">N/A</span>';
    }

    // Show the section
    personaSection.style.display = 'block';
}

// Hide persona section
function hidePersonaSection() {
    const personaSection = document.getElementById('persona-section');
    personaSection.style.display = 'none';
}

// Helper function to capitalize first letter
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Show all turns (exploration phase logic removed as strategies are not present)
function showExplorationTurns() {
    if (!currentDialogue || !currentDialogue.dialogue_history) {
        return;
    }

    dialogueContainer.innerHTML = '';
    let turnPairIndex = 0;
    const MAX_TURNS_TO_DISPLAY = 24; // Display up to 12th turn

    // Iterate through dialogue history in pairs, but limit to first 12 turns
    const totalTurns = currentDialogue.dialogue_history.length;
    const maxIndex = Math.min(totalTurns, MAX_TURNS_TO_DISPLAY);

    for (let i = 0; i < maxIndex; i += 2) {
        const turn1 = currentDialogue.dialogue_history[i];
        const turn2 = currentDialogue.dialogue_history[i + 1];

        // Create and append the turn pair
        if (turn1) {
            const turnPairElement = createTurnPairElement(turn1, turn2, i, turnPairIndex + 1);
            dialogueContainer.appendChild(turnPairElement);
            currentTurnIndex = (turn2) ? i + 2 : i + 1;
            turnPairIndex++;
        }
    }

    // Add ellipsis message if there are more turns beyond the 12th
    if (totalTurns > MAX_TURNS_TO_DISPLAY) {
        const omittedTurns = totalTurns - MAX_TURNS_TO_DISPLAY;
        const ellipsisDiv = document.createElement('div');
        ellipsisDiv.className = 'dialogue-ellipsis';
        ellipsisDiv.style.cssText = 'text-align: center; padding: 20px; color: #6b7280; font-style: italic; border-top: 2px dashed #e5e7eb; margin-top: 10px;';
        ellipsisDiv.textContent = `... (${omittedTurns} more turn${omittedTurns > 1 ? 's' : ''} omitted)`;
        dialogueContainer.appendChild(ellipsisDiv);
    }

    if (turnPairIndex === 0) {
        dialogueContainer.innerHTML = '<p class="placeholder">No turns found in this dialogue.</p>';
    } else {
        // Scroll to top to show first turn
        dialogueContainer.scrollTop = 0;
        console.log(`Showing ${turnPairIndex} turn pairs (${totalTurns > MAX_TURNS_TO_DISPLAY ? `first ${MAX_TURNS_TO_DISPLAY} of ${totalTurns}` : 'all'} turns)`);
    }
}

// BDI prefixes
const BDI_PREFIXES = {
    belief: 'I believe that',
    desire: 'I wish that',
    intention: 'I intend to'
};

// Strip prefix from BDI value
function stripPrefix(type, value) {
    if (!value) return '';
    const prefix = BDI_PREFIXES[type];
    if (value.startsWith(prefix)) {
        return value.substring(prefix.length).trim();
    }
    return value.trim();
}

// Add prefix to BDI value
function addPrefix(type, value) {
    if (!value) return '';
    const prefix = BDI_PREFIXES[type];
    const trimmed = value.trim();
    if (trimmed.startsWith(prefix)) {
        return trimmed; // Already has prefix
    }
    return `${prefix} ${trimmed}`;
}

// Mark the edited span between original and edited text
function markEditedSpan(original, edited) {
    if (original === edited) return edited;

    // Tokenize into words + whitespace to preserve spacing
    const tokenize = (text) => text.match(/\s+|[^\s]+/g) || [];
    const origTokens = tokenize(original);
    const editTokens = tokenize(edited);

    const m = origTokens.length;
    const n = editTokens.length;

    // LCS DP table
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (origTokens[i - 1] === editTokens[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find matching edited token indices
    const matchedEdited = new Set();
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (origTokens[i - 1] === editTokens[j - 1]) {
            matchedEdited.add(j - 1);
            i--; j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }

    // Build result with markers around every differing span
    let result = '';
    let inSpan = false;
    for (let k = 0; k < editTokens.length; k++) {
        const isMatch = matchedEdited.has(k);
        if (!isMatch && !inSpan) {
            result += '<|EDIT_START|>';
            inSpan = true;
        }
        if (isMatch && inSpan) {
            result += '<|EDIT_END|>';
            inSpan = false;
        }
        result += editTokens[k];
    }
    if (inSpan) result += '<|EDIT_END|>';

    return result;
}

// Remove edit markers from text
function stripEditMarkers(text) {
    if (!text) return '';
    return text.replace(/<\|EDIT_START\|>/g, '').replace(/<\|EDIT_END\|>/g, '');
}

// Count how many edit spans are present in a marked string
function countEditSpans(text) {
    if (!text) return 0;
    const matches = text.match(/<\|EDIT_START\|>/g);
    return matches ? matches.length : 0;
}

// Render text with edit markers into a DOM element
function renderMarkedText(container, text) {
    // Clear existing content
    container.innerHTML = '';

    // Split by markers, keep them as separate tokens
    const parts = text.split(/(<\|EDIT_START\|>|<\|EDIT_END\|>)/);
    let inEdit = false;

    parts.forEach(part => {
        if (part === '<|EDIT_START|>') {
            inEdit = true;
            return;
        }
        if (part === '<|EDIT_END|>') {
            inEdit = false;
            return;
        }
        if (!part) return;

        if (inEdit) {
            const span = document.createElement('span');
            span.className = 'utterance-edit-span';
            span.textContent = part;
            container.appendChild(span);
        } else {
            container.appendChild(document.createTextNode(part));
        }
    });
}

// Enable/disable annotation inputs
function enableAnnotationInputs() {
    beliefInput.disabled = false;
    desireInput.disabled = false;
    intentionInput.disabled = false;

    // Enable appraisal options
    const appraisalOptions = document.querySelectorAll('.appraisal-option');
    appraisalOptions.forEach(option => {
        option.classList.remove('input-disabled');
    });

    // Hide locked message
    const lockedMessage = document.getElementById('annotation-locked-message');
    if (lockedMessage) {
        lockedMessage.classList.add('hidden');
    }
}

// Update dialogue info display
function updateDialogueInfo() {
    const dialogueInfo = document.getElementById('current-dialogue-info');
    if (!currentDialogue) {
        dialogueInfo.textContent = '';
        return;
    }

    const totalTurnPairs = Math.ceil(currentDialogue.dialogue_history.length / 2);
    const isAnnotated = annotationStatus[currentDialogue.entry_id];
    const status = isAnnotated ? '✓ Annotated' : '○ Not annotated';

    dialogueInfo.innerHTML = `
        <span class="dialogue-id">Dialogue ID: ${currentDialogue.entry_id}</span>
        <span class="dialogue-stats">${totalTurnPairs} turn pairs</span>
        <span class="dialogue-status ${isAnnotated ? 'annotated' : 'pending'}">${status}</span>
    `;
}

// LocalStorage helper functions
async function getAnnotationFromStorage(entryId) {
    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    try {
        const collectionName = isAgreementMode ? 'agreement_annotations' : 'annotations';
        const annotation = await firebaseStorage.loadAnnotation(currentUsername, entryId, collectionName);
        return annotation;
    } catch (error) {
        console.error('Error loading annotation:', error);
        return null;
    }
}

async function saveAnnotationToStorage(entryId, annotation, collectionName = 'annotations') {
    // Ensure Firebase is initialized
    if (!firebaseReady) {
        const success = await initFirebaseStorage();
        if (!success) {
            throw new Error('Failed to initialize Firebase. Please refresh the page.');
        }
    }

    // Verify user is logged in
    if (!currentUsername) {
        throw new Error('User not logged in. Please login first.');
    }

    // Verify firebaseStorage is available
    if (!firebaseStorage) {
        throw new Error('Firebase Storage not available. Please refresh the page.');
    }

    try {
        await firebaseStorage.saveAnnotation(currentUsername, entryId, annotation, collectionName);
        console.log(`✅ Saved to Firebase (${collectionName}): ${entryId}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving annotation to storage:', error);
        // Re-throw with more context
        throw error;
    }
}

// Load ground truth and pre-populate annotation fields
function loadGroundTruth() {
    if (!currentDialogue || !currentDialogue.ground_truth) {
        console.log('⚠️ No ground truth available for this dialogue');
        return;
    }

    const gt = currentDialogue.ground_truth;
    console.log('🔄 Loading ground truth:', gt);

    // Pre-populate BDI fields (strip prefixes if they exist)
    if (gt.belief) {
        beliefInput.value = stripPrefix('belief', gt.belief);
        console.log('  ✓ Belief loaded:', beliefInput.value);
    }
    if (gt.desire) {
        desireInput.value = stripPrefix('desire', gt.desire);
        console.log('  ✓ Desire loaded:', desireInput.value);
    }
    if (gt.intention) {
        intentionInput.value = stripPrefix('intention', gt.intention);
        console.log('  ✓ Intention loaded:', intentionInput.value);
    }

    // Load cognitive appraisals from ground truth for reference only (do NOT pre-select)
    if (gt.cognitive_appraisals && Array.isArray(gt.cognitive_appraisals)) {
        selectedAppraisals = [];
        selectedCoarseAppraisals = []; // Reset coarse selections
        originalAppraisals = []; // Reset original appraisals

        console.log('  🧠 Loading appraisals (reference only):', gt.cognitive_appraisals);

        // Check if ground truth uses old format (array of strings) or new format (array of objects)
        if (gt.cognitive_appraisals.length > 0 && typeof gt.cognitive_appraisals[0] === 'string') {
            // Old format - convert dimension keys to hierarchical structure
            gt.cognitive_appraisals.forEach(dimensionKey => {
                // Search through hierarchical structure to find this dimension
                for (const [categoryName, categoryData] of Object.entries(cognitiveDimensions)) {
                    const dimension = categoryData.dimensions.find(d => Object.keys(d)[0] === dimensionKey);
                    if (dimension) {
                        const key = Object.keys(dimension)[0];
                        const description = Object.values(dimension)[0];
                        const appraisalObj = {
                            dimension: key,
                            description: description,
                            category: categoryName
                        };
                        // Store ground truth appraisals only as original reference; do NOT pre-populate UI
                        originalAppraisals.push(appraisalObj);
                        console.log(`    ✓ Loaded reference appraisal: ${key} (${categoryName})`);
                        return; // Found it, move to next
                    }
                }
                console.warn(`    ❌ Ground truth dimension "${dimensionKey}" not found in hierarchical structure`);
            });
        } else {
            // New format - already hierarchical objects
            originalAppraisals = JSON.parse(JSON.stringify(gt.cognitive_appraisals));
            console.log(`    ✓ Loaded ${originalAppraisals.length} hierarchical ground truth appraisals`);
        }

        console.log(`  ✓ Loaded ${originalAppraisals.length} ground truth appraisals for reference`);
        // Keep selectedAppraisals empty so annotators must actively choose their top-5
        appraisalPhase = 1; // Start in phase 1
        renderSelectedAppraisals();
        updateAppraisalOptions();
    } else {
        // No ground truth appraisals - reset original
        originalAppraisals = [];
        selectedCoarseAppraisals = [];
        appraisalPhase = 1;
    }

    console.log('Ground truth loaded and pre-populated successfully');
}

// Load existing annotation if available
async function loadExistingAnnotation() {
    try {
        const annotation = await getAnnotationFromStorage(currentDialogue.entry_id);

        if (annotation) {
            // Populate form fields (strip edit markers and prefixes when loading)
            // Support both new structure (annotated_bdi) and old structure (flat) for backward compatibility
            const bdi = annotation.annotated_bdi || annotation;
            beliefInput.value = stripPrefix('belief', stripEditMarkers(bdi.belief || ''));
            desireInput.value = stripPrefix('desire', stripEditMarkers(bdi.desire || ''));
            intentionInput.value = stripPrefix('intention', stripEditMarkers(bdi.intention || ''));

            // Populate cognitive appraisals (hierarchical)
            if (annotation.cognitive_appraisals) {
                selectedAppraisals = annotation.cognitive_appraisals;

                // Restore coarse categories if available, otherwise derive from fine selections
                if (annotation.coarse_appraisal_categories && Array.isArray(annotation.coarse_appraisal_categories)) {
                    selectedCoarseAppraisals = annotation.coarse_appraisal_categories;
                } else {
                    // Derive coarse categories from fine-grained selections
                    selectedCoarseAppraisals = [...new Set(selectedAppraisals
                        .map(a => a.category)
                        .filter(c => c))];
                }

                // When loading existing annotation, show coarse category phase first
                // User can proceed to fine selection if needed
                // If there are selected appraisals, we'll still show phase 1 but they'll be visible in selected-appraisals
                appraisalPhase = 1;

                // Store original appraisals from ground truth for comparison
                // NOTE: Ground truth may still use old flat structure
                const gt = currentDialogue?.ground_truth;
                if (gt && gt.cognitive_appraisals && Array.isArray(gt.cognitive_appraisals)) {
                    // Check if ground truth is array of strings (old format) or objects (new format)
                    if (typeof gt.cognitive_appraisals[0] === 'string') {
                        // Old format - convert dimension keys to objects
                        originalAppraisals = gt.cognitive_appraisals.map(dimensionKey => {
                            // Search through hierarchical structure to find this dimension
                            for (const [categoryName, categoryData] of Object.entries(cognitiveDimensions)) {
                                const dimension = categoryData.dimensions.find(d => Object.keys(d)[0] === dimensionKey);
                                if (dimension) {
                                    const key = Object.keys(dimension)[0];
                                    const description = Object.values(dimension)[0];
                                    return { dimension: key, description: description, category: categoryName };
                                }
                            }
                            return null;
                        }).filter(a => a !== null);
                    } else {
                        // New format - already objects
                        originalAppraisals = JSON.parse(JSON.stringify(gt.cognitive_appraisals));
                    }
                } else {
                    // No ground truth, use loaded annotation as original
                    originalAppraisals = JSON.parse(JSON.stringify(annotation.cognitive_appraisals));
                }

                renderSelectedAppraisals();
                updateAppraisalOptions();
                // Ensure appraisal options are rendered (coarse category phase should be displayed)
                renderAppraisalOptions();
            } else {
                originalAppraisals = [];
                selectedCoarseAppraisals = [];
                appraisalPhase = 1;
                // Ensure coarse category phase is displayed when no existing annotation
                renderAppraisalOptions();
            }

            // Load minimum context turn
            if (annotation.min_context_turn !== undefined && annotation.min_context_turn !== null) {
                minContextTurnIndex = annotation.min_context_turn;
                // Highlight the turn after rendering
                setTimeout(() => {
                    const turnPair = document.querySelector(`[data-turn-index="${minContextTurnIndex}"]`);
                    if (turnPair) {
                        turnPair.classList.add('min-context-selected');
                    }
                }, 100);
            }

            // Load modified utterances if any
            if (annotation.modified_utterances) {
                // Rebuild with plain and marked forms
                modifiedUtterances = {};
                Object.entries(annotation.modified_utterances).forEach(([idx, markedText]) => {
                    const plain = stripEditMarkers(markedText);
                    modifiedUtterances[idx] = { plain, marked: markedText };
                });
            }

            // Restore appraisal drag count if it exists (for cumulative tracking across sessions)
            if (annotation.edit_stats && annotation.edit_stats.appraisal_drag_count !== undefined) {
                appraisalDragCount = annotation.edit_stats.appraisal_drag_count;
                console.log(`📊 Restored appraisal drag count: ${appraisalDragCount}`);
            }

            // Restore dialogue ratings if they exist
            if (annotation.dialogue_ratings) {
                dialogueRatings = {
                    realism: annotation.dialogue_ratings.realism || 0,
                    persona: annotation.dialogue_ratings.persona || 0,
                    bdi: annotation.dialogue_ratings.bdi || 0,
                    appraisals: annotation.dialogue_ratings.appraisals || 0
                };

                // Update the star displays
                const ratingCategories = ['realism', 'persona', 'bdi', 'appraisals'];
                ratingCategories.forEach(category => {
                    const container = document.getElementById(`rating-${category}`);
                    const hiddenInput = document.getElementById(`rating-${category}-value`);
                    if (container && hiddenInput && dialogueRatings[category]) {
                        hiddenInput.value = dialogueRatings[category];
                        updateStarDisplay(container, dialogueRatings[category]);
                    }
                });

                console.log(`📊 Restored dialogue ratings:`, dialogueRatings);
            }

            showStatus('Loaded existing annotation', 'success');
            setTimeout(() => hideStatus(), 2000);
        }
    } catch (error) {
        console.error('Error loading annotation:', error);
    }
}

// Create DOM element for a dialogue turn pair
function createTurnPairElement(turn1, turn2, startIndex, turnPairNumber) {
    const pairDiv = document.createElement('div');
    pairDiv.className = 'dialogue-turn-pair';
    pairDiv.dataset.turnIndex = startIndex;
    pairDiv.dataset.turnPairNumber = turnPairNumber;

    // Add click handler for marking minimum context
    pairDiv.addEventListener('click', () => {
        // If any utterance in this pair is currently in edit mode, do NOT mark context
        const isEditing = pairDiv.querySelector('.utterance-edit-mode') !== null;
        if (isEditing) {
            return;
        }
        markMinContextTurn(startIndex, turnPairNumber, pairDiv);
    });

    // Add min context indicator button
    const minContextBtn = document.createElement('button');
    minContextBtn.className = 'min-context-btn';
    minContextBtn.title = 'Click this turn to mark it as minimum necessary context';
    minContextBtn.innerHTML = `<span class="min-context-icon">✓</span><span class="min-context-label">Turn ${turnPairNumber}</span>`;
    pairDiv.appendChild(minContextBtn);

    // Create first turn
    const div1 = createSingleTurnElement(turn1, startIndex);
    pairDiv.appendChild(div1);

    // Create second turn if exists
    if (turn2) {
        const div2 = createSingleTurnElement(turn2, startIndex + 1);
        pairDiv.appendChild(div2);
    }

    return pairDiv;
}

// Mark a turn as providing minimum necessary context
function markMinContextTurn(turnIndex, turnPairNumber, element) {
    // Check if this is already selected (toggle behavior)
    if (minContextTurnIndex === turnIndex) {
        // Deselect
        minContextTurnIndex = null;

        // Remove selection class
        element.classList.remove('min-context-selected');

        showStatus('Removed minimum context marker', 'info');
    } else {
        // Select new
        minContextTurnIndex = turnIndex;

        // Remove previous selection
        document.querySelectorAll('.dialogue-turn-pair').forEach(pair => {
            pair.classList.remove('min-context-selected');
        });

        // Mark this turn
        element.classList.add('min-context-selected');

        showStatus(`✓ Marked Turn ${turnPairNumber} as minimum necessary context`, 'success');
    }

    setTimeout(() => hideStatus(), 2000);
}

// Create DOM element for a single utterance
function createSingleTurnElement(turn, index) {
    const turnDiv = document.createElement('div');
    turnDiv.className = `dialogue-turn ${turn.speaker}`;
    turnDiv.dataset.turnIndex = index;

    const speakerLabel = document.createElement('div');
    speakerLabel.className = `speaker-label ${turn.speaker}`;

    const speakerText = document.createElement('span');
    speakerText.textContent = turn.speaker.toUpperCase();
    speakerLabel.appendChild(speakerText);

    if (turn.strategy) {
        const strategyTag = document.createElement('span');
        strategyTag.className = 'strategy-tag';
        strategyTag.textContent = turn.strategy;
        speakerLabel.appendChild(strategyTag);
    }

    const utterance = document.createElement('div');
    utterance.className = 'utterance';
    utterance.dataset.turnIndex = index;

    // Check if this utterance has been modified
    const modInfo = modifiedUtterances[index];
    const displayText = modInfo ? modInfo.marked : turn.utterance;
    const editPrefill = modInfo ? modInfo.plain : turn.utterance;
    renderMarkedText(utterance, displayText);

    // Add modified indicator if utterance was changed
    if (modInfo) {
        const modIndicator = document.createElement('span');
        modIndicator.className = 'utterance-modified-indicator';
        modIndicator.textContent = '(edited)';
        utterance.appendChild(modIndicator);
        utterance.classList.add('utterance-modified');
    }

    // Add edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-utterance-btn';
    editBtn.textContent = 'Edit';
    editBtn.onclick = (e) => {
        e.stopPropagation(); // Prevent turn pair click
        enterUtteranceEditMode(turnDiv, index, editPrefill);
    };
    utterance.appendChild(editBtn);

    turnDiv.appendChild(speakerLabel);
    turnDiv.appendChild(utterance);

    return turnDiv;
}

// Enter edit mode for an utterance
function enterUtteranceEditMode(turnDiv, turnIndex, currentText) {
    const utteranceDiv = turnDiv.querySelector('.utterance');

    // Create edit UI
    const editContainer = document.createElement('div');
    editContainer.className = 'utterance-edit-mode';

    const textarea = document.createElement('textarea');
    textarea.className = 'utterance-edit-input';
    textarea.value = currentText;
    textarea.rows = 3;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'utterance-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'utterance-save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = (e) => {
        e.stopPropagation();
        saveUtteranceEdit(turnDiv, turnIndex, textarea.value);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'utterance-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        cancelUtteranceEdit(turnDiv, turnIndex);
    };

    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);

    editContainer.appendChild(textarea);
    editContainer.appendChild(actionsDiv);

    // Replace utterance div with edit container
    utteranceDiv.replaceWith(editContainer);
    textarea.focus();
}

// Save edited utterance
function saveUtteranceEdit(turnDiv, turnIndex, newText) {
    if (!newText.trim()) {
        showStatus('Utterance cannot be empty', 'error');
        setTimeout(() => hideStatus(), 2000);
        return;
    }

    // Save to modified utterances tracking
    const originalText = currentDialogue.dialogue_history[turnIndex].utterance;
    const trimmedNew = newText.trim();
    if (trimmedNew !== originalText.trim()) {
        const marked = markEditedSpan(originalText, trimmedNew);
        modifiedUtterances[turnIndex] = { plain: trimmedNew, marked };
    } else {
        // If changed back to original, remove from modifications
        delete modifiedUtterances[turnIndex];
    }

    // Re-render the turn
    const editContainer = turnDiv.querySelector('.utterance-edit-mode');
    const turn = currentDialogue.dialogue_history[turnIndex];
    const newUtteranceDiv = createUtteranceDiv(turn, turnIndex);
    editContainer.replaceWith(newUtteranceDiv);

    showStatus('Utterance updated', 'success');
    setTimeout(() => hideStatus(), 2000);
}

// Cancel utterance edit
function cancelUtteranceEdit(turnDiv, turnIndex) {
    const editContainer = turnDiv.querySelector('.utterance-edit-mode');
    const turn = currentDialogue.dialogue_history[turnIndex];
    const utteranceDiv = createUtteranceDiv(turn, turnIndex);
    editContainer.replaceWith(utteranceDiv);
}

// Helper to create utterance div (for re-rendering after edit)
function createUtteranceDiv(turn, index) {
    const utterance = document.createElement('div');
    utterance.className = 'utterance';
    utterance.dataset.turnIndex = index;

    const modInfo = modifiedUtterances[index];
    const displayText = modInfo ? modInfo.marked : turn.utterance;
    const editPrefill = modInfo ? modInfo.plain : turn.utterance;
    renderMarkedText(utterance, displayText);

    // Add modified indicator if utterance was changed
    if (modInfo) {
        const modIndicator = document.createElement('span');
        modIndicator.className = 'utterance-modified-indicator';
        modIndicator.textContent = '(edited)';
        utterance.appendChild(modIndicator);
        utterance.classList.add('utterance-modified');
    }

    // Add edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-utterance-btn';
    editBtn.textContent = 'Edit';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        const turnDiv = e.target.closest('.dialogue-turn');
        enterUtteranceEditMode(turnDiv, index, editPrefill);
    };
    utterance.appendChild(editBtn);

    return utterance;
}

// Update dialogue progress bar (shows % of dialogue unveiled)
function updateDialogueProgress() {
    if (!currentDialogue) {
        const progressText = document.getElementById('dialogue-progress-text');
        const progressBar = document.getElementById('dialogue-progress-bar');
        const progressBarText = document.getElementById('dialogue-progress-bar-text');

        if (progressText) progressText.textContent = 'No dialogue loaded';
        if (progressBar) progressBar.style.width = '0%';
        if (progressBarText) progressBarText.textContent = '0%';
        return;
    }

    const totalUtterances = currentDialogue.dialogue_history.length;
    const viewedUtterances = currentTurnIndex;
    const percentage = totalUtterances > 0 ? Math.round((viewedUtterances / totalUtterances) * 100) : 0;

    const progressText = document.getElementById('dialogue-progress-text');
    const progressBar = document.getElementById('dialogue-progress-bar');
    const progressBarText = document.getElementById('dialogue-progress-bar-text');

    if (progressText) {
        const turnPairsViewed = Math.ceil(viewedUtterances / 2);
        const totalTurnPairs = Math.ceil(totalUtterances / 2);
        progressText.textContent = `Viewing: ${turnPairsViewed} / ${totalTurnPairs} turn pairs (${viewedUtterances} / ${totalUtterances} utterances)`;
    }

    if (progressBar) {
        progressBar.style.width = percentage + '%';
    }

    if (progressBarText) {
        progressBarText.textContent = percentage + '%';
    }
}

// Add cognitive appraisal
function addAppraisal(key, description, category) {
    // Check if already added
    if (selectedAppraisals.some(a => a.dimension === key)) {
        // If already selected, remove it (toggle behavior)
        removeAppraisal(key);
        return;
    }

    if (selectedAppraisals.length >= MAX_APPRAISALS) {
        showStatus(`Maximum ${MAX_APPRAISALS} appraisals allowed. Remove one first.`, 'error');
        setTimeout(() => hideStatus(), 2000);
        return;
    }

    // Ensure the parent category is selected (for combined view)
    if (category && !selectedCoarseAppraisals.includes(category)) {
        selectedCoarseAppraisals.push(category);
        // Update the category option visual state
        const categoryContainer = appraisalOptionsContainer.querySelector(`[data-category="${category}"]`);
        if (categoryContainer) {
            const categoryOption = categoryContainer.querySelector('.coarse-option');
            if (categoryOption) {
                categoryOption.classList.add('selected');
            }
            const dimensionsContainer = categoryContainer.querySelector('.appraisal-dimensions-container');
            if (dimensionsContainer) {
                dimensionsContainer.style.display = 'grid';
            }
        }
    }

    selectedAppraisals.push({
        dimension: key,
        description: description,
        category: category, // Store the coarse category for reference
        rationale: ''       // Initialize rationale as empty string
    });

    renderSelectedAppraisals();
    updateAppraisalOptions();
}

// Remove cognitive appraisal
function removeAppraisal(key) {
    selectedAppraisals = selectedAppraisals.filter(a => a.dimension !== key);
    renderSelectedAppraisals();
    updateAppraisalOptions();
}

// Removed: updateAppraisalIntensity function (intensity scores no longer used)

// Render selected appraisals with drag-and-drop support
function renderSelectedAppraisals() {
    if (selectedAppraisals.length === 0) {
        const emptyMsg = appraisalPhase === 1
            ? 'Complete Phase 1 to select fine-grained appraisals'
            : `Select ${MAX_APPRAISALS} appraisals from the categories above`;
        selectedAppraisalsContainer.innerHTML = `<p class="placeholder-small">${emptyMsg}</p>`;
        return;
    }

    selectedAppraisalsContainer.innerHTML = '';
    selectedAppraisals.forEach((appraisal, index) => {
        const item = document.createElement('div');
        item.className = 'appraisal-item';
        item.draggable = true;
        item.dataset.dimension = appraisal.dimension;

        // Drag handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = '⋮⋮';
        dragHandle.title = 'Drag to reorder';

        // Rank number
        const rankNum = document.createElement('div');
        rankNum.className = 'appraisal-rank';
        rankNum.textContent = `${index + 1}`;

        // Content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'appraisal-item-content';

        const label = document.createElement('div');
        label.className = 'appraisal-item-label';
        label.textContent = appraisal.dimension.replace(/_/g, ' ');

        const description = document.createElement('div');
        description.className = 'appraisal-item-description';
        description.textContent = appraisal.description;

        contentContainer.appendChild(label);
        contentContainer.appendChild(description);

        // Intensity and remove controls
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'appraisal-item-controls';

        // Rationale Input
        const rationaleContainer = document.createElement('div');
        rationaleContainer.className = 'appraisal-rationale-container';

        const rationaleInput = document.createElement('textarea');
        rationaleInput.className = 'appraisal-rationale-input';
        rationaleInput.placeholder = 'Rationale for selection...';
        rationaleInput.value = appraisal.rationale || '';
        rationaleInput.rows = 2;

        // Prevent drag when interacting with textarea
        rationaleInput.draggable = true;
        rationaleInput.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // Update model on input
        rationaleInput.addEventListener('input', (e) => {
            appraisal.rationale = e.target.value;
        });

        rationaleContainer.appendChild(rationaleInput);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'appraisal-item-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', () => removeAppraisal(appraisal.dimension));

        controlsContainer.appendChild(removeBtn);

        // Create Left Sidebar (Drag Handle + Rank)
        const leftControls = document.createElement('div');
        leftControls.className = 'appraisal-left-controls';
        leftControls.appendChild(dragHandle);
        leftControls.appendChild(rankNum);

        // Create Main Content Area
        const mainContent = document.createElement('div');
        mainContent.className = 'appraisal-main-content';

        // Header within main content (Label + Remove Btn)
        const headerRow = document.createElement('div');
        headerRow.className = 'appraisal-item-header';

        // Assemble header row
        headerRow.appendChild(contentContainer);
        headerRow.appendChild(controlsContainer);

        // Assemble Main Content (Header + Rationale)
        mainContent.appendChild(headerRow);
        mainContent.appendChild(rationaleContainer);

        // Assemble Item (Left Sidebar + Main Content)
        item.appendChild(leftControls);
        item.appendChild(mainContent);

        // Add drag event listeners
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);

        selectedAppraisalsContainer.appendChild(item);
    });
}

// Drag and drop handlers
let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');

    // Remove all drag-over indicators
    document.querySelectorAll('.appraisal-item').forEach(item => {
        item.classList.remove('drag-over-before', 'drag-over-after');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    if (this !== draggedElement) {
        // Remove all indicators first
        document.querySelectorAll('.appraisal-item').forEach(item => {
            item.classList.remove('drag-over-before', 'drag-over-after');
        });

        // Determine position
        const rect = this.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const mouseY = e.clientY;

        // Add indicator
        if (mouseY < midpoint) {
            this.classList.add('drag-over-before');
        } else {
            this.classList.add('drag-over-after');
        }
    }

    return false;
}

function handleDragEnter(e) {
    // Handled in dragover for consistency
}

function handleDragLeave(e) {
    // Only remove if we're actually leaving the element bounds
    const rect = this.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        this.classList.remove('drag-over-before', 'drag-over-after');
    }
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    e.preventDefault();

    if (!draggedElement || this === draggedElement) {
        return false;
    }

    // Get dimensions
    const draggedDimension = draggedElement.dataset.dimension;
    const targetDimension = this.dataset.dimension;

    // Find indices in data array
    const draggedIndex = selectedAppraisals.findIndex(a => a.dimension === draggedDimension);
    const targetIndex = selectedAppraisals.findIndex(a => a.dimension === targetDimension);

    if (draggedIndex === -1 || targetIndex === -1) {
        return false;
    }

    // Determine if we should insert before or after target
    const insertBefore = this.classList.contains('drag-over-before');

    // Remove the dragged item
    const [draggedItem] = selectedAppraisals.splice(draggedIndex, 1);

    // Calculate new position
    let newIndex = targetIndex;

    // If we removed an item before the target, adjust target index
    if (draggedIndex < targetIndex) {
        newIndex--;
    }

    // Adjust based on insert position
    if (!insertBefore) {
        newIndex++;
    }

    // Insert at new position
    selectedAppraisals.splice(newIndex, 0, draggedItem);

    // Track the drag operation
    appraisalDragCount++;
    console.log(`📊 Appraisal reordered. Total drag operations: ${appraisalDragCount}`);

    // Re-render
    renderSelectedAppraisals();

    return false;
}

// Update appraisal options (disable selected ones)
function updateAppraisalOptions() {
    // Update instruction text with current selection status
    const instructionDiv = appraisalOptionsContainer.querySelector('.appraisal-phase-instruction');
    if (instructionDiv) {
        const selectedCount = selectedAppraisals.length;
        const remaining = MAX_APPRAISALS - selectedCount;
        let statusText = '';
        if (selectedCount === 0) {
            statusText = `First pick the categories, then select ${MAX_APPRAISALS} appraisals`;
        } else if (selectedCount < MAX_APPRAISALS) {
            statusText = `${selectedCount} selected, ${remaining} more needed`;
        } else {
            statusText = `✓ All ${MAX_APPRAISALS} selected - drag to reorder`;
        }
        instructionDiv.innerHTML = `<strong>Select 5 Cognitive Appraisals</strong>Click categories to reveal their dimensions.<br><br><span style="background: rgba(255,255,255,0.25); padding: 3px 10px; border-radius: 12px; margin-left: 0px;">${statusText}</span>`;
    }

    // Update visual state of dimension options (mark selected ones)
    const dimensionOptions = appraisalOptionsContainer.querySelectorAll('.fine-option');
    dimensionOptions.forEach(option => {
        const key = option.dataset.key;
        const isSelected = selectedAppraisals.some(a => a.dimension === key);

        if (isSelected) {
            // Selected items: mark as selected but keep clickable for deselection
            option.classList.add('selected');
            option.classList.remove('disabled');
        } else {
            // Unselected items: remove selected class
            option.classList.remove('selected');

            // Only disable unselected items if we've reached the max
            if (selectedAppraisals.length >= MAX_APPRAISALS) {
                option.classList.add('disabled');
            } else {
                option.classList.remove('disabled');
            }
        }
    });
}

// Clear all annotations
function clearAnnotations() {
    beliefInput.value = '';
    desireInput.value = '';
    intentionInput.value = '';
    selectedAppraisals = [];
    selectedCoarseAppraisals = []; // Reset coarse selections
    originalAppraisals = []; // Reset original appraisals
    appraisalDragCount = 0; // Reset drag operation counter
    appraisalPhase = 1; // Reset to phase 1
    renderSelectedAppraisals();
    renderAppraisalOptions(); // Ensure coarse category phase is displayed
    updateAppraisalOptions();
    minContextTurnIndex = null;
    hideStatus();
}

// Highlight the appraisal section with error animation
function highlightAppraisalSection() {
    const appraisalsSection = document.getElementById('appraisals-section');
    if (!appraisalsSection) return;

    // Ensure the section is expanded
    const sectionHeader = appraisalsSection.querySelector('.section-header');
    const sectionContent = appraisalsSection.querySelector('.section-content');
    if (sectionContent && sectionContent.style.display === 'none') {
        // Expand the section
        sectionContent.style.display = 'block';
        const collapseIcon = sectionHeader?.querySelector('.collapse-icon');
        if (collapseIcon) {
            collapseIcon.textContent = '▼';
        }
    }

    // Add error highlight class
    appraisalsSection.classList.add('appraisal-error-highlight');

    // Scroll to the section smoothly
    appraisalsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Remove the highlight class after animation completes (3 seconds)
    setTimeout(() => {
        appraisalsSection.classList.remove('appraisal-error-highlight');
    }, 3000);
}

// Highlight dialogue rating section with error animation
function highlightDialogueRatingSection() {
    const ratingSection = document.getElementById('dialogue-rating-section');
    if (!ratingSection) return;

    // Add error highlight class
    ratingSection.classList.add('rating-error-highlight');

    // Scroll to the section smoothly
    ratingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Remove the highlight class after animation completes (3 seconds)
    setTimeout(() => {
        ratingSection.classList.remove('rating-error-highlight');
    }, 3000);
}

// Save annotation with confirmation
async function saveAnnotation() {
    if (!currentDialogue) {
        showStatus('No dialogue selected', 'error');
        return;
    }

    // Require minimum context selection before saving
    if (minContextTurnIndex === null || minContextTurnIndex === undefined) {
        showStatus('Please select the minimum context turn before saving your annotation.', 'error');
        setTimeout(() => hideStatus(), 3000);
        return;
    }

    // Require all four dialogue ratings to be completed
    const missingRatings = [];
    if (dialogueRatings.realism === 0) missingRatings.push('Realism');
    if (dialogueRatings.persona === 0) missingRatings.push('Persona');
    if (dialogueRatings.bdi === 0) missingRatings.push('BDI Association');
    if (dialogueRatings.appraisals === 0) missingRatings.push('Appraisals Association');

    if (missingRatings.length > 0) {
        const ratingList = missingRatings.join(', ');
        showStatus(`Please complete all dialogue quality ratings. Missing: ${ratingList}`, 'error');

        // Highlight the dialogue rating section with animation
        highlightDialogueRatingSection();

        // Show error message for longer (8 seconds)
        setTimeout(() => hideStatus(), 8000);
        return;
    }

    // Require exactly 5 appraisals to be selected
    if (selectedAppraisals.length !== MAX_APPRAISALS) {
        const missingCount = MAX_APPRAISALS - selectedAppraisals.length;
        const plural = missingCount > 1 ? 's' : '';
        showStatus(`Please select exactly ${MAX_APPRAISALS} cognitive appraisal dimensions.`, 'error');

        // Highlight the appraisal section with animation
        highlightAppraisalSection();

        // Show error message for longer (8 seconds)
        setTimeout(() => hideStatus(), 8000);
        return;
    }

    // Check if BDI has been modified
    const gt = currentDialogue.ground_truth || {};

    // Check BDI modifications (compare stripped values since inputs store values without prefixes)
    const currentBelief = (beliefInput.value || '').trim();
    const originalBelief = stripPrefix('belief', gt.belief || '');
    const beliefModified = currentBelief !== originalBelief;

    const currentDesire = (desireInput.value || '').trim();
    const originalDesire = stripPrefix('desire', gt.desire || '');
    const desireModified = currentDesire !== originalDesire;

    const currentIntention = (intentionInput.value || '').trim();
    const originalIntention = stripPrefix('intention', gt.intention || '');
    const intentionModified = currentIntention !== originalIntention;

    // Show confirmation modal
    showConfirmModal();
}

// Show confirmation modal
function showConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    const dialogueId = document.getElementById('confirm-dialogue-id');
    const turns = document.getElementById('confirm-turns');
    const appraisals = document.getElementById('confirm-appraisals');

    // Populate modal with current annotation info
    dialogueId.textContent = currentDialogue.entry_id;
    const totalUtterances = currentDialogue.dialogue_history.length;
    const totalTurnPairs = Math.ceil(totalUtterances / 2);
    const currentPairs = Math.ceil(currentTurnIndex / 2);
    turns.textContent = `${currentPairs} of ${totalTurnPairs} turn pairs`;
    appraisals.textContent = `${selectedAppraisals.length} of 5`;

    // Show minimum context turn
    let minContextElement = document.getElementById('confirm-min-context');
    if (!minContextElement) {
        // Create the element if it doesn't exist
        const summaryItem = document.createElement('div');
        summaryItem.className = 'summary-item';
        summaryItem.innerHTML = `
            <span class="summary-label">Min. context turn:</span>
            <span id="confirm-min-context" class="summary-value"></span>
        `;
        document.querySelector('.annotation-summary').appendChild(summaryItem);
        minContextElement = document.getElementById('confirm-min-context');
    }

    if (minContextTurnIndex !== null) {
        const turnPair = document.querySelector(`[data-turn-index="${minContextTurnIndex}"]`);
        const turnNumber = turnPair ? turnPair.dataset.turnPairNumber : '?';
        minContextElement.textContent = `Turn ${turnNumber}`;
        minContextElement.style.color = 'var(--success-color)';
        minContextElement.style.fontWeight = '600';
    } else {
        minContextElement.textContent = 'Not marked';
        minContextElement.style.color = 'var(--text-secondary)';
        minContextElement.style.fontWeight = 'normal';
    }

    // Compute and display edit statistics
    const editedUtterancesCount = Object.keys(modifiedUtterances).length;
    const utteranceEditSpans = Object.values(modifiedUtterances).reduce(
        (sum, info) => sum + countEditSpans(info.marked),
        0
    );

    // Compute BDI edit spans
    const gt = currentDialogue.ground_truth || {};
    const editedBelief = addPrefix('belief', beliefInput.value || '');
    const originalBelief = gt.belief ? addPrefix('belief', gt.belief || '') : editedBelief;
    const beliefValue = (editedBelief !== originalBelief)
        ? markEditedSpan(originalBelief, editedBelief)
        : editedBelief;

    const editedDesire = addPrefix('desire', desireInput.value || '');
    const originalDesire = gt.desire ? addPrefix('desire', gt.desire || '') : editedDesire;
    const desireValue = (editedDesire !== originalDesire)
        ? markEditedSpan(originalDesire, editedDesire)
        : editedDesire;

    const editedIntention = addPrefix('intention', intentionInput.value || '');
    const originalIntention = gt.intention ? addPrefix('intention', gt.intention || '') : editedIntention;
    const intentionValue = (editedIntention !== originalIntention)
        ? markEditedSpan(originalIntention, editedIntention)
        : editedIntention;

    const bdiEditSpans =
        countEditSpans(beliefValue) +
        countEditSpans(desireValue) +
        countEditSpans(intentionValue);

    const totalEditSpans = utteranceEditSpans + bdiEditSpans;

    // Display edit statistics
    document.getElementById('confirm-edited-utterances').textContent = editedUtterancesCount;
    document.getElementById('confirm-utterance-edits').textContent = utteranceEditSpans;
    document.getElementById('confirm-bdi-edits').textContent = bdiEditSpans;
    document.getElementById('confirm-total-edits').textContent = totalEditSpans;

    // Display appraisal count (appraisals are selected, not edited)
    const appraisalsCount = selectedAppraisals.length;
    let appraisalCountElement = document.getElementById('confirm-appraisal-edits');
    if (!appraisalCountElement) {
        const summaryItem = document.createElement('div');
        summaryItem.className = 'summary-item';
        summaryItem.innerHTML = `
            <span class="summary-label">Appraisals selected:</span>
            <span id="confirm-appraisal-edits" class="summary-value"></span>
        `;
        document.querySelector('.annotation-summary').appendChild(summaryItem);
        appraisalCountElement = document.getElementById('confirm-appraisal-edits');
    }
    appraisalCountElement.textContent = `${appraisalsCount} of ${MAX_APPRAISALS}`;
    if (appraisalsCount === MAX_APPRAISALS) {
        appraisalCountElement.style.color = 'var(--success-color)';
        appraisalCountElement.style.fontWeight = '600';
    } else {
        appraisalCountElement.style.color = 'var(--warning-color)';
        appraisalCountElement.style.fontWeight = '600';
    }

    modal.classList.add('show');
}

// Hide confirmation modal
function hideConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('show');
}

// Calculate cognitive appraisal edit statistics
function calculateAppraisalEditStats() {
    const originalDimensions = originalAppraisals.map(a => a.dimension);
    const finalDimensions = selectedAppraisals.map(a => a.dimension);

    // Count additions (in final but not in original)
    const addedAppraisals = finalDimensions.filter(dim => !originalDimensions.includes(dim));

    // Count removals (in original but not in final)
    const removedAppraisals = originalDimensions.filter(dim => !finalDimensions.includes(dim));

    // Check if order changed (compare sequences)
    let orderChanged = false;
    if (originalDimensions.length === finalDimensions.length) {
        // Same length - check if order is different
        const originalOrder = originalDimensions.join(',');
        const finalOrder = finalDimensions.join(',');
        orderChanged = originalOrder !== finalOrder;
    } else {
        // Different length - order comparison is less meaningful, but we can check
        // if any items that exist in both are in different positions
        const commonDimensions = originalDimensions.filter(dim => finalDimensions.includes(dim));
        if (commonDimensions.length > 1) {
            const originalIndices = commonDimensions.map(dim => originalDimensions.indexOf(dim));
            const finalIndices = commonDimensions.map(dim => finalDimensions.indexOf(dim));
            orderChanged = JSON.stringify(originalIndices) !== JSON.stringify(finalIndices);
        }
    }

    // Count total modifications (additions + removals + reordering)
    const totalModifications = addedAppraisals.length + removedAppraisals.length + (orderChanged ? 1 : 0);

    // Check if list was modified at all
    const wasModified = totalModifications > 0;

    return {
        original_count: originalDimensions.length,
        final_count: finalDimensions.length,
        added_count: addedAppraisals.length,
        removed_count: removedAppraisals.length,
        added_appraisals: addedAppraisals,
        removed_appraisals: removedAppraisals,
        order_changed: orderChanged,
        total_modifications: totalModifications,
        was_modified: wasModified
    };
}

// Actually save the annotation
async function performSave() {
    hideConfirmModal();

    // Validate that all appraisals have a rationale
    const missingRationale = selectedAppraisals.some(a => !a.rationale || a.rationale.trim() === '');
    if (missingRationale) {
        showStatus('❌ Please provide a rationale for all selected appraisals.', 'error', 4000);
        return;
    }

    // Build BDI with edit markers relative to ground truth (pre-event) if available
    let beliefValue = '';
    let desireValue = '';
    let intentionValue = '';

    const gt = currentDialogue.ground_truth || {};

    // Belief - create plain and marked versions
    const editedBelief = addPrefix('belief', beliefInput.value || '');
    const originalBelief = gt.belief ? addPrefix('belief', gt.belief || '') : editedBelief;
    const beliefPlain = editedBelief; // Plain version (without edit markers)
    const beliefMarked = (editedBelief !== originalBelief)
        ? markEditedSpan(originalBelief, editedBelief)
        : editedBelief;

    // Desire - create plain and marked versions
    const editedDesire = addPrefix('desire', desireInput.value || '');
    const originalDesire = gt.desire ? addPrefix('desire', gt.desire || '') : editedDesire;
    const desirePlain = editedDesire; // Plain version (without edit markers)
    const desireMarked = (editedDesire !== originalDesire)
        ? markEditedSpan(originalDesire, editedDesire)
        : editedDesire;

    // Intention - create plain and marked versions
    const editedIntention = addPrefix('intention', intentionInput.value || '');
    const originalIntention = gt.intention ? addPrefix('intention', gt.intention || '') : editedIntention;
    const intentionPlain = editedIntention; // Plain version (without edit markers)
    const intentionMarked = (editedIntention !== originalIntention)
        ? markEditedSpan(originalIntention, editedIntention)
        : editedIntention;

    // Compute edit statistics
    const editedUtterancesCount = Object.keys(modifiedUtterances).length;
    const utteranceEditSpans = Object.values(modifiedUtterances).reduce(
        (sum, info) => sum + countEditSpans(info.marked),
        0
    );
    const bdiEditSpans =
        countEditSpans(beliefMarked) +
        countEditSpans(desireMarked) +
        countEditSpans(intentionMarked);

    // Note: Appraisals are now selected (not edited), so we only track the count
    const appraisalsCount = selectedAppraisals.length;

    const totalEditSpans = utteranceEditSpans + bdiEditSpans;

    const annotation = {
        entry_id: currentDialogue.entry_id,
        username: currentUsername,
        turns_viewed: currentTurnIndex,
        total_turns: currentDialogue.dialogue_history.length,
        min_context_turn: minContextTurnIndex,
        // Save plain versions (without edit markers) grouped under annotated_bdi
        annotated_bdi: {
            belief: beliefPlain,
            desire: desirePlain,
            intention: intentionPlain
        },
        cognitive_appraisals: selectedAppraisals,
        coarse_appraisal_categories: selectedCoarseAppraisals, // Save selected coarse categories
        // Include full dialogue snapshot using the FINAL (possibly edited) utterances
        dialogue_snapshot: currentDialogue.dialogue_history.map((turn, idx) => {
            const modInfo = modifiedUtterances[idx];
            return {
                speaker: turn.speaker,
                // Use edited plain text if available; otherwise original
                utterance: modInfo ? modInfo.plain : turn.utterance
            };
        }),
        // Save edited utterances with marked spans
        modified_utterances: Object.fromEntries(
            Object.entries(modifiedUtterances).map(([k, v]) => [k, v.marked])
        ),
        // Save BDI fields with marked edit spans
        modified_bdi: {
            belief: beliefMarked,
            desire: desireMarked,
            intention: intentionMarked
        },
        // Edit statistics (only track edits to utterances and BDI)
        edit_stats: {
            edited_utterances: editedUtterancesCount,
            utterance_edit_spans: utteranceEditSpans,
            bdi_edit_spans: bdiEditSpans,
            total_edit_spans: totalEditSpans,
            // Appraisal selection (not edits)
            appraisals_selected: appraisalsCount,
            // Appraisal reordering operations
            appraisal_drag_count: appraisalDragCount
        },
        // Dialogue quality ratings (1-5 stars for each criterion)
        dialogue_ratings: {
            realism: dialogueRatings.realism,
            persona: dialogueRatings.persona,
            bdi: dialogueRatings.bdi,
            appraisals: dialogueRatings.appraisals
        },
        timestamp: new Date().toISOString()
    };

    try {
        // Save to Firebase
        const collectionName = isAgreementMode ? 'agreement_annotations' : 'annotations';
        await saveAnnotationToStorage(currentDialogue.entry_id, annotation, collectionName);

        // Track annotations without BDI edits (for assessment purposes)
        const hasNoBdiEdits = bdiEditSpans === 0;
        if (hasNoBdiEdits && firebaseStorage) {
            try {
                await firebaseStorage.updateUserSummaryStats(true);
            } catch (error) {
                console.error('Error updating user summary stats:', error);
            }
        } else if (firebaseStorage) {
            try {
                await firebaseStorage.updateUserSummaryStats(false);
            } catch (error) {
                console.error('Error updating user summary stats:', error);
            }
        }

        // Update annotation status and progress bar
        annotationStatus[currentDialogue.entry_id] = true;

        // Recompute annotated count logic
        let relevantIds = [];
        if (isAgreementMode) {
            relevantIds = allDialogues.map(d => d.entry_id);
        } else {
            relevantIds = assignedDialogues.length > 0
                ? assignedDialogues
                : allDialogues.map(d => d.entry_id);
        }

        let annotatedCount = 0;
        for (const id of relevantIds) {
            if (annotationStatus[id]) annotatedCount++;
        }
        const totalToAnnotate = relevantIds.length;

        updateProgressBar(annotatedCount, totalToAnnotate);

        // Build and show edit summary
        const bdiEdited = bdiEditSpans > 0;

        const summaryHtml = [
            `<strong>✅ Annotation saved for ${currentDialogue.entry_id}</strong>`,
            `<span>• Edited utterances: <strong>${editedUtterancesCount}</strong></span>`,
            `<span>• Utterance edit spans: <strong>${utteranceEditSpans}</strong></span>`,
            `<span>• BDI edit spans: <strong>${bdiEditSpans}</strong></span>`,
            `<span>• Total edit spans (edits): <strong>${totalEditSpans}</strong></span>`,
            `<span>• BDI revised: <strong>${bdiEdited ? 'Yes' : 'No'}</strong></span>`,
            `<span>• Appraisals selected: <strong>${appraisalsCount}</strong></span>`
        ].join('<br>');

        // Longer duration so user can read the statistics
        showStatus(summaryHtml, 'success', 6000);

        // Update current dialogue info display
        updateDialogueInfo();

        // Update dropdown to show checkmark
        populateDialogueSelector();
        dialogueSelect.value = allDialogues.findIndex(d => d.entry_id === currentDialogue.entry_id);

        // Auto-load next unannotated dialogue
        const nextUnannotated = await findFirstUnannotatedDialogue();
        if (nextUnannotated !== -1) {
            setTimeout(async () => {
                dialogueSelect.value = nextUnannotated;
                await handleDialogueChange();
                console.log(`Loaded next dialogue: ${allDialogues[nextUnannotated].entry_id}`);
            }, 1500);
        } else {
            // All dialogues completed!
            let completionMsg = "";
            if (isAgreementMode) {
                completionMsg = "🎉 All agreement dialogues completed!";
            } else {
                completionMsg = assignedDialogues.length > 0
                    ? `🎉 All ${assignedDialogues.length} assigned dialogues completed!`
                    : '🎉 All dialogues completed!';
            }
            showStatus(completionMsg, 'success');

            // Show feedback modal (unless already submitted)
            const hasFeedback = await firebaseStorage.hasFeedback();
            if (!hasFeedback) {
                setTimeout(() => {
                    showFeedbackModal();
                }, 2000); // Show after 2 seconds
            } else {
                // Feedback already submitted, handle completion
                if (isProlific) {
                    await handleProlificCompletion();
                } else if (isSona) {
                    await handleSonaCompletion();
                }
            }

            // Note: For Prolific/Sona users, completion will be called
            // AFTER feedback is submitted (in handleFeedbackSubmit)
        }
    } catch (error) {
        console.error('Error saving annotation:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        showStatus(`❌ Error saving annotation: ${errorMessage}`, 'error', 6000);
    }
}

// Show notification pop-up
function showStatus(message, type = 'info', duration = 3000) {
    const popup = document.getElementById('notification-popup');
    const messageEl = document.getElementById('notification-message');
    const iconEl = document.getElementById('notification-icon');

    if (!popup || !messageEl || !iconEl) return;

    // Set message (support simple multi-line / HTML for internal messages)
    if (typeof message === 'string' && (message.includes('<br') || message.includes('</'))) {
        messageEl.innerHTML = message;
    } else {
        messageEl.textContent = message;
    }

    // Set icon based on type
    const icons = {
        'success': '✓',
        'error': '✕',
        'warning': '⚠',
        'info': 'ℹ'
    };
    iconEl.textContent = icons[type] || icons['info'];

    // Set type class
    popup.className = `notification-popup notification-${type} show`;

    // Auto-hide after duration
    if (window.notificationTimeout) {
        clearTimeout(window.notificationTimeout);
    }

    window.notificationTimeout = setTimeout(() => {
        hideStatus();
    }, duration);
}

// Hide notification pop-up
function hideStatus() {
    const popup = document.getElementById('notification-popup');
    if (popup) {
        popup.classList.remove('show');
    }
}

// Setup notification close button
function setupNotificationListeners() {
    const closeBtn = document.getElementById('notification-close');
    const popup = document.getElementById('notification-popup');

    if (closeBtn) {
        closeBtn.addEventListener('click', hideStatus);
    }

    // Click outside to close
    if (popup) {
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                hideStatus();
            }
        });
    }
}

// Login/Register functions
// Debounce helper for username checking
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check username availability with visual feedback
async function checkUsernameAvailability(username) {
    const statusIcon = document.getElementById('register-username-status');
    const availabilityText = document.getElementById('register-username-availability');

    // Clear previous status
    statusIcon.className = 'username-status';
    availabilityText.className = 'username-availability';
    statusIcon.textContent = '';
    availabilityText.textContent = '';

    // Don't check if username is too short
    if (!username || username.length < 3) {
        return;
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        statusIcon.className = 'username-status taken';
        statusIcon.textContent = '✗';
        availabilityText.className = 'username-availability taken';
        availabilityText.textContent = 'Invalid characters';
        return;
    }

    // Show checking state
    statusIcon.className = 'username-status checking';
    statusIcon.textContent = '⋯';
    availabilityText.className = 'username-availability checking';
    availabilityText.textContent = 'Checking availability...';

    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        const { existsInAuth, existsInFirestore } = await firebaseStorage.getUsernameStatus(username);

        if (!existsInAuth && !existsInFirestore) {
            // Fully available
            statusIcon.className = 'username-status available';
            statusIcon.textContent = '✓';
            availabilityText.className = 'username-availability available';
            availabilityText.textContent = 'Username available';
            return;
        }

        // Orphaned state: exists in Auth but missing Firestore profile (can be reclaimed)
        if (existsInAuth && !existsInFirestore) {
            statusIcon.className = 'username-status available';
            statusIcon.textContent = '⚠';
            availabilityText.className = 'username-availability available';
            availabilityText.textContent = 'Deleted account - will be reclaimed with your password';
            return;
        }

        // Any other combination = taken
        statusIcon.className = 'username-status taken';
        statusIcon.textContent = '✗';
        availabilityText.className = 'username-availability taken';
        availabilityText.textContent = 'Username already taken';
    } catch (error) {
        console.error('Error checking username:', error);
        statusIcon.textContent = '';
        availabilityText.textContent = '';
    }
}

// Debounced version for real-time checking (500ms delay)
const debouncedUsernameCheck = debounce(checkUsernameAvailability, 500);

function setupLoginListeners() {
    // Login Modal Elements
    const loginBtn = document.getElementById('login-btn');
    const loginUsernameInput = document.getElementById('login-username-input');
    const loginPasswordInput = document.getElementById('login-password-input');
    const showRegisterLink = document.getElementById('show-register-link');

    // Register Modal Elements
    const registerBtn = document.getElementById('register-btn');
    const registerUsernameInput = document.getElementById('register-username-input');
    const registerPasswordInput = document.getElementById('register-password-input');
    const registerConfirmPasswordInput = document.getElementById('register-confirm-password-input');
    const showLoginLink = document.getElementById('show-login-link');

    // --- LOGIN MODAL LISTENERS ---

    // Login button click
    loginBtn.addEventListener('click', handleLogin);

    // Switch to register modal
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterModal();
    });

    // Enter key navigation in login modal
    loginUsernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginPasswordInput.focus();
        }
    });

    loginPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    // --- REGISTER MODAL LISTENERS ---

    // Register button click
    registerBtn.addEventListener('click', handleRegister);

    // Switch to login modal
    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginModal();
    });

    // Real-time username availability check
    registerUsernameInput.addEventListener('input', (e) => {
        debouncedUsernameCheck(e.target.value.trim());
    });

    // Enter key navigation in register modal
    registerUsernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            registerPasswordInput.focus();
        }
    });

    registerPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            registerConfirmPasswordInput.focus();
        }
    });

    registerConfirmPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleRegister();
        }
    });
}

async function handleLogin() {
    const username = document.getElementById('login-username-input').value.trim();
    const password = document.getElementById('login-password-input').value;

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

        // Look up user by custom ID (username is the custom ID for regular users)
        const profile = await firebaseStorage.getUserProfile(result.uid); // result.uid is now the custom ID (username)
        if (!profile) {
            if (currentUsername) {
                localStorage.removeItem(STORAGE_KEYS.TOUR_SEEN);
                await firebaseStorage.logout();
            }
            showLoginError('Account not found in annotation records. Please register.');
            return;
        }

        currentUsername = profile.username || username;

        // Set custom user ID in firebaseStorage (username for regular users)
        firebaseStorage.setCustomUserId(result.uid);

        // Load assigned dialogues for this user
        await loadAssignedDialogues();

        hideLoginModal();
        await initializeApp();
        showStatus(`Welcome back, ${currentUsername}! You have ${assignedDialogues.length} dialogues to annotate.`, 'success');
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Error logging in: ' + error.message);
    }
}

async function handleRegister() {
    const username = document.getElementById('register-username-input').value.trim();
    const password = document.getElementById('register-password-input').value;
    const confirmPassword = document.getElementById('register-confirm-password-input').value;

    // Validate inputs
    if (!username || !password) {
        showRegisterError('Please enter username and password');
        return;
    }

    // Validate username length
    if (username.length < 3) {
        showRegisterError('Username must be at least 3 characters');
        return;
    }

    if (username.length > 20) {
        showRegisterError('Username must be at most 20 characters');
        return;
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        showRegisterError('Username can only contain letters, numbers, underscore, and hyphen');
        return;
    }

    // Validate password
    if (password.length < 6) {
        showRegisterError('Password must be at least 6 characters');
        return;
    }

    if (password !== confirmPassword) {
        showRegisterError('Passwords do not match');
        return;
    }

    try {
        if (!firebaseReady) {
            await initFirebaseStorage();
        }

        // Pre-check if username is already taken (Auth + Firestore)
        const { existsInAuth, existsInFirestore } = await firebaseStorage.getUsernameStatus(username);

        if (existsInAuth && existsInFirestore) {
            // Both exist - username is fully taken
            showRegisterError('Username already taken. Please choose another one.');
            return;
        }

        if (!existsInAuth && existsInFirestore) {
            // Firestore exists but no Auth (shouldn't happen normally)
            showRegisterError('Username exists in records but Auth is missing. Please contact the researcher.');
            return;
        }

        // Sample dialogues for this user
        showRegisterError('Assigning dialogues...'); // Show progress
        const sampledDialogues = await sampleDialogues(DIALOGUES_PER_USER);

        if (sampledDialogues.length < DIALOGUES_PER_USER) {
            console.warn(`⚠️ Only ${sampledDialogues.length} dialogues available for assignment`);
        }

        console.log(`🎲 Sampled ${sampledDialogues.length} dialogues for ${username}:`, sampledDialogues);

        let result;

        if (existsInAuth && !existsInFirestore) {
            // Orphaned Auth account detected - attempt to reclaim it
            console.log('🔄 Orphaned Auth account detected, attempting to reclaim...');
            showRegisterError('Reclaiming orphaned account...'); // Show progress
            result = await firebaseStorage.reclaimOrphanedAccount(username, password, sampledDialogues);
        } else {
            // Normal registration - no existing account
            result = await firebaseStorage.registerUser(username, password, sampledDialogues);
        }

        if (!result.success) {
            showRegisterError(result.message);
            return;
        }

        currentUsername = username;
        assignedDialogues = result.assignedDialogues || sampledDialogues;

        // Set custom user ID (username is the custom ID for regular users)
        firebaseStorage.setCustomUserId(result.uid); // uid is now the username (custom ID)

        hideRegisterModal();
        await initializeApp();
        showStatus(`Welcome, ${username}! You have been assigned ${assignedDialogues.length} dialogues to annotate.`, 'success');
    } catch (error) {
        console.error('Registration error:', error);
        showRegisterError('Error registering user: ' + error.message);
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function showRegisterError(message) {
    const errorDiv = document.getElementById('register-error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    modal.classList.remove('show');
}

function hideRegisterModal() {
    const modal = document.getElementById('register-modal');
    modal.classList.remove('show');
}

function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');

    // Hide register modal, show login modal
    registerModal.classList.remove('show');
    loginModal.classList.add('show');

    // Clear login form and errors
    document.getElementById('login-username-input').value = '';
    document.getElementById('login-password-input').value = '';
    document.getElementById('login-error').classList.add('hidden');

    // Focus on username input
    setTimeout(() => {
        document.getElementById('login-username-input').focus();
    }, 100);
}

function showRegisterModal() {
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');

    // Hide login modal, show register modal
    loginModal.classList.remove('show');
    registerModal.classList.add('show');

    // Clear register form and errors
    document.getElementById('register-username-input').value = '';
    document.getElementById('register-password-input').value = '';
    document.getElementById('register-confirm-password-input').value = '';
    document.getElementById('register-error').classList.add('hidden');

    // Clear username availability status
    const statusIcon = document.getElementById('register-username-status');
    const availabilityText = document.getElementById('register-username-availability');
    statusIcon.className = 'username-status';
    statusIcon.textContent = '';
    availabilityText.className = 'username-availability';
    availabilityText.textContent = '';

    // Focus on username input
    setTimeout(() => {
        document.getElementById('register-username-input').focus();
    }, 100);
}

// ========== INSTRUCTION MODAL FUNCTIONS ==========

// Format dimension key to readable name (e.g., "predictability_of_event" -> "Predictability of Event")
function formatDimensionName(key) {
    return key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Populate cognitive appraisal dimensions in instruction modal
async function populateInstructionAppraisals() {
    try {
        const tableBody = document.querySelector('#instruction-appraisals-table tbody');
        if (!tableBody) return;

        // Load cognitive dimensions if not already loaded
        if (cognitiveDimensions.length === 0) {
            const response = await fetch('data/cognitive_dimensions.json');
            const dimensions = await response.json();
            cognitiveDimensions = dimensions;
        }

        // Clear existing content
        tableBody.innerHTML = '';

        // Populate with dimensions from JSON
        cognitiveDimensions.forEach(dimensionObj => {
            const [key, definition] = Object.entries(dimensionObj)[0];
            const formattedName = formatDimensionName(key);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="dimension-name">${formattedName}</td>
                <td class="dimension-definition">${definition}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error populating instruction appraisals:', error);
        // Fallback to showing error message
        const tableBody = document.querySelector('#instruction-appraisals-table tbody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="2">Error loading cognitive dimensions. Please refresh the page.</td></tr>';
        }
    }
}

function showInstructionModal() {
    const modal = document.getElementById('instruction-modal');
    const modalBody = modal.querySelector('.instruction-body');
    const understoodBtn = document.getElementById('instruction-understood-btn');
    const progressFill = document.getElementById('instruction-progress-fill');
    const closeBtn = document.getElementById('close-instruction-modal');

    // Reset progress bar when opening
    if (progressFill) {
        progressFill.style.width = '0%';
    }

    // Show/hide close button based on tour and instruction status
    // Show close button if: user has seen the tour OR has seen instructions before
    // Hide close button if: first time AND hasn't taken tour (encourage engagement)
    const hasSeenInstructionsBefore = hasSeenInstructions();
    const hasSeenTour = localStorage.getItem(STORAGE_KEYS.TOUR_SEEN) === '1';

    // Allow closing ONLY if user has already engaged with the tour
    // This forces new users (and those who have only seen instructions but not tour) to take the tour
    const shouldShowCloseButton = hasSeenTour;

    console.log('Instruction Close Button Logic:', {
        hasSeenTour,
        shouldShowCloseButton,
        closeBtnFound: !!closeBtn,
        closeBtnDisabled: closeBtn ? closeBtn.disabled : null
    });

    // Button Disable Logic
    if (closeBtn) {
        if (shouldShowCloseButton) {
            // User has seen tour - enable button
            closeBtn.disabled = false;
            closeBtn.classList.remove('disabled-btn'); // Optional visual cue
            closeBtn.title = "Close instructions";
            // Ensure no residual hide classes
            closeBtn.classList.remove('force-hide');
            closeBtn.style.removeProperty('display');
        } else {
            // First time user who hasn't taken tour - disable button
            closeBtn.disabled = true;
            closeBtn.classList.add('disabled-btn'); // Optional visual cue
            closeBtn.title = "Please complete the interactive tour first";
            // Ensure no residual hide classes
            closeBtn.classList.remove('force-hide');
            closeBtn.style.removeProperty('display');
        }
    }

    // Show/hide Skip Instructions button in footer
    const skipBtn = document.getElementById('skip-instructions-btn');
    if (skipBtn) {
        if (hasSeenTour) {
            // User has completed tour - enable skip button
            skipBtn.disabled = false;
            skipBtn.classList.remove('disabled-btn');
            skipBtn.title = "Skip instructions";
            // Ensure no residual hide classes
            skipBtn.classList.remove('force-hide');
            skipBtn.style.removeProperty('display');
        } else {
            // User hasn't completed tour - disable skip button
            skipBtn.disabled = true;
            skipBtn.classList.add('disabled-btn');
            skipBtn.title = "Please complete the interactive tour first";
            // Ensure no residual hide classes
            skipBtn.classList.remove('force-hide');
            skipBtn.style.removeProperty('display');
        }
    }

    modal.classList.add('show');
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    // Populate appraisal dimensions dynamically
    populateInstructionAppraisals();

    // Track start time for first-time instruction reading
    // Only set if not already set (in case modal is opened/closed multiple times)
    if (instructionStartTime === null && !hasSeenInstructions()) {
        instructionStartTime = Date.now();
        console.log('📖 Started tracking instruction reading time');
    }

    // Keep button enabled (always clickable to track percentage)
    if (understoodBtn) {
        understoodBtn.disabled = false;
        understoodBtn.style.opacity = '1';
        understoodBtn.style.cursor = 'pointer';
    }

    // Set up scroll detection to track percentage
    if (modalBody) {
        // Remove any existing scroll handler first
        if (modalBody._scrollHandler) {
            modalBody.removeEventListener('scroll', modalBody._scrollHandler);
        }

        const checkScroll = () => {
            // Calculate scroll percentage
            const scrollTop = modalBody.scrollTop;
            const scrollHeight = modalBody.scrollHeight;
            const clientHeight = modalBody.clientHeight;
            const maxScroll = scrollHeight - clientHeight;
            const scrollPercentage = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 100;

            if (understoodBtn) {
                // Store scroll percentage for tracking
                understoodBtn.dataset.scrollPercentage = scrollPercentage.toFixed(1);
            }

            // Update instruction progress bar (smooth via CSS transition)
            const progressFillEl = document.getElementById('instruction-progress-fill');
            if (progressFillEl) {
                const clamped = Math.max(0, Math.min(100, scrollPercentage));
                progressFillEl.style.width = clamped + '%';
            }
        };

        // Check initial state (in case content is already fully visible)
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
            checkScroll();
        }, 100);

        // Store scroll handler for cleanup
        modalBody._scrollHandler = checkScroll;
        modalBody.addEventListener('scroll', checkScroll);
    }
}

function hideInstructionModal() {
    const modal = document.getElementById('instruction-modal');
    const modalBody = modal.querySelector('.instruction-body');

    // Remove scroll handler if it exists
    if (modalBody && modalBody._scrollHandler) {
        modalBody.removeEventListener('scroll', modalBody._scrollHandler);
        delete modalBody._scrollHandler;
    }

    modal.classList.remove('show');
    // Restore body scroll
    document.body.style.overflow = '';
}

function hasSeenInstructions() {
    const seen = localStorage.getItem(STORAGE_KEYS.INSTRUCTIONS_SEEN) === 'true';
    console.log('hasSeenInstructions check:', {
        key: STORAGE_KEYS.INSTRUCTIONS_SEEN,
        value: localStorage.getItem(STORAGE_KEYS.INSTRUCTIONS_SEEN),
        seen: seen
    });
    return seen;
}

function markInstructionsAsSeen() {
    console.log('Marking instructions as seen in localStorage');
    localStorage.setItem(STORAGE_KEYS.INSTRUCTIONS_SEEN, 'true');
}

// Utility function to reset instruction tracking (for testing/debugging)
function resetInstructionTracking() {
    console.log('Resetting instruction tracking...');
    localStorage.removeItem(STORAGE_KEYS.INSTRUCTIONS_SEEN);
    console.log('✅ Instruction tracking reset. Refresh the page to see instructions again.');
}

// Make it available globally for debugging
window.resetInstructionTracking = resetInstructionTracking;

// Store handler functions for instruction listeners to allow removal
let instructionHandlers = {
    showHandler: null,
    closeHandler: null,
    understoodHandler: null,
    demoTourHandler: null,
    backdropHandler: null
};

// Track when instruction modal is first opened (for reading time calculation)
let instructionStartTime = null;


function setupInstructionListeners() {
    // Setup collapsible sections in instruction modal
    const instructionModal = document.getElementById('instruction-modal');
    if (instructionModal) {
        const sectionHeaders = instructionModal.querySelectorAll('.section-header');
        sectionHeaders.forEach(header => {
            header.addEventListener('click', function () {
                const sectionId = this.getAttribute('data-section');
                const content = document.getElementById(`${sectionId}-content`);

                if (content) {
                    // Toggle collapsed state
                    this.classList.toggle('collapsed');
                    content.classList.toggle('collapsed');
                }
            });
        });
    }

    // Show instruction button
    const showBtn = document.getElementById('show-instructions-btn');
    if (showBtn) {
        // Remove existing listener if any
        if (instructionHandlers.showHandler) {
            showBtn.removeEventListener('click', instructionHandlers.showHandler);
        }
        // Create and store new handler
        instructionHandlers.showHandler = () => {
            showInstructionModal();
        };
        showBtn.addEventListener('click', instructionHandlers.showHandler);
    }

    // Close button
    const closeBtn = document.getElementById('close-instruction-modal');
    if (closeBtn) {
        // Remove existing listener if any
        if (instructionHandlers.closeHandler) {
            closeBtn.removeEventListener('click', instructionHandlers.closeHandler);
        }
        // Create and store new handler
        instructionHandlers.closeHandler = () => {
            hideInstructionModal();
        };
        closeBtn.addEventListener('click', instructionHandlers.closeHandler);
    }

    // Demo tour button
    const demoTourBtn = document.getElementById('start-demo-tour-btn');
    if (demoTourBtn) {
        // Remove existing listener if any
        if (instructionHandlers.demoTourHandler) {
            demoTourBtn.removeEventListener('click', instructionHandlers.demoTourHandler);
        }
        // Create and store new handler
        instructionHandlers.demoTourHandler = async () => {
            hideInstructionModal();
            // Small delay before starting demo tour for smooth transition
            setTimeout(() => {
                startDemoTour();
            }, 300);
        };
        demoTourBtn.addEventListener('click', instructionHandlers.demoTourHandler);
    }

    // Skip Instructions button
    const skipBtn = document.getElementById('skip-instructions-btn');
    if (skipBtn) {
        // Remove existing listener if any
        if (instructionHandlers.skipHandler) {
            skipBtn.removeEventListener('click', instructionHandlers.skipHandler);
        }
        // Create and store new handler
        instructionHandlers.skipHandler = () => {
            hideInstructionModal();
        };
        skipBtn.addEventListener('click', instructionHandlers.skipHandler);
    }

    // Understood button
    const understoodBtn = document.getElementById('instruction-understood-btn');
    if (understoodBtn) {
        // Remove existing listener if any
        if (instructionHandlers.understoodHandler) {
            understoodBtn.removeEventListener('click', instructionHandlers.understoodHandler);
        }
        // Create and store new handler
        instructionHandlers.understoodHandler = async () => {
            // Calculate scroll percentage at the moment of click (in case dataset wasn't updated)
            const modalBody = document.querySelector('#instruction-modal .instruction-body');
            let scrollPercentage = parseFloat(understoodBtn.dataset.scrollPercentage || '0');

            // Recalculate if modal body exists and dataset might be stale
            if (modalBody) {
                const scrollTop = modalBody.scrollTop;
                const scrollHeight = modalBody.scrollHeight;
                const clientHeight = modalBody.clientHeight;
                const maxScroll = scrollHeight - clientHeight;
                const calculatedPercentage = maxScroll > 0 ? Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100)) : 100;
                scrollPercentage = calculatedPercentage;
                console.log(`📊 Scroll percentage at click: ${scrollPercentage.toFixed(1)}%`);
            }

            const isFirstTime = !hasSeenInstructions();

            console.log('Instruction button clicked:', {
                isFirstTime,
                scrollPercentage,
                firebaseStorage: !!firebaseStorage
            });

            // Check if user has already completed the first instruction read in Firebase
            // If so, skip the percentage requirement (they're just reviewing or resuming)
            let hasCompletedFirstRead = false;
            if (firebaseStorage) {
                try {
                    const customUserId = firebaseStorage.getCustomUserId() || firebaseStorage.currentUser?.uid;
                    if (customUserId) {
                        const userDoc = await firebaseStorage.db.collection('users').doc(customUserId).get();
                        if (userDoc.exists && userDoc.data().first_instruction_read) {
                            hasCompletedFirstRead = true;
                            console.log('✅ User has already completed first instruction read - skipping percentage check');
                        }
                    }
                } catch (error) {
                    console.warn('Could not check first instruction read status:', error);
                }
            }

            console.log('Instruction proceed check:', {
                hasCompletedFirstRead,
                scrollPercentage,
                willEnforceCheck: !hasCompletedFirstRead
            });

            // ===== ATTENTION CHECK & EARLY REJECTION (BEFORE ANNOTATION) =====
            //
            // For Prolific/Sona participants, we enforce an instruction-reading attention check
            // *before* they can proceed to annotation. If they fail, we immediately
            // reject and redirect back to the platform, and DO NOT allow annotation.
            //
            // For non-platform users, we simply block proceeding and show a warning.

            const isProlific = (typeof isProlificSession === 'function') ? isProlificSession() : false;
            const isSona = (typeof isSonaSession === 'function') ? isSonaSession() : false;

            // Only enforce attention check if this is truly the first time and first read is not already completed
            if (!hasCompletedFirstRead && isFirstTime) {
                // Calculate reading time in seconds
                const readingTimeSeconds = instructionStartTime !== null
                    ? Math.round((Date.now() - instructionStartTime) / 1000)
                    : 0;

                // Check instruction quality for both Prolific and Sona
                const prolificChecks = PROLIFIC_CONFIG && PROLIFIC_CONFIG.instructionChecks;
                const sonaChecks = SONA_CONFIG && SONA_CONFIG.instructionChecks;
                const checks = isProlific ? prolificChecks : (isSona ? sonaChecks : null);
                const checksEnabled = !!(checks && checks.enabled);

                if (checksEnabled) {
                    const minScroll = checks.minScrollPercentage ?? 0;
                    const minTime = checks.minReadingTimeSeconds ?? 0;
                    const requireBoth = checks.requireBoth !== false; // default true

                    const scrollPassed = scrollPercentage >= minScroll;
                    const timePassed = readingTimeSeconds >= minTime;

                    let passed;
                    let reason = null;

                    if (requireBoth) {
                        passed = scrollPassed && timePassed;
                        if (!passed) {
                            const reasons = [];
                            if (!scrollPassed) {
                                reasons.push(`insufficient scroll (${scrollPercentage.toFixed(1)}% < ${minScroll}%)`);
                            }
                            if (!timePassed) {
                                reasons.push(`insufficient reading time (${readingTimeSeconds}s < ${minTime}s)`);
                            }
                            reason = reasons.join(', ');
                        }
                    } else {
                        passed = scrollPassed || timePassed;
                        if (!passed) {
                            reason = `both scroll (${scrollPercentage.toFixed(1)}% < ${minScroll}%) and reading time (${readingTimeSeconds}s < ${minTime}s) below thresholds`;
                        }
                    }

                    console.log('Instruction attention check result:', {
                        isProlific,
                        isSona,
                        scrollPercentage,
                        readingTimeSeconds,
                        scrollPassed,
                        timePassed,
                        passed,
                        reason
                    });

                    if (!passed) {
                        // Log attempt once in Firebase (for analytics)
                        if (firebaseStorage) {
                            try {
                                console.log('Attempting to log failed instruction attention check...');
                                await firebaseStorage.logInstructionReadAttempt(scrollPercentage, readingTimeSeconds);
                            } catch (error) {
                                console.error('Error logging failed instruction read attempt:', error);
                            }
                        }

                        // Close the instruction modal since the attention check failed
                        // (do this for all users so the rejection/warning is clearly visible)
                        hideInstructionModal();

                        // For Prolific sessions: immediately reject and redirect, do NOT allow annotation
                        if (isProlific && firebaseStorage && typeof getProlificRejectionURL === 'function') {
                            try {
                                await firebaseStorage.markProlificRejected(reason || 'Failed instruction attention check', {
                                    scrollPercentage,
                                    readingTimeSeconds
                                });
                            } catch (error) {
                                console.error('Error marking Prolific rejected after failed attention check:', error);
                            }

                            // Show rejection screen and redirect
                            if (typeof showProlificRejectionScreen === 'function') {
                                showProlificRejectionScreen({
                                    scrollPercentage,
                                    readingTimeSeconds
                                });
                            }

                            if (PROLIFIC_CONFIG.redirectOnComplete) {
                                setTimeout(() => {
                                    const redirectURL = getProlificRejectionURL();
                                    logProlificInfo('Redirecting to Prolific due to failed attention check', { url: redirectURL });
                                    window.location.href = redirectURL;
                                }, 3000); // 3s to read rejection message
                            }

                            return; // HARD STOP: do not proceed to annotation
                        }

                        // Handle Sona rejection
                        if (isSona && firebaseStorage && typeof getSonaRejectionURL === 'function') {
                            try {
                                const userId = firebaseStorage.getCustomUserId();
                                if (userId) {
                                    await firebaseStorage.db.collection('users').doc(userId).update({
                                        'sona.status': 'rejected',
                                        'sona.rejectedAt': firebase.firestore.FieldValue.serverTimestamp(),
                                        'sona.rejectionReason': reason || 'Failed instruction attention check'
                                    });
                                }
                            } catch (error) {
                                console.error('Error marking Sona rejected after failed attention check:', error);
                            }

                            // Show rejection screen and redirect
                            if (typeof showSonaRejectionScreen === 'function') {
                                showSonaRejectionScreen({
                                    scrollPercentage,
                                    readingTimeSeconds
                                });
                            }

                            if (SONA_CONFIG.redirectOnComplete) {
                                setTimeout(() => {
                                    const redirectURL = getSonaRejectionURL();
                                    logSonaInfo('Redirecting to Sona due to failed attention check', { url: redirectURL });
                                    window.location.href = redirectURL;
                                }, 3000); // 3s to read rejection message
                            }

                            return; // HARD STOP: do not proceed to annotation
                        }

                        // Non-Prolific or fallback: block proceeding and show warning
                        showStatus(
                            `Please read the instructions more carefully before proceeding. ` +
                            `You've scrolled ${scrollPercentage.toFixed(0)}% (min ${minScroll}%) and read for ${readingTimeSeconds}s (min ${minTime}s).`,
                            'warning'
                        );
                        setTimeout(() => hideStatus(), 6000);
                        return;
                    }
                }
            }

            // Attention check passed (or not enabled) OR user has already completed first read
            // Allow proceeding and log successful read once
            let firebaseWriteSuccess = false;

            // Calculate reading time in seconds
            const readingTimeSeconds = instructionStartTime !== null
                ? Math.round((Date.now() - instructionStartTime) / 1000)
                : 0;

            // Only log to Firebase if this is truly the first time (hasn't completed first read yet)
            if (!hasCompletedFirstRead && isFirstTime && firebaseStorage) {
                try {
                    console.log('Attempting to log instruction read (above threshold)...');
                    const result = await firebaseStorage.logInstructionReadAttempt(scrollPercentage, readingTimeSeconds);
                    if (result) {
                        console.log(`✅ Logged instruction read: ${scrollPercentage.toFixed(1)}% in ${readingTimeSeconds}s - synced to Firebase`);
                        firebaseWriteSuccess = true;
                        // Reset the start time after successful logging
                        instructionStartTime = null;
                    } else {
                        console.warn('⚠️ Failed to log instruction read to Firebase');
                    }
                } catch (error) {
                    console.error('Error logging instruction read attempt:', error);
                }
            } else if (hasCompletedFirstRead || !isFirstTime) {
                console.log('Skipping Firebase log - instructions already completed/seen');
                firebaseWriteSuccess = true; // Already recorded or not needed, so we can mark as seen
            }

            // Only mark as seen if Firebase write succeeded OR if it was already recorded
            if (firebaseWriteSuccess || !isFirstTime) {
                markInstructionsAsSeen();
            } else {
                console.warn('⚠️ Not marking instructions as seen because Firebase write failed - will retry next time');
            }

            hideInstructionModal();
        };
        understoodBtn.addEventListener('click', instructionHandlers.understoodHandler);
    }

    // Close on backdrop click
    const modal = document.getElementById('instruction-modal');
    if (modal) {
        // Remove existing listener if any
        if (instructionHandlers.backdropHandler) {
            modal.removeEventListener('click', instructionHandlers.backdropHandler);
        }
        // Create and store new handler
        instructionHandlers.backdropHandler = (e) => {
            if (e.target === modal) {
                // Don't mark as seen when closing via backdrop - user should use the button
                console.log('Instruction modal closed via backdrop - not marking as seen');
                hideInstructionModal();
            }
        };
        modal.addEventListener('click', instructionHandlers.backdropHandler);
    }
}

function updateUserBadge() {
    const badge = document.getElementById('user-badge');
    if (currentUsername) {
        badge.innerHTML = `
            <span class="user-icon">👤</span>
            <span class="username-text">${currentUsername}</span>
        `;
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        if (firebaseStorage) {
            localStorage.removeItem(STORAGE_KEYS.TOUR_SEEN);
            firebaseStorage.logout();
        }

        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        currentUsername = null;
        assignedDialogues = []; // Clear assigned dialogues
        location.reload();
    }
}

// ========== PROLIFIC INTEGRATION FUNCTIONS ==========

// Handle Prolific study completion
// NOTE: Instruction-reading attention checks are enforced EARLIER,
// at the instruction modal stage. We do NOT reject here after
// annotations are completed.
async function handleProlificCompletion() {
    try {
        // Calculate completion time
        const completionTime = studyStartTime ? Math.floor((Date.now() - studyStartTime) / 1000) : 0;

        logProlificInfo('Study completed', { completionTime: `${completionTime}s` });

        // Mark completion in Firebase
        await firebaseStorage.markProlificComplete(completionTime);

        // Show completion screen
        showProlificCompletionScreen();

        // Redirect to Prolific if enabled
        if (PROLIFIC_CONFIG.redirectOnComplete) {
            setTimeout(() => {
                const redirectURL = getProlificCompletionURL();
                logProlificInfo('Redirecting to Prolific', { url: redirectURL });
                window.location.href = redirectURL;
            }, 3000); // 3 second delay to show completion message
        }
    } catch (error) {
        console.error('Error handling Prolific completion:', error);
        // Still try to redirect even if Firebase update fails
        if (PROLIFIC_CONFIG.redirectOnComplete) {
            setTimeout(() => {
                window.location.href = getProlificCompletionURL();
            }, 3000);
        }
    }
}

// Show Prolific welcome message
function showProlificWelcome() {
    const message = `
        <div style="padding: 20px; background: #e7f3ff; border: 2px solid #2196F3; border-radius: 8px; margin: 20px;">
            <h3 style="margin-top: 0; color: #1976D2;">👋 Welcome Prolific Participant!</h3>
            <p>Thank you for participating in our study. You have been assigned <strong>5 unique dialogues</strong> to annotate.</p>
            <p><strong>Instructions:</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                <li>Review each dialogue carefully</li>
                <li>Revise the pre-filled annotations as needed</li>
                <li>Mark the minimum context turn</li>
                <li>Save each annotation before moving to the next</li>
            </ul>
            <p><strong>Important:</strong> After completing all 5 dialogues, you will be automatically redirected back to Prolific.</p>
        </div>
    `;
    showStatus(message, 'info', 10000); // Show for 10 seconds
}

// Show Prolific resume message
function showProlificResumeMessage() {
    const message = `
        <div style="padding: 20px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; margin: 20px;">
            <h3 style="margin-top: 0; color: #856404;">🔄 Welcome Back!</h3>
            <p>Your session has been resumed. You can continue annotating your remaining dialogues.</p>
            <p><strong>Your progress has been saved.</strong> Please continue where you left off.</p>
        </div>
    `;
    showStatus(message, 'info', 8000); // Show for 8 seconds
}

// Show Prolific completion message (already completed)
function showProlificCompletionMessage() {
    const completionCode = PROLIFIC_CONFIG.completionCode;
    const message = `
        <div style="padding: 30px; background: #d4edda; border: 3px solid #28a745; border-radius: 12px; text-align: center; max-width: 600px; margin: 50px auto;">
            <h2 style="color: #155724; margin-top: 0;">✅ Study Already Completed</h2>
            <p style="font-size: 16px;">You have already completed all assigned dialogues for this study.</p>
            ${completionCode ? `
                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                    <p style="margin: 0; font-weight: bold; color: #155724;">Completion Code:</p>
                    <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #28a745; letter-spacing: 2px;">${completionCode}</p>
                </div>
            ` : ''}
            <p style="margin-top: 20px; color: #666;">
                Please return to Prolific and use the completion code above if needed.
            </p>
            <button onclick="window.close()" style="margin-top: 20px; padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">
                Close Window
            </button>
        </div>
    `;

    document.body.innerHTML = message;
}

// Show Prolific completion screen
function showProlificCompletionScreen() {
    const completionCode = PROLIFIC_CONFIG.completionCode;
    const showCode = PROLIFIC_CONFIG.showCompletionCode;

    const message = `
        <div style="padding: 30px; background: #e8f5e9; border: 3px solid #4CAF50; border-radius: 12px; text-align: center;">
            <h2 style="color: #2E7D32; margin-top: 0;">🎉 Study Complete!</h2>
            <p style="font-size: 18px;">Thank you for your participation!</p>
            ${showCode ? `
                <div style="margin: 20px 0; padding: 15px; background: white; border-radius: 8px;">
                    <p style="margin: 0 0 10px 0; font-weight: bold;">Your Completion Code:</p>
                    <p style="font-size: 24px; font-weight: bold; color: #1976D2; margin: 0; letter-spacing: 2px;">${completionCode}</p>
                </div>
                <p style="font-size: 14px; color: #666;">
                    You will be automatically redirected to Prolific in 5 seconds.<br/>
                    If not redirected, please use the completion code above.
                </p>
            ` : `
                <p style="margin-top: 20px;">Redirecting you back to Prolific...</p>
            `}
        </div>
    `;

    // Replace main content with completion screen
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.innerHTML = message;
    } else {
        showStatus(message, 'success', 30000);
    }
}

// Show Prolific rejection screen
function showProlificRejectionScreen(qualityCheck) {
    // Handle edge case where data might be undefined
    const scrollPercentage = qualityCheck.scrollPercentage !== undefined ? qualityCheck.scrollPercentage : 0;
    const readingTimeSeconds = qualityCheck.readingTimeSeconds !== undefined ? qualityCheck.readingTimeSeconds : 0;
    const { minScrollPercentage, minReadingTimeSeconds } = PROLIFIC_CONFIG.instructionChecks;

    const message = `
        <div style="padding: 30px; background: #fff3e0; border: 3px solid #ff9800; border-radius: 12px; text-align: center; max-width: 700px; margin: 50px auto;">
            <h2 style="color: #e65100; margin-top: 0;">⚠️ Submission Not Accepted</h2>
            <p style="font-size: 16px; margin: 20px 0;">Unfortunately, you did not pass the attention check for this study.</p>
            
            <p style="margin-top: 25px; font-size: 14px; color: #666;">
                You will be automatically redirected to Prolific in 3 seconds.<br/>
                Your submission will be marked as incomplete.
            </p>
            
            <p style="margin-top: 20px; font-size: 12px; color: #999;">
                If you believe this is an error, please contact the researcher through Prolific.
            </p>
        </div>
    `;

    // Replace entire container with rejection screen
    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = message;
    } else {
        document.body.innerHTML = message;
    }
}

// Show Prolific duplicate error
function showProlificDuplicateError() {
    const message = `
        <div style="padding: 30px; background: #ffebee; border: 3px solid #f44336; border-radius: 12px; text-align: center; max-width: 600px; margin: 50px auto;">
            <h2 style="color: #c62828; margin-top: 0;">⚠️ Already Participated</h2>
            <p style="font-size: 16px;">You have already participated in this study.</p>
            <p style="margin-top: 20px; color: #666;">
                Our records show that your Prolific ID has already been used.<br/>
                Please return to Prolific and return this submission.
            </p>
            <button onclick="window.close()" style="margin-top: 20px; padding: 12px 24px; background: #f44336; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">
                Close Window
            </button>
        </div>
    `;

    document.body.innerHTML = message;
}

// Show Prolific error
function showProlificError(message) {
    const errorHTML = `
        <div style="padding: 30px; background: #ffebee; border: 3px solid #f44336; border-radius: 12px; text-align: center; max-width: 600px; margin: 50px auto;">
            <h2 style="color: #c62828; margin-top: 0;">❌ Error</h2>
            <p style="font-size: 16px;">${message}</p>
            <p style="margin-top: 20px; color: #666;">
                Please return to Prolific and report this issue to the researcher.
            </p>
        </div>
    `;

    document.body.innerHTML = errorHTML;
}

// ========== SONA INTEGRATION FUNCTIONS ==========

// Show Sona welcome message
function showSonaWelcome() {
    const message = `
        <div style="padding: 20px; background: #e7f3ff; border: 2px solid #2196F3; border-radius: 8px; margin: 20px;">
            <h3 style="margin-top: 0; color: #1976D2;">👋 Welcome Sona Participant!</h3>
            <p>Thank you for participating in our study. You have been assigned <strong>10 unique dialogues</strong> to annotate.</p>
            <p><strong>Instructions:</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                <li>Review each dialogue carefully</li>
                <li>Revise the pre-filled annotations as needed</li>
                <li>Mark the minimum context turn</li>
                <li>Save each annotation before moving to the next</li>
            </ul>
            <p><strong>Important:</strong> After completing all dialogues, you will be automatically redirected back to Sona.</p>
        </div>
    `;
    showStatus(message, 'info', 10000); // Show for 10 seconds
}

// Show Sona resume message
function showSonaResumeMessage() {
    const message = `
        <div style="padding: 20px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; margin: 20px;">
            <h3 style="margin-top: 0; color: #856404;">🔄 Welcome Back!</h3>
            <p>Your session has been resumed. You can continue annotating your remaining dialogues.</p>
            <p><strong>Your progress has been saved.</strong> Please continue where you left off.</p>
        </div>
    `;
    showStatus(message, 'info', 8000); // Show for 8 seconds
}

// Show Sona completion message (already completed)
function showSonaCompletionMessage() {
    const surveyCode = sonaParams?.surveyCode || 'COMPLETED';
    const message = `
        <div style="padding: 30px; background: #d4edda; border: 3px solid #28a745; border-radius: 12px; text-align: center; max-width: 600px; margin: 50px auto;">
            <h2 style="color: #155724; margin-top: 0;">✅ Study Already Completed</h2>
            <p style="font-size: 16px;">You have already completed all assigned dialogues for this study.</p>
            ${SONA_CONFIG.showCompletionCode ? `
                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                    <p style="margin: 0; font-weight: bold; color: #155724;">Survey Code:</p>
                    <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #28a745; letter-spacing: 2px;">${surveyCode}</p>
                </div>
            ` : ''}
            <p style="margin-top: 20px; color: #666;">
                Please return to Sona and use the survey code above if needed.
            </p>
            <button onclick="window.close()" style="margin-top: 20px; padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">
                Close Window
            </button>
        </div>
    `;

    document.body.innerHTML = message;
}

// Show Sona completion screen
function showSonaCompletionScreen() {
    const surveyCode = sonaParams?.surveyCode || 'COMPLETED';
    const showCode = SONA_CONFIG.showCompletionCode;

    const message = `
        <div style="padding: 30px; background: #e8f5e9; border: 3px solid #4CAF50; border-radius: 12px; text-align: center;">
            <h2 style="color: #2e7d32; margin-top: 0;">✅ Study Completed!</h2>
            <p style="font-size: 18px; margin: 20px 0;">Thank you for completing all annotations.</p>
            ${showCode ? `
                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                    <p style="margin: 0; font-weight: bold; color: #2e7d32;">Your Survey Code:</p>
                    <p style="margin: 10px 0 0 0; font-size: 28px; font-weight: bold; color: #4CAF50; letter-spacing: 3px;">${surveyCode}</p>
                </div>
            ` : ''}
            <p style="margin-top: 20px; color: #666;">
                You will be automatically redirected to Sona in 3 seconds.
            </p>
        </div>
    `;

    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = message;
    } else {
        document.body.innerHTML = message;
    }
}

// Show Sona rejection screen
function showSonaRejectionScreen(qualityCheck) {
    const scrollPercentage = qualityCheck.scrollPercentage !== undefined ? qualityCheck.scrollPercentage : 0;
    const readingTimeSeconds = qualityCheck.readingTimeSeconds !== undefined ? qualityCheck.readingTimeSeconds : 0;
    const { minScrollPercentage, minReadingTimeSeconds } = SONA_CONFIG.instructionChecks;

    const message = `
        <div style="padding: 30px; background: #fff3e0; border: 3px solid #ff9800; border-radius: 12px; text-align: center; max-width: 700px; margin: 50px auto;">
            <h2 style="color: #e65100; margin-top: 0;">⚠️ Submission Not Accepted</h2>
            <p style="font-size: 16px; margin: 20px 0;">Unfortunately, you did not pass the attention check for this study.</p>
            
            <p style="margin-top: 25px; font-size: 14px; color: #666;">
                You will be automatically redirected to Sona in 3 seconds.<br/>
                Your submission will be marked as incomplete.
            </p>
            
            <p style="margin-top: 20px; font-size: 12px; color: #999;">
                If you believe this is an error, please contact the researcher through Sona.
            </p>
        </div>
    `;

    const container = document.querySelector('.container');
    if (container) {
        container.innerHTML = message;
    } else {
        document.body.innerHTML = message;
    }
}

// Show Sona error message
function showSonaError(message) {
    const errorHTML = `
        <div style="padding: 30px; background: #ffebee; border: 3px solid #f44336; border-radius: 12px; text-align: center; max-width: 600px; margin: 50px auto;">
            <h2 style="color: #c62828; margin-top: 0;">❌ Error</h2>
            <p style="font-size: 16px;">${message}</p>
            <p style="margin-top: 20px; color: #666;">
                Please return to Sona and report this issue to the researcher.
            </p>
        </div>
    `;

    document.body.innerHTML = errorHTML;
}

// Handle Sona study completion
async function handleSonaCompletion() {
    try {
        // Calculate completion time
        const completionTime = studyStartTime ? Math.floor((Date.now() - studyStartTime) / 1000) : 0;

        logSonaInfo('Study completed', { completionTime: `${completionTime}s` });

        // Mark completion in Firebase
        if (sonaParams && currentUsername) {
            const userId = firebaseStorage.getCustomUserId();
            if (userId) {
                try {
                    await firebaseStorage.db.collection('users').doc(userId).update({
                        'sona.status': 'completed',
                        'sona.completedAt': firebase.firestore.FieldValue.serverTimestamp(),
                        'sona.completionTime': completionTime
                    });
                } catch (error) {
                    console.warn('Failed to update Sona completion status:', error);
                }
            }
        }

        // Show completion screen
        showSonaCompletionScreen();

        // Redirect to Sona if enabled
        if (SONA_CONFIG.redirectOnComplete && sonaParams) {
            setTimeout(() => {
                const redirectURL = getSonaCompletionURL(sonaParams.surveyCode);
                logSonaInfo('Redirecting to Sona', { url: redirectURL });
                window.location.href = redirectURL;
            }, 3000); // 3 second delay to show completion message
        }
    } catch (error) {
        console.error('Error handling Sona completion:', error);
        // Still try to redirect even if Firebase update fails
        if (SONA_CONFIG.redirectOnComplete && sonaParams) {
            setTimeout(() => {
                window.location.href = getSonaCompletionURL(sonaParams.surveyCode);
            }, 3000);
        }
    }
}

// ========== FEEDBACK MODAL ==========

let feedbackRating = 0;

function showFeedbackModal() {
    const modal = document.getElementById('feedback-modal');
    if (modal) {
        modal.classList.add('show');
        setupFeedbackListeners();
        resetFeedbackForm();
    }
}

function hideFeedbackModal() {
    const modal = document.getElementById('feedback-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function resetFeedbackForm() {
    feedbackRating = 0;
    document.getElementById('feedback-rating').value = '0';
    document.getElementById('feedback-comments').value = '';

    // Reset stars
    const stars = document.querySelectorAll('#feedback-star-rating .star');
    stars.forEach(star => {
        star.textContent = '☆';
        star.classList.remove('selected');
    });

    // Reset submit button state
    const submitBtn = document.getElementById('feedback-submit');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('disabled');
    }

    // Hide error
    const errorDiv = document.getElementById('feedback-error');
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
}

function setupFeedbackListeners() {
    const submitBtn = document.getElementById('feedback-submit');
    const commentsTextarea = document.getElementById('feedback-comments');
    const errorDiv = document.getElementById('feedback-error');

    // Function to update submit button state based on validation
    function updateSubmitButtonState() {
        // Only rating is required, comments are optional
        const isValid = feedbackRating > 0;

        if (isValid) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('disabled');
            errorDiv.classList.add('hidden');
        } else {
            submitBtn.disabled = true;
            submitBtn.classList.add('disabled');
        }
    }

    // Star rating
    const stars = document.querySelectorAll('#feedback-star-rating .star');
    stars.forEach(star => {
        star.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            feedbackRating = parseInt(this.getAttribute('data-rating'));
            document.getElementById('feedback-rating').value = feedbackRating;

            // Update visual state
            stars.forEach((s, idx) => {
                if (idx < feedbackRating) {
                    s.textContent = '★';
                    s.classList.add('selected');
                } else {
                    s.textContent = '☆';
                    s.classList.remove('selected');
                }
            });

            // Update submit button state
            updateSubmitButtonState();
        });

        // Hover effect
        star.addEventListener('mouseenter', function () {
            const rating = parseInt(this.getAttribute('data-rating'));
            stars.forEach((s, idx) => {
                if (idx < rating) {
                    s.textContent = '★';
                } else {
                    s.textContent = '☆';
                }
            });
        });
    });

    const starContainer = document.getElementById('feedback-star-rating');
    starContainer.addEventListener('mouseleave', function () {
        // Restore selected rating
        stars.forEach((s, idx) => {
            if (idx < feedbackRating) {
                s.textContent = '★';
            } else {
                s.textContent = '☆';
            }
        });
    });

    // Comments textarea - update submit button state on input
    commentsTextarea.addEventListener('input', function () {
        updateSubmitButtonState();
    });

    // Prevent Enter key from submitting (user must click button)
    commentsTextarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            // Allow Ctrl+Enter to submit
            e.preventDefault();
            if (!submitBtn.disabled) {
                handleFeedbackSubmit();
            }
        } else if (e.key === 'Enter') {
            // Allow Enter for new lines in textarea
            // Don't prevent default
        }
    });

    // Submit button - only enabled when both fields are filled
    submitBtn.disabled = true;
    submitBtn.classList.add('disabled');
    submitBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (!submitBtn.disabled) {
            await handleFeedbackSubmit();
        }
    });

    // Skip button
    const skipBtn = document.getElementById('feedback-skip');
    skipBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        hideFeedbackModal();

        // If Prolific/Sona and feedback was skipped, still handle completion
        if (isProlific) {
            handleProlificCompletion();
        } else if (isSona) {
            handleSonaCompletion();
        }
    });

    // Initial state
    updateSubmitButtonState();
}

async function handleFeedbackSubmit() {
    const comments = document.getElementById('feedback-comments').value.trim();
    const errorDiv = document.getElementById('feedback-error');

    // Validate - Only rating is required, comments are optional
    if (feedbackRating === 0) {
        errorDiv.textContent = 'Please provide a star rating (1-5 stars)';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Rating is provided, proceed with submission (comments are optional)
    try {
        // Save feedback to Firebase
        const success = await firebaseStorage.saveFeedback({
            rating: feedbackRating,
            comments: comments || '' // Allow empty comments
        });

        if (success) {
            hideFeedbackModal();
            showStatus('Thank you for your feedback! 🙏', 'success', 4000);

            // Handle completion after feedback is submitted
            if (isProlific) {
                await handleProlificCompletion();
            } else if (isSona) {
                await handleSonaCompletion();
            }
        } else {
            errorDiv.textContent = 'Failed to save feedback. Please try again.';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error submitting feedback:', error);
        errorDiv.textContent = 'Error submitting feedback: ' + error.message;
        errorDiv.classList.remove('hidden');
    }
}

// ========== END FEEDBACK MODAL ==========

// ========== END PROLIFIC INTEGRATION ==========

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App starting...');
    await initFirebaseStorage();
    init();
});

