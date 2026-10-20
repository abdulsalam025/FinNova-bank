package com.finnova.bank.auth.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.BankUser;
import com.finnova.bank.auth.repository.SettingRepository;
import com.finnova.bank.auth.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LoginAttemptService {
    public record Accepted(long userId, long tokenVersion) { }
    private final UserRepository users;
    private final SettingRepository settings;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final Clock clock;
    private final String dummyHash;
    public LoginAttemptService(UserRepository users, SettingRepository settings, PasswordEncoder encoder,
            AuditService audit, Clock clock) {
        this.users = users; this.settings = settings; this.encoder = encoder; this.audit = audit; this.clock = clock;
        dummyHash = encoder.encode("Synthetic_Dummy_Password9!");
    }
    // A rejected login RETURNS normally so counter/lockout/audit writes commit.
    // AuthService raises the generic 401 only AFTER this transaction returns.
    @Transactional
    public Accepted attempt(String email, String password) {
        BankUser user = users.lockByEmail(email).orElse(null);
        Instant now = clock.instant();
        boolean validLength = password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 72;
        boolean compared = encoder.matches(validLength ? password : "Synthetic_Dummy_Password9!",
                user == null || user.getPasswordHash() == null ? dummyHash : user.getPasswordHash());
        boolean matches = validLength && compared;
        boolean locked = user != null && user.getLockedUntil() != null && user.getLockedUntil().isAfter(now);
        if (user == null || !user.isEnabled() || locked || !matches) {
            if (user != null && user.isEnabled() && !locked) {
                int limit = integerSetting("security.max_failed_logins", 1, 20);
                int minutes = integerSetting("security.lockout_minutes", 1, 120);
                int attempts = (user.getLockedUntil() != null ? 0 : user.getFailedLoginAttempts()) + 1;
                Instant until = attempts >= limit ? now.plus(Duration.ofMinutes(minutes)) : null;
                user.failedLogin(attempts, until, now);
                if (until != null) audit.record(AuditActor.system(), "ACCOUNT_LOCKED", "SUCCESS", "USER",
                        user.getId().toString(), Map.of("durationMinutes", minutes));
            }
            // A failed login is anonymous even when the attempted identity exists.
            audit.record(AuditActor.anonymous(), "LOGIN_FAILURE", "FAILURE", "USER",
                    user == null ? null : user.getId().toString(), Map.of("reason", "INVALID_CREDENTIALS_OR_ACCOUNT_STATE"));
            return null;
        }
        user.loginSucceeded(now);
        audit.record(AuditActor.user(user.getId(), user.getRole()), "LOGIN_SUCCESS", "SUCCESS", "USER",
                user.getId().toString(), Map.of());
        return new Accepted(user.getId(), user.getTokenVersion());
    }
    private int integerSetting(String key, int min, int max) {
        String value = settings.findById(key).orElseThrow(() -> new IllegalStateException("Required security policy is missing")).getValue();
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < min || parsed > max) throw new NumberFormatException();
            return parsed;
        } catch (NumberFormatException ex) { throw new IllegalStateException("A security policy setting is invalid"); }
    }
}
