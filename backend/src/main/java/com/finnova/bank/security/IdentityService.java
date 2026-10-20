package com.finnova.bank.security;

import java.time.Clock;
import com.finnova.bank.auth.domain.BankUser;
import com.finnova.bank.auth.repository.UserRepository;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService {
    private final UserRepository users;
    private final Clock clock;
    public IdentityService(UserRepository users, Clock clock) { this.users = users; this.clock = clock; }
    @Transactional(readOnly = true)
    public BankPrincipal resolve(long id, long tokenVersion) {
        BankUser user = users.findById(id).orElseThrow(() -> new BadCredentialsException("Invalid session"));
        if (!user.isEnabled() || user.getTokenVersion() != tokenVersion ||
                (user.getLockedUntil() != null && user.getLockedUntil().isAfter(clock.instant()))) {
            throw new BadCredentialsException("Invalid session");
        }
        // Roles and enabled state come from the DB on every request, never a stale JWT role claim.
        return new BankPrincipal(user.getId(), user.getRole(), user.getTokenVersion());
    }
}

