package com.finnova.bank.banking;
import java.time.Clock;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.auth.repository.CustomerRepository;
import com.finnova.bank.auth.repository.UserRepository;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.security.BankPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
@Service
public class BankingAccess {
    public record Scope(Long customerId, Role role) { }
    private final UserRepository users;
    private final CustomerRepository customers;
    private final Clock clock;
    public BankingAccess(UserRepository users, CustomerRepository customers, Clock clock) {
        this.users=users; this.customers=customers; this.clock=clock;
    }
    public Role actor(long userId) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof BankPrincipal principal) || principal.id()!=userId) {
            throw new ApiException(HttpStatus.UNAUTHORIZED,"Authentication is required.");
        }
        var state=users.readActorState(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED,"The session is no longer valid."));
        if (!state.getEnabled() || principal.sessionVersion()<0 || state.getTokenVersion()!=principal.sessionVersion()
                || state.getRole()!=principal.role() || (state.getLockedUntil()!=null && state.getLockedUntil().isAfter(clock.instant()))) {
            throw new ApiException(HttpStatus.UNAUTHORIZED,"The session is no longer valid.");
        }
        return state.getRole();
    }
    public long customer(long userId) {
        if (actor(userId)!=Role.CUSTOMER) throw new ApiException(HttpStatus.FORBIDDEN,"Only customers can perform this action.");
        return customers.findByUserId(userId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"Customer profile not found.")).getId();
    }
    public Scope readScope(long userId, Long requestedCustomer) {
        Role role=actor(userId);
        if (role==Role.ADMIN) return new Scope(requestedCustomer,role);
        if (role!=Role.CUSTOMER) throw new ApiException(HttpStatus.FORBIDDEN,"This role cannot view banking records.");
        if (requestedCustomer!=null) throw new ApiException(HttpStatus.FORBIDDEN,"Customer filters are restricted to administrators.");
        return new Scope(customer(userId),role);
    }
}
