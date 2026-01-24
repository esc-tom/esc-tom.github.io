/**
 * Sona Integration Configuration
 * 
 * Configure settings for Sona participant integration
 */

const SONA_CONFIG = {
    // Enable/disable Sona mode
    enabled: true,
    
    // Sona completion URL template
    // Use %SURVEY_CODE% placeholder which will be replaced with unique participant code
    completionURL: 'https://your-sona-system.com/credit?code=%SURVEY_CODE%',
    
    // Expected URL parameters from Sona
    urlParams: {
        participantId: 'participant_id',  // Common Sona parameter name
        surveyId: 'survey_id',           // Optional: survey identifier
        sessionId: 'session_id'           // Optional: session identifier
    },
    
    // Auto-registration settings
    autoRegister: true,
    
    // Password for Sona accounts (deterministic based on participantId)
    generatePassword: true,
    
    // Redirect after completion
    redirectOnComplete: true,
    
    // Minimum time per dialogue (in seconds) to prevent rushing
    // Set to 0 to disable
    minTimePerDialogue: 0,
    
    // Instruction reading quality checks
    instructionChecks: {
        // Enable automatic rejection for poor instruction reading
        enabled: true,
        
        // Minimum scroll percentage required (0-100)
        minScrollPercentage: 70,
        
        // Minimum reading time in seconds
        minReadingTimeSeconds: 45,
        
        // Require BOTH criteria to be met (if false, either one passing is sufficient)
        requireBoth: true,
        
        // Show warning message before rejection
        showWarning: true
    },
    
    // Show completion code on screen (in case redirect fails)
    showCompletionCode: true,
    
    // Prevent duplicate participation
    checkDuplicates: true,
    
    // Debug mode (shows Sona info in console)
    debug: true
};

// Generate unique survey code for participant
// This code will replace %SURVEY_CODE% in the completion URL
function generateSonaSurveyCode(participantId) {
    if (!participantId) {
        // Generate random code if no participant ID
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    // Generate deterministic code based on participant ID
    // This ensures the same participant always gets the same code
    const salt = 'SONA_ANNOTATION_TOOL_2024';
    const input = `${participantId}_${salt}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Generate code from hash (8 characters)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let hashValue = Math.abs(hash);
    
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(hashValue % chars.length);
        hashValue = Math.floor(hashValue / chars.length) || (hashValue * 31);
    }
    
    return code;
}

// Detect if current session is from Sona
function isSonaSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const pid = urlParams.get(SONA_CONFIG.urlParams.participantId);
    return SONA_CONFIG.enabled && pid !== null && pid !== '';
}

// Get Sona parameters from URL
function getSonaParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const participantId = urlParams.get(SONA_CONFIG.urlParams.participantId);
    
    // Generate survey code for this participant
    const surveyCode = generateSonaSurveyCode(participantId);
    
    return {
        participantId: participantId,
        surveyId: urlParams.get(SONA_CONFIG.urlParams.surveyId),
        sessionId: urlParams.get(SONA_CONFIG.urlParams.sessionId),
        surveyCode: surveyCode
    };
}

// Generate a deterministic password for Sona accounts
function generateSonaPassword(participantId = null) {
    if (participantId) {
        const salt = 'SONA_ANNOTATION_TOOL_2024';
        const input = `${participantId}_${salt}`;
        
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        let password = '';
        let hashValue = Math.abs(hash);
        
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(hashValue % chars.length);
            hashValue = Math.floor(hashValue / chars.length) || (hashValue * 31);
        }
        
        return password;
    } else {
        // Random password
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        let password = '';
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }
}

// Get completion redirect URL with survey code replaced
function getSonaCompletionURL(surveyCode) {
    if (!surveyCode) {
        surveyCode = 'COMPLETED'; // Fallback code
    }
    return SONA_CONFIG.completionURL.replace('%SURVEY_CODE%', surveyCode);
}

// Get rejection redirect URL (if needed)
function getSonaRejectionURL() {
    // For Sona, you might want to redirect to a rejection page or use a specific code
    // Adjust this based on your Sona system's requirements
    return SONA_CONFIG.completionURL.replace('%SURVEY_CODE%', 'REJECTED');
}

// Check if instruction reading meets quality criteria
function checkSonaInstructionQuality(instructionData) {
    if (!SONA_CONFIG.instructionChecks.enabled) {
        return { passed: true, reason: null };
    }
    
    if (!instructionData || !instructionData.first_instruction_read) {
        return { 
            passed: false, 
            reason: 'No instruction reading data found' 
        };
    }
    
    const { scrollPercentage, readingTimeSeconds } = instructionData.first_instruction_read;
    const { minScrollPercentage, minReadingTimeSeconds, requireBoth } = SONA_CONFIG.instructionChecks;
    
    const scrollPassed = scrollPercentage >= minScrollPercentage;
    const timePassed = readingTimeSeconds >= minReadingTimeSeconds;
    
    let passed;
    let reason = null;
    
    if (requireBoth) {
        passed = scrollPassed && timePassed;
        if (!passed) {
            const reasons = [];
            if (!scrollPassed) {
                reasons.push(`insufficient scroll (${scrollPercentage.toFixed(1)}% < ${minScrollPercentage}%)`);
            }
            if (!timePassed) {
                reasons.push(`insufficient reading time (${readingTimeSeconds}s < ${minReadingTimeSeconds}s)`);
            }
            reason = reasons.join(', ');
        }
    } else {
        passed = scrollPassed || timePassed;
        if (!passed) {
            reason = `both scroll (${scrollPercentage.toFixed(1)}% < ${minScrollPercentage}%) and reading time (${readingTimeSeconds}s < ${minReadingTimeSeconds}s) below thresholds`;
        }
    }
    
    return { passed, reason, scrollPercentage, readingTimeSeconds };
}

// Log Sona info (debug mode)
function logSonaInfo(message, data = null) {
    if (SONA_CONFIG.debug) {
        console.log(`[SONA] ${message}`, data || '');
    }
}

// Make functions available globally
window.SONA_CONFIG = SONA_CONFIG;
window.isSonaSession = isSonaSession;
window.getSonaParams = getSonaParams;
window.generateSonaPassword = generateSonaPassword;
window.generateSonaSurveyCode = generateSonaSurveyCode;
window.getSonaCompletionURL = getSonaCompletionURL;
window.getSonaRejectionURL = getSonaRejectionURL;
window.checkSonaInstructionQuality = checkSonaInstructionQuality;
window.logSonaInfo = logSonaInfo;
