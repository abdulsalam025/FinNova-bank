package com.finnova.bank.security;
import java.security.Principal;
import com.finnova.bank.auth.domain.Role;
public record BankPrincipal(long id, Role role, long sessionVersion) implements Principal {
    // Compatibility for the existing profile-ownership unit check only. Financial
    // services require a real nonnegative session version and reject this sentinel.
    public BankPrincipal(long id, Role role) { this(id, role, -1); }
    @Override public String getName() { return Long.toString(id); }
}
