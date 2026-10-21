package com.finnova.bank.banking;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finnova.bank.admin.AdminDtos.CreditAccount;
import com.finnova.bank.audit.AuditActor;
import com.finnova.bank.audit.AuditService;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.BankingDtos.IdempotentReply;
import com.finnova.bank.common.ApiError;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin-only cash top-up for the simulation. Mirrors transfer discipline:
 * one idempotency reservation, one locked account mutation, one immutable
 * CREDIT ledger leg, one audit event - all atomic.
 */
@Service
public class AdminFundingService {

    public record CreditView(String reference, long accountId, BigDecimal amount, BigDecimal newBalance, Instant creditedAt, boolean synthetic) { }

    private final AccountRepository accounts;
    private final LedgerRepository ledger;
    private final IdempotencyService idempotency;
    private final BankingAccess access;
    private final TransferPolicy policy;
    private final AuditService audit;
    private final ObjectMapper mapper;
    private final Clock clock;

    public AdminFundingService(AccountRepository accounts, LedgerRepository ledger, IdempotencyService idempotency,
            BankingAccess access, TransferPolicy policy, AuditService audit, ObjectMapper mapper, Clock clock) {
        this.accounts = accounts; this.ledger = ledger; this.idempotency = idempotency; this.access = access;
        this.policy = policy; this.audit = audit; this.mapper = mapper; this.clock = clock;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    @PreAuthorize("hasRole('ADMIN') and #adminId==authentication.principal.id()")
    public IdempotentReply credit(long adminId, long accountId, String key, CreditAccount request) {
        if (access.actor(adminId) != Role.ADMIN) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Administrator role required.");
        }
        String fingerprint = accountId + "|" + request.amount().stripTrailingZeros().toPlainString() + "|" + request.reason().trim();
        IdempotencyRecord reservation = idempotency.reserve(adminId, "ADMIN_CREDIT", policy.key(key), fingerprint);
        if (reservation.completed()) return idempotency.replay(reservation);

        BankAccount account;
        BigDecimal amount = request.amount();
        String reason = request.reason().trim();
        try {
            if (amount.scale() > 2 || amount.signum() <= 0 || amount.compareTo(TransferPolicy.MAX_MONEY) > 0)
                throw invalid("Amount must be a positive supported amount.");
            account = accounts.lockById(accountId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Account not found."));
            if (account.getStatus() != BankAccount.Status.ACTIVE)
                throw new ApiException(HttpStatus.CONFLICT, "Only active accounts can receive funds.");
            if (!"INR".equals(account.getCurrency()))
                throw new ApiException(HttpStatus.CONFLICT, "Only INR accounts can receive funds.");
            if (account.getBalance().add(amount).compareTo(TransferPolicy.MAX_MONEY) > 0)
                throw invalid("This credit would exceed the supported balance ceiling.");
        } catch (ApiException expected) {
            // Cache completed business rejections; no balance or ledger mutation happened.
            ApiError error = new ApiError(clock.instant(), expected.status().value(), expected.status().getReasonPhrase(),
                    expected.getMessage(), "/api/admin/accounts/" + accountId + "/credit", List.of());
            audit.record(AuditActor.user(adminId, Role.ADMIN), "ADMIN_CASH_CREDIT", "FAILURE", "ACCOUNT",
                    Long.toString(accountId), Map.of("reason", expected.getMessage()));
            return idempotency.complete(reservation, expected.status().value(), mapper.valueToTree(error));
        }

        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        String reference = UUID.randomUUID().toString();
        account.applyBalance(account.getBalance().add(amount), now);
        accounts.flush(); // execute the balance SQL now; a later failure rolls everything back together
        String description = ("SIMULATED admin credit: " + reason);
        if (description.length() > 255) description = description.substring(0, 255);
        ledger.save(new FinancialTransaction(accountId, null, reference, "CREDIT", "OPENING_CREDIT", amount,
                account.getBalance(), description, adminId, reservation.getId(), now));
        audit.record(AuditActor.user(adminId, Role.ADMIN), "ADMIN_CASH_CREDIT", "SUCCESS", "ACCOUNT",
                Long.toString(accountId), Map.of("amount", amount.toPlainString(), "reason", reason,
                        "reference", reference, "newBalance", account.getBalance().toPlainString(), "synthetic", true));
        CreditView body = new CreditView(reference, accountId, amount, account.getBalance(), now, true);
        // Unexpected persistence failures are NOT caught: balance, ledger row, reservation and audit roll back together.
        return idempotency.complete(reservation, HttpStatus.CREATED.value(), mapper.valueToTree(body));
    }

    private ApiException invalid(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, message);
    }
}