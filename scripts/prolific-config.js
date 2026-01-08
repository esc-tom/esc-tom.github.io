/**
 * Prolific Integration Configuration
 * 
 * Configure settings for Prolific participant integration
 */

const PROLIFIC_CONFIG = {
    // Enable/disable Prolific mode
    enabled: true,
    
    // Prolific completion code from your study
    completionCode: 'CRPEPNRU',
    
    // Prolific completion URL
    completionURL: 'https://app.prolific.com/submissions/complete',
    
    // Expected URL parameters from Prolific
    urlParams: {
        participantId: 'PROLIFIC_PID',
        studyId: 'STUDY_ID',
        sessionId: 'SESSION_ID'
    },
    
    // Auto-registration settings
    autoRegister: true,
    
    // Password for Prolific accounts (randomly generated per user)
    // This is not shown to users, only used internally
    generatePassword: true,
    
    // Redirect after completion
    redirectOnComplete: true,
    
    // Minimum time per dialogue (in seconds) to prevent rushing
    // Set to 0 to disable
    minTimePerDialogue: 0,
    
    // Show completion code on screen (in case redirect fails)
    showCompletionCode: true,
    
    // Prevent duplicate participation
    checkDuplicates: true,
    
    // Debug mode (shows Prolific info in console)
    debug: true
};

// Detect if current session is from Prolific
function isProlificSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const pid = urlParams.get(PROLIFIC_CONFIG.urlParams.participantId);
    return PROLIFIC_CONFIG.enabled && pid !== null && pid !== '';
}

// Get Prolific parameters from URL
function getProlificParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        participantId: urlParams.get(PROLIFIC_CONFIG.urlParams.participantId),
        studyId: urlParams.get(PROLIFIC_CONFIG.urlParams.studyId),
        sessionId: urlParams.get(PROLIFIC_CONFIG.urlParams.sessionId)
    };
}

// Generate a deterministic password for Prolific accounts
// This allows profile recovery if Firestore is deleted but Auth account exists
// Password is based on participantId + a secret salt for security
function generateProlificPassword(participantId = null) {
    // If participantId is provided, generate deterministic password
    // Otherwise, generate random (for backward compatibility)
    if (participantId) {
        // Use a deterministic approach: hash participantId with a salt
        // This allows recovery of the password if needed
        const salt = 'PROLIFIC_ANNOTATION_TOOL_2024'; // Secret salt
        const input = `${participantId}_${salt}`;
        
        // Simple hash function (for deterministic password)
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        // Generate password from hash
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        let password = '';
        let hashValue = Math.abs(hash);
        
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(hashValue % chars.length);
            hashValue = Math.floor(hashValue / chars.length) || (hashValue * 31); // Continue hashing
        }
        
        return password;
    } else {
        // Random password (for backward compatibility or when participantId not available)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        let password = '';
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }
}

// Get completion redirect URL
function getProlificCompletionURL() {
    return `${PROLIFIC_CONFIG.completionURL}?cc=${PROLIFIC_CONFIG.completionCode}`;
}

// Log Prolific info (debug mode)
function logProlificInfo(message, data = null) {
    if (PROLIFIC_CONFIG.debug) {
        console.log(`[PROLIFIC] ${message}`, data || '');
    }
}

// Make functions available globally
window.PROLIFIC_CONFIG = PROLIFIC_CONFIG;
window.isProlificSession = isProlificSession;
window.getProlificParams = getProlificParams;
window.generateProlificPassword = generateProlificPassword;
window.getProlificCompletionURL = getProlificCompletionURL;
window.logProlificInfo = logProlificInfo;

