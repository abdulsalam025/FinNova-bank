package com.finnova.bank.auth.domain;

import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "users")
public class BankUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 254) private String email;
    @Column(name = "full_name", nullable = false, length = 100) private String fullName;
    @Column(name = "password_hash", length = 100) private String passwordHash;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20) private Role role;
    @Column(nullable = false, columnDefinition = "tinyint(1)") private boolean enabled;
    @Column(name = "approval_limit", precision = 15, scale = 2) private BigDecimal approvalLimit;
    @Column(name = "token_version", nullable = false) private long tokenVersion;
    @Column(name = "failed_login_attempts", nullable = false) private int failedLoginAttempts;
    @Column(name = "locked_until") private Instant lockedUntil;
    @Column(name = "last_login_at") private Instant lastLoginAt;
    @Column(name = "password_changed_at") private Instant passwordChangedAt;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected BankUser() { }
    public static BankUser customer(String email, String name, String hash, Instant now) {
        BankUser user = new BankUser();
        user.email = email; user.fullName = name; user.passwordHash = hash; user.role = Role.CUSTOMER;
        user.enabled = true; user.passwordChangedAt = now; user.createdAt = now; user.updatedAt = now;
        return user;
    }
    public static BankUser officer(String email, String name, String hash, Instant now) {
        BankUser user = customer(email, name, hash, now);
        user.role = Role.LOAN_OFFICER;
        return user;
    }
    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public Instant getLastLoginAt() { return lastLoginAt; }
    public void setEnabledByAdmin(boolean value, Instant now) { enabled=value; revokeSessions(now); }
    public void assignRoleByAdmin(Role value, BigDecimal limit, Instant now) { role=value; approvalLimit=limit; revokeSessions(now); }
    public String getPasswordHash() { return passwordHash; }
    public Role getRole() { return role; }
    public BigDecimal getApprovalLimit() { return approvalLimit; }
    public boolean isEnabled() { return enabled; }
    public long getTokenVersion() { return tokenVersion; }
    public int getFailedLoginAttempts() { return failedLoginAttempts; }
    public Instant getLockedUntil() { return lockedUntil; }
    public Instant getCreatedAt() { return createdAt; }
    public void rename(String value, Instant now) { fullName = value; updatedAt = now; }
    public void failedLogin(int attempts, Instant until, Instant now) {
        failedLoginAttempts = attempts; lockedUntil = until; updatedAt = now;
        if (until != null) tokenVersion++;
    }
    public void loginSucceeded(Instant now) {
        failedLoginAttempts = 0; lockedUntil = null; lastLoginAt = now; updatedAt = now;
    }
    public void revokeSessions(Instant now) { tokenVersion++; updatedAt = now; }
    public void changePassword(String hash, Instant now) {
        passwordHash = hash; passwordChangedAt = now; failedLoginAttempts = 0; lockedUntil = null;
        revokeSessions(now);
    }
    public void activateSeed(String hash, Instant now) {
        if (enabled || passwordHash != null) throw new IllegalStateException("Seed is already provisioned; passwords were not reset.");
        changePassword(hash, now); enabled = true;
    }
}