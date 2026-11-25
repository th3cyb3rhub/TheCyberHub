/**
 * A client-side hint about a password, shown while it is typed. It never decides anything: the API
 * and the form's own rules (8 to 128 characters with an upper case letter, a lower case letter, a
 * number and a special character) are the only gate.
 */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordCheck {
    id: 'length' | 'upper' | 'lower' | 'number' | 'special';
    label: string;
    met: boolean;
}

export interface PasswordStrength {
    /** 0 for an empty field, then 1 (weak) to 4 (strong) */
    level: StrengthLevel;
    label: 'Enter a password' | 'Weak' | 'Fair' | 'Good' | 'Strong';
    checks: PasswordCheck[];
    /** What the password still lacks of the form's rules, in words */
    missing: string[];
}

const LABELS: PasswordStrength['label'][] = ['Enter a password', 'Weak', 'Fair', 'Good', 'Strong'];
const COMMON = /password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|abc123|123456|111111/i;

export function assessPassword(password: string): PasswordStrength {
    const checks: PasswordCheck[] = [
        { id: 'length', label: '8+ characters', met: password.length >= 8 },
        { id: 'upper', label: 'Uppercase letter', met: /[A-Z]/.test(password) },
        { id: 'lower', label: 'Lowercase letter', met: /[a-z]/.test(password) },
        { id: 'number', label: 'Number', met: /[0-9]/.test(password) },
        { id: 'special', label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
    ];
    const missing = checks.filter((c) => !c.met).map((c) => c.label.toLowerCase());
    if (!password) return { level: 0, label: LABELS[0], checks, missing };

    const classes = checks.slice(1).filter((c) => c.met).length;
    let points = classes;
    if (password.length >= 12) points += 1;
    if (password.length >= 16) points += 1;
    // Repeats and well-known words add length without adding strength
    if (/(.)\1{2,}/.test(password) || COMMON.test(password)) points -= 2;

    let level: StrengthLevel = points <= 2 ? 1 : points === 3 ? 2 : points === 4 ? 3 : 4;
    if (password.length < 8) level = 1;
    // A password that breaks one of the rules is never called better than fair
    if (missing.length > 0 && level > 2) level = 2;
    return { level, label: LABELS[level], checks, missing };
}
