package com.finnova.bank.auth;
import com.finnova.bank.auth.validation.StrongPasswordValidator;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class PasswordPolicyTest {
    @Test void acceptsMixedSyntheticPassword() { assertTrue(StrongPasswordValidator.accepts("Synthetic_Safe9!Password")); }
    @Test void rejectsNullShortAndWhitespace() {
        assertFalse(StrongPasswordValidator.accepts(null));
        assertFalse(StrongPasswordValidator.accepts("Short9!"));
        assertFalse(StrongPasswordValidator.accepts("Synthetic Safe9!Password"));
    }
    @Test void requiresAllCharacterClasses() {
        for (String value : new String[]{"lowercase_only9!", "UPPERCASE_ONLY9!", "NoDigits_Password!", "NoSymbolsPassword9"})
            assertFalse(StrongPasswordValidator.accepts(value));
    }
    @Test void honorsTheBcryptUtf8ByteLimitRatherThanOnlyCharacterCount() {
        assertTrue(StrongPasswordValidator.accepts("Aa9!" + "x".repeat(68)));
        assertFalse(StrongPasswordValidator.accepts("Aa9!" + "x".repeat(69)));
        assertFalse(StrongPasswordValidator.accepts("Aa9!" + "\u20ac".repeat(23)));
    }
}
