# Password Security Documentation

## Overview

The annotation tool now includes password protection to secure each user's annotations. This document explains how the password system works, its security features, and important considerations.

## How It Works

### Registration
1. User enters a username and password
2. Password must be at least 6 characters
3. User confirms password by entering it twice
4. Password is hashed using SHA-256 with username as salt
5. Only the hash is stored in localStorage

### Login
1. User enters username and password
2. System retrieves stored password hash for that username
3. Entered password is hashed with same algorithm
4. Hashes are compared - access granted if they match

### Password Storage
- **Never stored in plain text**
- Hashed using SHA-256 (256-bit cryptographic hash)
- Username used as salt (prevents rainbow table attacks on common passwords)
- Stored in `localStorage` under key: `annotation_passwords`

## Security Features

### ✅ What's Protected

1. **Access Control**
   - Each user's annotations are protected by their password
   - Wrong password = no access to that user's data
   - Different users cannot access each other's annotations

2. **Password Hashing**
   - SHA-256 cryptographic hash function
   - Irreversible (cannot get password from hash)
   - Salted with username (prevents rainbow table attacks)

3. **Client-Side Security**
   - No passwords transmitted over network
   - All hashing happens in browser
   - No server logging or storage

### ⚠️ Security Limitations (Important!)

This is **client-side security** for a static website. While it provides good protection against casual access, it has limitations:

1. **localStorage Access**
   - Someone with physical access to the computer can access localStorage
   - Browser developer tools can view stored data
   - Not suitable for highly sensitive data requiring server-side security

2. **No Password Recovery**
   - Forgotten passwords cannot be recovered
   - No "reset password" functionality (no backend server)
   - Users must remember or securely store their passwords

3. **Browser-Based**
   - Security tied to browser profile
   - Clearing browser data clears passwords
   - No centralized authentication

4. **Client-Side Hashing**
   - Hash function code is visible in JavaScript
   - Technically, someone with dev tools access could bypass
   - Better than no protection, but not bank-level security

## Best Practices

### For Users

1. **Choose Strong Passwords**
   - At least 8-10 characters (minimum is 6)
   - Mix of letters, numbers, and symbols
   - Avoid common words or personal info

2. **Store Password Securely**
   - Use a password manager
   - Write it down in a secure location
   - Share with research coordinator if needed

3. **Remember: No Recovery**
   - If you forget your password, data may be inaccessible
   - Consider keeping a backup export

4. **Logout When Done**
   - Logout when using shared computers
   - Prevents others from accessing your session

### For Administrators

1. **Educate Users**
   - Explain password security and limitations
   - Stress importance of remembering passwords
   - Provide password storage recommendations

2. **Have Recovery Plan**
   - Keep list of usernames
   - Have process for data recovery if needed
   - Consider regular data exports

3. **Set Expectations**
   - Explain this is client-side security
   - Not suitable for highly sensitive data
   - Good for protecting against casual access

## Password Recovery Options

Since this is a static site with no backend, password recovery is not built-in. However, administrators have options:

### Option 1: Manual Password Reset

If a user forgets their password, an administrator can:

1. User provides their username
2. User exports current browser localStorage backup
3. Administrator creates new password hash
4. User imports localStorage with new hash
5. User can now login with new password

**Steps for admin:**
```javascript
// Generate new hash (run in browser console)
const username = 'forgotten_username';
const newPassword = 'new_temporary_password';

async function resetPassword() {
    const salt = username.toLowerCase();
    const textToHash = newPassword + salt;
    const msgBuffer = new TextEncoder().encode(textToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const passwords = JSON.parse(localStorage.getItem('annotation_passwords')) || {};
    passwords[username] = hashHex;
    localStorage.setItem('annotation_passwords', JSON.stringify(passwords));
    
    console.log('Password reset for:', username);
    console.log('New temporary password:', newPassword);
}

resetPassword();
```

### Option 2: Data Recovery

If password is forgotten but data must be recovered:

1. User opens browser developer tools (F12)
2. Navigate to Application → Local Storage
3. Find all keys starting with `annotation_data_{username}_`
4. Copy the JSON data
5. Send to administrator
6. User can re-register with new password
7. Administrator helps import old data

## Technical Details

### Hashing Algorithm

```javascript
async function hashPassword(password, username) {
    // Use username as salt
    const salt = username.toLowerCase();
    const textToHash = password + salt;
    
    // Convert to bytes
    const msgBuffer = new TextEncoder().encode(textToHash);
    
    // SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}
```

### Storage Format

```json
{
  "annotation_passwords": {
    "username1": "a1b2c3d4e5f6...64-char-hex-hash",
    "username2": "f6e5d4c3b2a1...64-char-hex-hash"
  }
}
```

### Verification Process

```javascript
async function verifyPassword(username, password) {
    const passwords = JSON.parse(localStorage.getItem('annotation_passwords')) || {};
    
    if (!passwords[username]) {
        return false;
    }
    
    const hashedInput = await hashPassword(password, username);
    return hashedInput === passwords[username];
}
```

## Comparison: Security Levels

| Feature | No Password | Client-Side Hash | Server-Side Auth |
|---------|-------------|------------------|------------------|
| Casual protection | ❌ | ✅ | ✅ |
| Physical access protection | ❌ | ⚠️ | ✅ |
| Network transmission | N/A | ✅ (client-side) | ✅ (encrypted) |
| Password recovery | N/A | ❌ | ✅ |
| Account lockout | N/A | ❌ | ✅ |
| Multi-device sync | N/A | ❌ | ✅ |
| Suitable for sensitive data | ❌ | ⚠️ | ✅ |
| Setup complexity | Easy | Easy | Complex |
| Cost | Free | Free | Server costs |

**Legend:**
- ✅ = Fully supported
- ⚠️ = Partial support/limitations
- ❌ = Not supported

## Recommendations by Use Case

### ✅ Good For:
- Research studies with non-sensitive dialogue data
- Protecting against casual browser access
- Multi-user shared computer scenarios
- Quick deployment without backend infrastructure
- Budget-constrained projects

### ⚠️ Use With Caution:
- Moderately sensitive research data (add additional safeguards)
- Studies requiring strict data protection
- Long-term data storage (ensure regular exports)

### ❌ Not Recommended For:
- Highly sensitive medical/personal data
- Compliance-required security (HIPAA, GDPR strict requirements)
- Financial data
- Scenarios requiring password recovery
- Studies requiring audit trails

## Frequently Asked Questions

### Q: Is my password visible in the code?
**A:** No. Your password is hashed immediately upon entry. Only the hash is stored. However, the hashing code itself is visible in the JavaScript.

### Q: Can someone recover my password from the hash?
**A:** Extremely difficult. SHA-256 is a one-way function. However, weak passwords might be vulnerable to brute force.

### Q: What happens if I forget my password?
**A:** Your data may become inaccessible. Contact your research coordinator for recovery options. Prevention: use a password manager!

### Q: Can the administrator see my password?
**A:** No. Administrators can see the hash, but cannot reverse it to get your password.

### Q: Is this secure enough for my study?
**A:** Depends on your data sensitivity and requirements. Good for casual protection; consult with your IRB/ethics board for sensitive data.

### Q: Can I change my password?
**A:** Not through the UI currently. Contact administrator for manual password reset.

### Q: What if someone accesses my browser?
**A:** If logged in, they can access your data. Always logout on shared computers.

## Compliance Considerations

### IRB/Ethics Review
- Disclose that this is client-side security
- Explain data storage in browser localStorage
- Note lack of password recovery mechanism
- Discuss appropriateness for your data type

### Data Protection Regulations
- **GDPR**: May be acceptable for pseudonymized research data
- **HIPAA**: Likely insufficient for PHI without additional safeguards
- **Local regulations**: Check your jurisdiction's requirements

### Recommendations:
1. Consult with your institution's data protection officer
2. Consider data sensitivity level
3. Document security measures in ethics application
4. Inform participants about data storage

## Future Enhancements

Potential security improvements for future versions:

1. **Stronger Hashing**
   - Use bcrypt or Argon2 (requires additional libraries)
   - Increase computational cost for brute force resistance

2. **Password Requirements**
   - Enforce complexity rules
   - Check against common password lists
   - Minimum length increase

3. **Session Management**
   - Auto-logout after inactivity
   - Session expiration tokens
   - Re-authentication for sensitive actions

4. **Account Lockout**
   - Temporary lockout after failed attempts
   - Prevents brute force attacks

5. **Two-Factor Authentication**
   - Would require backend server
   - Significantly increases security

6. **Audit Logging**
   - Log login attempts
   - Track annotation modifications
   - Requires backend implementation

## Conclusion

The password protection system provides a reasonable level of security for a client-side static website. It's suitable for protecting research annotations against casual access, but users and administrators should be aware of its limitations.

**Key Takeaway**: This security is better than no password protection, but not equivalent to server-side authentication. Use appropriately based on your data sensitivity and regulatory requirements.

## Support

For questions about password security:
- Review this document
- Check with your research coordinator
- Consult your institution's IT security team
- Contact the tool maintainer for technical details

---

**Last Updated**: December 17, 2025

