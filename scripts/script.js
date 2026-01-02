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
        console.log('✅ Firebase ready');
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
let readyToAnnotateTurn = null; // Tracks when user clicked "Ready to Annotate"
let minContextTurnIndex = null; // Tracks which turn provides minimum necessary context
let modifiedUtterances = {}; // Track modified utterances { turnIndex: newUtterance }
const MAX_APPRAISALS = 5;
const DIALOGUES_PER_USER = 10; // Number of dialogues to assign per user

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
    USERS: 'annotation_users',
    PASSWORDS: 'annotation_passwords',
    CURRENT_USER: 'annotation_username',
    ANNOTATIONS_PREFIX: 'annotation_data_'
};

// Password hashing utility using SHA-256
async function hashPassword(password, username) {
    // Use username as salt for simplicity
    const salt = username.toLowerCase();
    const textToHash = password + salt;
    
    // Convert string to Uint8Array
    const msgBuffer = new TextEncoder().encode(textToHash);
    
    // Hash the message
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    
    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

// Verify password
async function verifyPassword(username, password) {
    const passwordsJson = localStorage.getItem(STORAGE_KEYS.PASSWORDS);
    const passwords = passwordsJson ? JSON.parse(passwordsJson) : {};
    
    if (!passwords[username]) {
        return false;
    }
    
    const hashedInput = await hashPassword(password, username);
    return hashedInput === passwords[username];
}

// Store password hash
async function storePasswordHash(username, password) {
    const passwordsJson = localStorage.getItem(STORAGE_KEYS.PASSWORDS);
    const passwords = passwordsJson ? JSON.parse(passwordsJson) : {};
    
    const hashedPassword = await hashPassword(password, username);
    passwords[username] = hashedPassword;
    
    localStorage.setItem(STORAGE_KEYS.PASSWORDS, JSON.stringify(passwords));
}

// Initialize
async function init() {
    // Check if user is already logged in
    const savedUsername = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (savedUsername) {
        currentUsername = savedUsername;
        // Initialize Firebase to verify user session
        if (!firebaseReady) {
            await initFirebaseStorage();
        }
        // Load assigned dialogues will be called in initializeApp > loadDialogues
        hideLoginModal();
        await initializeApp();
    } else {
        // Show login modal and load users
        await loadUsers();
        setupLoginListeners();
    }
}

// Initialize the main app after login
async function initializeApp() {
    updateUserBadge();
    await loadDialogues();
    await loadCognitiveDimensions();
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

// Load existing users from Firebase
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

// Display user list
function displayUsers(users) {
    const userList = document.getElementById('user-list');
    
    if (users.length === 0) {
        userList.innerHTML = '<p class="no-users">No existing users. Register a new one!</p>';
        return;
    }
    
    userList.innerHTML = '';
    users.forEach(username => {
        const userBtn = document.createElement('button');
        userBtn.className = 'user-button';
        userBtn.textContent = username;
        userBtn.addEventListener('click', () => {
            document.getElementById('username-input').value = username;
        });
        userList.appendChild(userBtn);
    });
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
        
        console.log(`✅ Loaded ${allDialogues.length} dialogues with ground truth`);
        
        // Load assigned dialogues for current user if logged in
        if (currentUsername && firebaseReady) {
            await loadAssignedDialogues();
        }
        
        populateDialogueSelector();
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
        
        // Shuffle and take first n
        const shuffled = availableDialogues.sort(() => Math.random() - 0.5);
        const sampled = shuffled.slice(0, Math.min(n, shuffled.length));
        
        return sampled.map(d => d.entry_id);
    } catch (error) {
        console.error('Error sampling dialogues:', error);
        // Fallback: random sampling from all dialogues
        const shuffled = allDialogues.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, n).map(d => d.entry_id);
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
        const totalToAnnotate = assignedDialogues.length > 0 ? assignedDialogues.length : allDialogues.length;
        console.log(`📊 Progress: ${annotatedCount}/${totalToAnnotate} dialogues annotated`);
    } catch (error) {
        console.error('Error checking progress:', error);
    }
    
    updateProgressBar(annotatedCount, allDialogues.length);
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
    readyToAnnotateTurn = 0; // Set to 0 since we auto-show exploration turns
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
function displayContext() {
    const contextSection = document.getElementById('context-section');
    const situationEl = document.getElementById('context-situation');
    const thoughtEl = document.getElementById('context-thought');
    
    if (!currentDialogue || (!currentDialogue.situation && !currentDialogue.thought)) {
        contextSection.style.display = 'none';
        return;
    }
    
    // Display situation
    if (currentDialogue.situation) {
        situationEl.textContent = currentDialogue.situation;
    }
    
    // Display thought
    if (currentDialogue.thought) {
        thoughtEl.textContent = currentDialogue.thought;
    }
    
    contextSection.style.display = 'block';
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
    
    console.log('✅ Ground truth loaded and pre-populated successfully');
}

// Load existing annotation if available
async function loadExistingAnnotation() {
    try {
        const annotation = await getAnnotationFromStorage(currentDialogue.entry_id);
        
        if (annotation) {
            // Populate form fields (strip prefixes when loading)
            beliefInput.value = stripPrefix('belief', annotation.belief || '');
            desireInput.value = stripPrefix('desire', annotation.desire || '');
            intentionInput.value = stripPrefix('intention', annotation.intention || '');
            
            // Populate cognitive appraisals
            if (annotation.cognitive_appraisals) {
                selectedAppraisals = annotation.cognitive_appraisals;
                renderSelectedAppraisals();
            }
            
            // Load ready to annotate turn (set to 0 for exploration-only mode)
            if (annotation.ready_to_annotate_turn !== undefined && annotation.ready_to_annotate_turn !== null) {
                readyToAnnotateTurn = annotation.ready_to_annotate_turn;
            } else {
                readyToAnnotateTurn = 0;
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
                modifiedUtterances = annotation.modified_utterances;
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
    pairDiv.addEventListener('click', () => markMinContextTurn(startIndex, turnPairNumber, pairDiv));
    
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
    const displayText = modifiedUtterances[index] || turn.utterance;
    utterance.textContent = displayText;
    
    // Add modified indicator if utterance was changed
    if (modifiedUtterances[index]) {
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
        enterUtteranceEditMode(turnDiv, index, displayText);
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
    saveBtn.onclick = () => saveUtteranceEdit(turnDiv, turnIndex, textarea.value);
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'utterance-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => cancelUtteranceEdit(turnDiv, turnIndex);
    
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
    if (newText.trim() !== originalText.trim()) {
        modifiedUtterances[turnIndex] = newText.trim();
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
    
    const displayText = modifiedUtterances[index] || turn.utterance;
    utterance.textContent = displayText;
    
    // Add modified indicator if utterance was changed
    if (modifiedUtterances[index]) {
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
        enterUtteranceEditMode(turnDiv, index, displayText);
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
    
    // Show confirmation modal
    showConfirmModal();
}

// Show confirmation modal
function showConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    const dialogueId = document.getElementById('confirm-dialogue-id');
    const turns = document.getElementById('confirm-turns');
    const appraisals = document.getElementById('confirm-appraisals');
    const readyTurn = document.getElementById('confirm-ready-turn');
    
    // Populate modal with current annotation info
    dialogueId.textContent = currentDialogue.entry_id;
    const totalUtterances = currentDialogue.dialogue_history.length;
    const totalTurnPairs = Math.ceil(totalUtterances / 2);
    const currentPairs = Math.ceil(currentTurnIndex / 2);
    turns.textContent = `${currentPairs} of ${totalTurnPairs} turn pairs`;
    appraisals.textContent = `${selectedAppraisals.length} of 5`;
    
    // Show ready to annotate turn
    if (readyToAnnotateTurn !== null) {
        const readyPairs = Math.ceil(readyToAnnotateTurn / 2);
        readyTurn.textContent = `Turn pair ${readyPairs} (${readyToAnnotateTurn} utterances)`;
        readyTurn.style.color = 'var(--success-color)';
        readyTurn.style.fontWeight = '600';
    } else {
        readyTurn.textContent = 'Not marked';
        readyTurn.style.color = 'var(--text-secondary)';
        readyTurn.style.fontWeight = 'normal';
    }
    
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
    
    const annotation = {
        entry_id: currentDialogue.entry_id,
        username: currentUsername,
        turns_viewed: currentTurnIndex,
        total_turns: currentDialogue.dialogue_history.length,
        ready_to_annotate_turn: readyToAnnotateTurn,
        min_context_turn: minContextTurnIndex,
        belief: addPrefix('belief', beliefInput.value),
        desire: addPrefix('desire', desireInput.value),
        intention: addPrefix('intention', intentionInput.value),
        cognitive_appraisals: selectedAppraisals,
        modified_utterances: modifiedUtterances, // Save any edited utterances
        timestamp: new Date().toISOString()
    };
    
    try {
        // Save to Firebase
        await saveAnnotationToStorage(currentDialogue.entry_id, annotation);
        
        showStatus('✅ Annotation saved successfully!', 'success');
        
        // Update annotation status and progress bar
        annotationStatus[currentDialogue.entry_id] = true;
        const annotatedCount = Object.values(annotationStatus).filter(v => v).length;
        updateProgressBar(annotatedCount, allDialogues.length);
        
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
                showStatus(`✅ Loaded next dialogue: ${allDialogues[nextUnannotated].entry_id}`, 'success');
            }, 1500);
        } else {
            const completionMsg = assignedDialogues.length > 0 
                ? `🎉 All ${assignedDialogues.length} assigned dialogues completed!`
                : '🎉 All dialogues completed!';
            showStatus(completionMsg, 'success');
        }
    } catch (error) {
        console.error('Error saving annotation:', error);
        showStatus('❌ Error saving annotation', 'error');
    }
}

// Show notification pop-up
function showStatus(message, type = 'info', duration = 3000) {
    const popup = document.getElementById('notification-popup');
    const messageEl = document.getElementById('notification-message');
    const iconEl = document.getElementById('notification-icon');
    
    if (!popup || !messageEl || !iconEl) return;
    
    // Set message
    messageEl.textContent = message;
    
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
        
        const isTaken = await firebaseStorage.isUsernameTaken(username);
        
        if (isTaken) {
            statusIcon.className = 'username-status taken';
            statusIcon.textContent = '✗';
            availabilityText.className = 'username-availability taken';
            availabilityText.textContent = 'Username already taken';
        } else {
            statusIcon.className = 'username-status available';
            statusIcon.textContent = '✓';
            availabilityText.className = 'username-availability available';
            availabilityText.textContent = 'Username available';
        }
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
        
        currentUsername = username;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, username);
        
        // Load assigned dialogues for this user
        await loadAssignedDialogues();
        
        hideLoginModal();
        await initializeApp();
        showStatus(`Welcome back, ${username}! You have ${assignedDialogues.length} dialogues to annotate.`, 'success');
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

        // Pre-check if username is already taken
        const isTaken = await firebaseStorage.isUsernameTaken(username);
        if (isTaken) {
            showRegisterError('Username already taken. Please choose another one.');
            return;
        }

        // Sample dialogues for this user
        showRegisterError('Assigning dialogues...'); // Show progress
        const sampledDialogues = await sampleDialogues(DIALOGUES_PER_USER);
        
        if (sampledDialogues.length < DIALOGUES_PER_USER) {
            console.warn(`⚠️ Only ${sampledDialogues.length} dialogues available for assignment`);
        }
        
        console.log(`🎲 Sampled ${sampledDialogues.length} dialogues for ${username}:`, sampledDialogues);

        // Attempt registration with assigned dialogues
        const result = await firebaseStorage.registerUser(username, password, sampledDialogues);
        
        if (!result.success) {
            showRegisterError(result.message);
            return;
        }
        
        currentUsername = username;
        assignedDialogues = result.assignedDialogues || sampledDialogues;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, username);
        
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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App starting...');
    await initFirebaseStorage();
    init();
});

