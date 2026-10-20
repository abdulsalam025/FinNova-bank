package com.finnova.bank.auth.service;

import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Map;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.auth.dto.AuthDtos.*;
import com.finnova.bank.auth.repository.*;
import com.finnova.bank.auth.validation.StrongPasswordValidator;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.security.JwtTokenService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserRepository users;
    private final CustomerRepository customers;
    private final KycRepository kyc;
    private final PasswordEncoder encoder;
    private final LoginAttemptService attempts;
    private final JwtTokenService tokens;
    private final AuditService audit;
    private final Clock clock;
    public AuthService(UserRepository users, CustomerRepository customers, KycRepository kyc,
            PasswordEncoder encoder, LoginAttemptService attempts, JwtTokenService tokens, AuditService audit, Clock clock) {
        this.users = users; this.customers = customers; this.kyc = kyc; this.encoder = encoder;
        this.attempts = attempts; this.tokens = tokens; this.audit = audit; this.clock = clock;
    }
    @Transactional
    public ProfileResponse register(RegisterRequest request) {
        String email = normalizedEmail(request.email());
        if (users.existsByEmail(email)) throw new ApiException(HttpStatus.CONFLICT, "That email is already registered.");
        requireStrongPassword(request.password());
        LocalDate today = LocalDate.now(clock.withZone(ZoneId.of("Asia/Kolkata")));
        int age = Period.between(request.dateOfBirth(), today).getYears();
        if (age < 18 || age > 100) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Registration requires an age from 18 to 100 years.");
        Instant now = clock.instant();
        BankUser user = users.saveAndFlush(BankUser.customer(email, request.fullName().trim(), encoder.encode(request.password()), now));
        CustomerProfile customer = customers.saveAndFlush(new CustomerProfile(user.getId(), request.dateOfBirth(),
                request.declaredMonthlyIncome().setScale(2, RoundingMode.HALF_UP), now));
        kyc.save(new KycRecord(customer.getId(), now));
        audit.record(AuditActor.user(user.getId(), user.getRole()), "REGISTRATION", "SUCCESS", "USER", user.getId().toString(), Map.of("synthetic", true));
        // No account balance or role is accepted from the client; no auto-login.
        return response(user, customer);
    }
    public LoginResult login(LoginRequest request) {
        LoginAttemptService.Accepted accepted = attempts.attempt(normalizedEmail(request.email()), request.password());
        if (accepted == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password, or account temporarily unavailable.");
        // Separate read after the login-attempt transaction has committed.
        return new LoginResult(tokens.issue(accepted.userId(), accepted.tokenVersion()), readProfile(accepted.userId()));
    }
    @Transactional(readOnly = true)
    @PreAuthorize("isAuthenticated() and #userId == authentication.principal.id()")
    public ProfileResponse profile(long userId) { return readProfile(userId); }

    @Transactional
    @PreAuthorize("isAuthenticated() and #userId == authentication.principal.id()")
    public ProfileResponse updateProfile(long userId, UpdateProfileRequest request) {
        BankUser user = locked(userId);
        user.rename(request.fullName().trim(), clock.instant());
        audit.record(AuditActor.user(userId, user.getRole()), "PROFILE_CHANGED", "SUCCESS", "USER", Long.toString(userId), Map.of("field", "fullName"));
        return readProfile(userId);
    }
    @Transactional
    @PreAuthorize("isAuthenticated() and #userId == authentication.principal.id()")
    public void changePassword(long userId, ChangePasswordRequest request) {
        BankUser user = locked(userId);
        if (request.currentPassword().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72 ||
                !encoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "The current password is incorrect.");
        }
        requireStrongPassword(request.newPassword());
        if (encoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Choose a different new password.");
        }
        user.changePassword(encoder.encode(request.newPassword()), clock.instant());
        audit.record(AuditActor.user(userId, user.getRole()), "PASSWORD_CHANGED", "SUCCESS", "USER", Long.toString(userId), Map.of("allSessionsRevoked", true));
    }
    @Transactional
    @PreAuthorize("isAuthenticated() and #userId == authentication.principal.id()")
    public void logout(long userId) {
        BankUser user = locked(userId);
        user.revokeSessions(clock.instant());
        audit.record(AuditActor.user(userId, user.getRole()), "LOGOUT", "SUCCESS", "USER", Long.toString(userId), Map.of("allSessionsRevoked", true));
    }
    private BankUser locked(long id) {
        return users.lockById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
    }
    private ProfileResponse readProfile(long id) {
        BankUser user = users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
        return response(user, customers.findByUserId(id).orElse(null));
    }
    private ProfileResponse response(BankUser user, CustomerProfile customer) {
        CustomerView details = customer == null ? null : new CustomerView(customer.getId(), customer.getDateOfBirth(), customer.getDeclaredMonthlyIncome());
        return new ProfileResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole().name(), user.isEnabled(), user.getCreatedAt(), details);
    }
    private String normalizedEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    private void requireStrongPassword(String value) {
        if (!StrongPasswordValidator.accepts(value)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Password does not meet the documented policy.");
    }
}
