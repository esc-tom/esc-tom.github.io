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
let cognitiveDimensions = [];
let selectedAppraisals = [];
let minContextTurnIndex = null; // Tracks which turn provides minimum necessary context
let modifiedUtterances = {}; // Track modified utterances { turnIndex: { plain, marked } }
const MAX_APPRAISALS = 5;
const DIALOGUES_PER_USER = 10; // Number of dialogues to assign per user

// Prolific integration state
let isProlific = false; // Whether current session is from Prolific
let prolificParams = null; // Prolific URL parameters
let studyStartTime = null; // When study started (for timing)

// DOM Elements
const dialogueSelect = document.getElementById('dialogue-select');
const dialogueContainer = document.getElementById('dialogue-container');
const progressText = document.getElementById('progress-text');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');

// Annotation inputs
const beliefInput = document.getElementById('belief');
const desireInput = document.getElementById('desire');
const intentionInput = document.getElementById('intention');
const appraisalOptionsContainer = document.getElementById('appraisal-options');
const selectedAppraisalsContainer = document.getElementById('selected-appraisals');

// LocalStorage keys
const STORAGE_KEYS = {
    CURRENT_USER: 'annotation_username'
};

// Initialize
async function init() {
    // Load dialogues first (needed for registration sampling)
    await loadDialogues();
    await loadCognitiveDimensions();
    
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

    // Regular session flow
    setupLoginListeners();

    if (!firebaseReady) {
        await initFirebaseStorage();
    }

    // Wait for persisted Firebase auth session (if any)
    const authUser = await firebaseStorage.waitForAuthReady();
    if (authUser) {
        const profile = await firebaseStorage.getUserProfile(authUser.uid);
        
        if (profile && profile.username) {
            currentUsername = profile.username;
            hideLoginModal();
            await initializeApp();
            return;
        }

        // If auth exists but no profile, force logout and show login
        await firebaseStorage.logout();
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
                    
                    // Store password for future sessions
                    await firebaseStorage.db.collection('users').doc(recreateResult.uid).update({
                        'prolific.password': password
                    });
                    
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
            
            // Validate profile is complete
            if (!prolificUser.username || !prolificUser.uid) {
                logProlificInfo('Profile incomplete, will attempt recreation below');
                prolificUser = null; // Will fall through to recreation logic below
            }
            
            // Only proceed if profile is complete
            if (prolificUser && prolificUser.username && prolificUser.uid) {
                // Profile is complete, proceed with normal flow
                // Check if they've completed all annotations
                const isCompleted = await firebaseStorage.hasCompletedAllAnnotations(prolificUser.uid);
            
                if (isCompleted) {
                    // Already completed - show completion message
                    logProlificInfo('Participant has already completed all annotations');
                    hideLoginModal();
                    showProlificCompletionMessage();
                    return;
                }
            
                // Not completed - auto-login and resume
                logProlificInfo('Participant not completed, auto-logging in to resume session');
            
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
                            // Update Firestore with recovered password
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
                            
                            // Update password in Firestore
                            try {
                                await firebaseStorage.db.collection('users').doc(recreateResult.uid).update({
                                    'prolific.password': password
                                });
                            } catch (err) {
                                console.warn('Failed to update password:', err);
                            }
                        }
                        
                        currentUsername = recreateResult.username;
                        hideLoginModal();
                        showProlificResumeMessage();
                        await initializeApp();
                        return;
                    } else {
                        showProlificError('Unable to resume session. Please contact the researcher.');
                        return;
                    }
                }
                
                // Update session ID if it's different (new Prolific session)
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
                // The original 10 dialogues assigned at registration must be preserved
                assignedDialogues = prolificUser.assignedDialogues || [];
                if (assignedDialogues.length === 0) {
                    console.warn('⚠️ WARNING: User profile has no assigned dialogues - this should not happen');
                } else {
                    logProlificInfo(`Resuming with ${assignedDialogues.length} originally assigned dialogues`);
                }
                currentUsername = username;
                
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
                    
                    // Update password in Firestore
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
        
        // Hide login modal and start annotation
        hideLoginModal();
        showProlificWelcome();
        await initializeApp();
        
    } catch (error) {
        console.error('Error handling Prolific session:', error);
        showProlificError('An error occurred. Please contact the researcher.');
    }
}

// Initialize the main app after login
async function initializeApp() {
    updateUserBadge();
    
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
    setupNotificationListeners();
    await checkAnnotationProgress();
    
    // Automatically load first unannotated dialogue or first dialogue
    if (allDialogues.length > 0) {
        const firstUnannotated = await findFirstUnannotatedDialogue();
        const indexToLoad = firstUnannotated !== -1 ? firstUnannotated : 0;
        dialogueSelect.value = indexToLoad;
        await handleDialogueChange();
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
        
        // Load assigned dialogues for current user if logged in
        if (currentUsername && firebaseReady) {
            await loadAssignedDialogues();
            populateDialogueSelector();
        }
    } catch (error) {
        console.error('Error loading dialogues:', error);
        showStatus('Error loading eval data. Make sure data/eval_data.json exists.', 'error');
    }
}

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
        
        // Filter out already assigned dialogues
        const availableDialogues = allDialogues.filter(d => 
            !alreadyAssigned.includes(d.entry_id) && !excludeIds.includes(d.entry_id)
        );
        
        console.log(`🎲 Sampling ${n} from ${availableDialogues.length} available dialogues (${alreadyAssigned.length} already assigned)`);
        
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
        const response = await fetch('data/cognitive_dimensions.json');
        cognitiveDimensions = await response.json();
        renderAppraisalOptions();
    } catch (error) {
        console.error('Error loading cognitive dimensions:', error);
        showStatus('Error loading cognitive dimensions', 'error');
    }
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
        const annotatedDialogues = await firebaseStorage.getUserAnnotations();
        
        // Check annotation status for all dialogues
        for (let i = 0; i < allDialogues.length; i++) {
            const dialogue = allDialogues[i];
            const isAnnotated = annotatedDialogues.includes(dialogue.entry_id);
            annotationStatus[dialogue.entry_id] = isAnnotated;
            
            // Only count if it's in the user's assigned dialogues
            if (isAnnotated && (assignedDialogues.length === 0 || assignedDialogues.includes(dialogue.entry_id))) {
                annotatedCount++;
            }
        }
        
        // Show progress relative to assigned dialogues
        totalToAnnotate = assignedDialogues.length > 0 ? assignedDialogues.length : allDialogues.length;
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
        if (assignedDialogues.length > 0 && !assignedDialogues.includes(dialogue.entry_id)) {
            continue; // Skip dialogues not assigned to this user
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
    
    if (currentUsername) {
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
    appraisalOptionsContainer.innerHTML = '';
    cognitiveDimensions.forEach(dimension => {
        const key = Object.keys(dimension)[0];
        const description = Object.values(dimension)[0];
        
        const option = document.createElement('div');
        option.className = 'appraisal-option';
        option.dataset.key = key;
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'appraisal-option-name';
        nameDiv.textContent = key.replace(/_/g, ' ');
        
        const descDiv = document.createElement('div');
        descDiv.className = 'appraisal-option-desc';
        descDiv.textContent = description;
        
        option.appendChild(nameDiv);
        option.appendChild(descDiv);
        option.addEventListener('click', () => addAppraisal(key, description));
        appraisalOptionsContainer.appendChild(option);
    });
    updateAppraisalOptions();
}

// Setup event listeners
function setupEventListeners() {
    dialogueSelect.addEventListener('change', handleDialogueChange);
    saveBtn.addEventListener('click', saveAnnotation);
    clearBtn.addEventListener('click', clearAnnotations);
    
    // Setup collapsible sections
    setupCollapsibleSections();
    
    // Setup modal listeners
    setupModalListeners();
}

// Setup modal event listeners
function setupModalListeners() {
    const confirmSaveBtn = document.getElementById('confirm-save');
    const confirmCancelBtn = document.getElementById('confirm-cancel');
    const modal = document.getElementById('confirm-modal');
    
    confirmSaveBtn.addEventListener('click', performSave);
    confirmCancelBtn.addEventListener('click', hideConfirmModal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            hideConfirmModal();
        }
    });
}

// Setup collapsible section functionality
function setupCollapsibleSections() {
    const sectionHeaders = document.querySelectorAll('.section-header');
    sectionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const sectionId = this.getAttribute('data-section');
            const content = document.getElementById(`${sectionId}-content`);
            
            // Toggle collapsed state
            this.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        });
    });
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
    
    // Update dialogue info
    updateDialogueInfo();
    
    // Display context (situation and thought)
    displayContext();
    
    // Display persona information
    displayPersonaInfo();
    
    // Clear and reset
    dialogueContainer.innerHTML = '';
    clearAnnotations();
    
    // Load ground truth first (pre-populate)
    loadGroundTruth();
    
    // Try to load existing annotation (will override ground truth if exists)
    await loadExistingAnnotation();
    
    // Automatically show exploration phase turns
    showExplorationTurns();
    
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

// Display context (situation and thought)
// NOTE: Hidden from annotators - situation and thought are not shown
function displayContext() {
    const contextSection = document.getElementById('context-section');
    if (contextSection) {
        // Always hide the context section from annotators
        contextSection.style.display = 'none';
    }
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
    
    // Iterate through dialogue history in pairs
    for (let i = 0; i < currentDialogue.dialogue_history.length; i += 2) {
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
    
    if (turnPairIndex === 0) {
        dialogueContainer.innerHTML = '<p class="placeholder">No turns found in this dialogue.</p>';
    } else {
        // Scroll to top to show first turn
        dialogueContainer.scrollTop = 0;
        console.log(`Showing ${turnPairIndex} turn pairs`);
    }
}

// BDI prefixes
const BDI_PREFIXES = {
    belief: 'I believe that',
    desire: 'I wish to',
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
        <span class="dialogue-id">${currentDialogue.entry_id}</span>
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
        const annotation = await firebaseStorage.loadAnnotation(currentUsername, entryId);
        return annotation;
    } catch (error) {
        console.error('Error loading annotation:', error);
        return null;
    }
}

async function saveAnnotationToStorage(entryId, annotation) {
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
        await firebaseStorage.saveAnnotation(currentUsername, entryId, annotation);
        console.log(`✅ Saved to Firebase: ${entryId}`);
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
    
    // Pre-populate cognitive appraisals
    if (gt.cognitive_appraisals && Array.isArray(gt.cognitive_appraisals)) {
        selectedAppraisals = [];
        console.log('  🧠 Loading appraisals:', gt.cognitive_appraisals);
        
        gt.cognitive_appraisals.forEach(dimensionKey => {
            // Find the dimension in cognitiveDimensions
            const dimension = cognitiveDimensions.find(d => {
                const key = Object.keys(d)[0];
                return key === dimensionKey;
            });
            if (dimension) {
                const key = Object.keys(dimension)[0];
                const description = Object.values(dimension)[0];
                selectedAppraisals.push({
                    dimension: key,
                    description: description
                });
                console.log(`    ✓ Added: ${key}`);
            } else {
                console.warn(`    ❌ Ground truth dimension "${dimensionKey}" not found in cognitive_dimensions.json`);
            }
        });
        
        console.log(`  ✓ Pre-selected ${selectedAppraisals.length} appraisals`);
        renderSelectedAppraisals();
        updateAppraisalOptions();
    }
    
    console.log('Ground truth loaded and pre-populated successfully');
}

// Load existing annotation if available
async function loadExistingAnnotation() {
    try {
        const annotation = await getAnnotationFromStorage(currentDialogue.entry_id);
        
        if (annotation) {
            // Populate form fields (strip edit markers and prefixes when loading)
            beliefInput.value = stripPrefix('belief', stripEditMarkers(annotation.belief || ''));
            desireInput.value = stripPrefix('desire', stripEditMarkers(annotation.desire || ''));
            intentionInput.value = stripPrefix('intention', stripEditMarkers(annotation.intention || ''));
            
            // Populate cognitive appraisals
            if (annotation.cognitive_appraisals) {
                selectedAppraisals = annotation.cognitive_appraisals;
                renderSelectedAppraisals();
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
function addAppraisal(key, description) {
    if (selectedAppraisals.length >= MAX_APPRAISALS) {
        showStatus(`Maximum ${MAX_APPRAISALS} appraisals allowed`, 'error');
        setTimeout(() => hideStatus(), 2000);
        return;
    }
    
    // Check if already added
    if (selectedAppraisals.some(a => a.dimension === key)) {
        showStatus('This appraisal is already selected', 'error');
        setTimeout(() => hideStatus(), 2000);
        return;
    }
    
    selectedAppraisals.push({
        dimension: key,
        description: description
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
        selectedAppraisalsContainer.innerHTML = '<p class="placeholder-small">Click on dimensions above to add them here</p>';
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
        rankNum.textContent = `${index + 1}.`;
        
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
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'appraisal-item-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', () => removeAppraisal(appraisal.dimension));
        
        controlsContainer.appendChild(removeBtn);
        
        // Assemble the item
        item.appendChild(dragHandle);
        item.appendChild(rankNum);
        item.appendChild(contentContainer);
        item.appendChild(controlsContainer);
        
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
    
    // Re-render
    renderSelectedAppraisals();
    
    return false;
}

// Update appraisal options (disable selected ones)
function updateAppraisalOptions() {
    const options = appraisalOptionsContainer.querySelectorAll('.appraisal-option');
    options.forEach(option => {
        const key = option.dataset.key;
        if (selectedAppraisals.some(a => a.dimension === key)) {
            option.classList.add('disabled');
        } else {
            option.classList.remove('disabled');
        }
    });
}

// Clear all annotations
function clearAnnotations() {
    beliefInput.value = '';
    desireInput.value = '';
    intentionInput.value = '';
    selectedAppraisals = [];
    renderSelectedAppraisals();
    updateAppraisalOptions();
    minContextTurnIndex = null;
    hideStatus();
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
    
    modal.classList.add('show');
}

// Hide confirmation modal
function hideConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('show');
}

// Actually save the annotation
async function performSave() {
    hideConfirmModal();
    
    // Build BDI with edit markers relative to ground truth (pre-event) if available
    let beliefValue = '';
    let desireValue = '';
    let intentionValue = '';
    
    const gt = currentDialogue.ground_truth || {};
    
    // Belief
    const editedBelief = addPrefix('belief', beliefInput.value || '');
    const originalBelief = gt.belief ? addPrefix('belief', gt.belief || '') : editedBelief;
    beliefValue = (editedBelief !== originalBelief)
        ? markEditedSpan(originalBelief, editedBelief)
        : editedBelief;
    
    // Desire
    const editedDesire = addPrefix('desire', desireInput.value || '');
    const originalDesire = gt.desire ? addPrefix('desire', gt.desire || '') : editedDesire;
    desireValue = (editedDesire !== originalDesire)
        ? markEditedSpan(originalDesire, editedDesire)
        : editedDesire;
    
    // Intention
    const editedIntention = addPrefix('intention', intentionInput.value || '');
    const originalIntention = gt.intention ? addPrefix('intention', gt.intention || '') : editedIntention;
    intentionValue = (editedIntention !== originalIntention)
        ? markEditedSpan(originalIntention, editedIntention)
        : editedIntention;
    
    // Compute edit statistics
    const editedUtterancesCount = Object.keys(modifiedUtterances).length;
    const utteranceEditSpans = Object.values(modifiedUtterances).reduce(
        (sum, info) => sum + countEditSpans(info.marked),
        0
    );
    const bdiEditSpans =
        countEditSpans(beliefValue) +
        countEditSpans(desireValue) +
        countEditSpans(intentionValue);
    const totalEditSpans = utteranceEditSpans + bdiEditSpans;
    
    const annotation = {
        entry_id: currentDialogue.entry_id,
        username: currentUsername,
        turns_viewed: currentTurnIndex,
        total_turns: currentDialogue.dialogue_history.length,
        min_context_turn: minContextTurnIndex,
        belief: beliefValue,
        desire: desireValue,
        intention: intentionValue,
        cognitive_appraisals: selectedAppraisals,
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
        // Edit statistics
        edit_stats: {
            edited_utterances: editedUtterancesCount,
            utterance_edit_spans: utteranceEditSpans,
            bdi_edit_spans: bdiEditSpans,
            total_edit_spans: totalEditSpans
        },
        timestamp: new Date().toISOString()
    };
    
    try {
        // Save to Firebase
        await saveAnnotationToStorage(currentDialogue.entry_id, annotation);
        
        // Update annotation status and progress bar
        annotationStatus[currentDialogue.entry_id] = true;
        
        // Recompute annotated count over assigned dialogues only
        let annotatedCount = 0;
        const relevantIds = assignedDialogues.length > 0
            ? assignedDialogues
            : allDialogues.map(d => d.entry_id);
        
        for (const id of relevantIds) {
            if (annotationStatus[id]) annotatedCount++;
        }
        const totalToAnnotate = relevantIds.length;
        
        updateProgressBar(annotatedCount, totalToAnnotate);
        
        // Build and show edit summary
        const bdiEdited = bdiEditSpans > 0;
        const appraisalsCount = selectedAppraisals.length;
        
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
            const completionMsg = assignedDialogues.length > 0 
                ? `🎉 All ${assignedDialogues.length} assigned dialogues completed!`
                : '🎉 All dialogues completed!';
            showStatus(completionMsg, 'success');
            
            // Show feedback modal (unless already submitted)
            const hasFeedback = await firebaseStorage.hasFeedback();
            if (!hasFeedback) {
                setTimeout(() => {
                    showFeedbackModal();
                }, 2000); // Show after 2 seconds
            }
            
            // Handle Prolific completion
            if (isProlific) {
                await handleProlificCompletion();
            }
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

        // Ensure Firestore profile exists for this authenticated user
        const profile = await firebaseStorage.getUserProfile(result.uid);
        if (!profile) {
            await firebaseStorage.logout();
            showLoginError('Account not found in annotation records. Please register.');
            return;
        }
        
        currentUsername = profile.username || username;
        
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

function updateUserBadge() {
    const badge = document.getElementById('user-badge');
    if (currentUsername) {
        badge.innerHTML = `
            <span class="user-icon">👤</span>
            <span class="username-text">${currentUsername}</span>
            <button class="logout-btn" onclick="handleLogout()">Logout</button>
        `;
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        if (firebaseStorage) {
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
            }, 5000); // 5 second delay to show completion message
        }
    } catch (error) {
        console.error('Error handling Prolific completion:', error);
        // Still try to redirect even if Firebase update fails
        if (PROLIFIC_CONFIG.redirectOnComplete) {
            setTimeout(() => {
                window.location.href = getProlificCompletionURL();
            }, 5000);
        }
    }
}

// Show Prolific welcome message
function showProlificWelcome() {
    const message = `
        <div style="padding: 20px; background: #e7f3ff; border: 2px solid #2196F3; border-radius: 8px; margin: 20px;">
            <h3 style="margin-top: 0; color: #1976D2;">👋 Welcome Prolific Participant!</h3>
            <p>Thank you for participating in our study. You have been assigned <strong>10 unique dialogues</strong> to annotate.</p>
            <p><strong>Instructions:</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                <li>Review each dialogue carefully</li>
                <li>Revise the pre-filled annotations as needed</li>
                <li>Mark the minimum context turn</li>
                <li>Save each annotation before moving to the next</li>
            </ul>
            <p><strong>Important:</strong> After completing all 10 dialogues, you will be automatically redirected back to Prolific.</p>
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
    
    // Hide error
    const errorDiv = document.getElementById('feedback-error');
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
}

function setupFeedbackListeners() {
    // Star rating
    const stars = document.querySelectorAll('#feedback-star-rating .star');
    stars.forEach(star => {
        star.addEventListener('click', function() {
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
        });
        
        // Hover effect
        star.addEventListener('mouseenter', function() {
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
    starContainer.addEventListener('mouseleave', function() {
        // Restore selected rating
        stars.forEach((s, idx) => {
            if (idx < feedbackRating) {
                s.textContent = '★';
            } else {
                s.textContent = '☆';
            }
        });
    });
    
    // Submit button
    const submitBtn = document.getElementById('feedback-submit');
    submitBtn.addEventListener('click', async function() {
        await handleFeedbackSubmit();
    });
    
    // Skip button
    const skipBtn = document.getElementById('feedback-skip');
    skipBtn.addEventListener('click', function() {
        hideFeedbackModal();
    });
}

async function handleFeedbackSubmit() {
    const comments = document.getElementById('feedback-comments').value.trim();
    const errorDiv = document.getElementById('feedback-error');
    
    // Validate - at least rating or comments required
    if (feedbackRating === 0 && !comments) {
        errorDiv.textContent = 'Please provide a rating or comments';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    try {
        // Save feedback to Firebase
        const success = await firebaseStorage.saveFeedback({
            rating: feedbackRating,
            comments: comments
        });
        
        if (success) {
            hideFeedbackModal();
            showStatus('Thank you for your feedback! 🙏', 'success', 4000);
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

