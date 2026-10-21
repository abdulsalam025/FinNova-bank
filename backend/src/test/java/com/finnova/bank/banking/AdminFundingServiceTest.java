package com.finnova.bank.banking;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.finnova.bank.admin.AdminDtos.CreditAccount;
import com.finnova.bank.audit.AuditService;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.common.ApiException;

@ExtendWith(MockitoExtension.class)
class AdminFundingServiceTest {

    @Mock AccountRepository accounts;
    @Mock LedgerRepository ledger;
    @Mock IdempotencyService idempotency;
    @Mock BankingAccess access;
    @Mock TransferPolicy policy;
    @Mock AuditService audit;
    @Mock IdempotencyRecord reservation;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-20T10:00:00Z"), ZoneOffset.UTC);
    private AdminFundingService service;

    private static BankAccount activeAccount(long id, String balance) {
        BankAccount account = new BankAccount(11L, "Main", BankAccount.Type.SAVINGS, Instant.parse("2026-10-01T00:00:00Z"));
        account.applyBalance(new BigDecimal(balance), Instant.parse("2026-10-01T00:00:00Z"));
        ReflectionTestUtils.setField(account, "id", id);
        return account;
    }

    @BeforeEach
    void setUp() {
        service = new AdminFundingService(accounts, ledger, idempotency, access, policy, audit, mapper, clock);
    }

    private void expectFreshReservation() {
        when(policy.key(null)).thenReturn("KEY-1");
        when(idempotency.reserve(eq(5L), eq("ADMIN_CREDIT"), eq("KEY-1"), anyString())).thenReturn(reservation);
        when(reservation.completed()).thenReturn(false);
        when(idempotency.complete(eq(reservation), anyInt(), any())).thenAnswer(invocation ->
            new BankingDtos.IdempotentReply(invocation.getArgument(1), ((JsonNode) invocation.getArgument(2)).deepCopy(), false));
    }

    @Test
    void creditsActiveAccountOnceWritesLedgerAndAudit() {
        when(access.actor(5L)).thenReturn(Role.ADMIN);
        expectFreshReservation();
        BankAccount account = activeAccount(9L, "100.00");
        when(accounts.lockById(9L)).thenReturn(Optional.of(account));

        var reply = service.credit(5L, 9L, null, new CreditAccount(new BigDecimal("2500.50"), "seed demo money"));

        assertThat(reply.status()).isEqualTo(201);
        assertThat(account.getBalance()).isEqualByComparingTo("2600.50");
        verify(accounts).flush();
        ArgumentCaptor<FinancialTransaction> saved = ArgumentCaptor.forClass(FinancialTransaction.class);
        verify(ledger).save(saved.capture());
        FinancialTransaction row = saved.getValue();
        assertThat(row.getDirection()).isEqualTo("CREDIT");
        assertThat(row.getTransactionType()).isEqualTo("OPENING_CREDIT");
        assertThat(row.getAmount()).isEqualByComparingTo("2500.50");
        assertThat(row.getBalanceAfter()).isEqualByComparingTo("2600.50");
        assertThat(row.getCounterpartyAccountId()).isNull();
        assertThat(row.getDescription()).contains("admin credit");
        verify(audit).record(any(), eq("ADMIN_CASH_CREDIT"), eq("SUCCESS"), eq("ACCOUNT"), eq("9"), anyMap());
        verify(idempotency).complete(eq(reservation), eq(201), any());
    }

    @Test
    void frozenAccountIsRejectedCachedAndNoLedgerWrite() {
        when(access.actor(5L)).thenReturn(Role.ADMIN);
        expectFreshReservation();
        BankAccount account = activeAccount(9L, "100.00");
        account.close(Instant.parse("2026-10-02T00:00:00Z"));
        when(accounts.lockById(9L)).thenReturn(Optional.of(account));

        var reply = service.credit(5L, 9L, null, new CreditAccount(new BigDecimal("10.00"), "try"));

        assertThat(reply.status()).isEqualTo(409);
        verifyNoInteractions(ledger);
        verify(idempotency).complete(eq(reservation), eq(409), any());
        verify(audit).record(any(), eq("ADMIN_CASH_CREDIT"), eq("FAILURE"), eq("ACCOUNT"), eq("9"), anyMap());
    }

    @Test
    void amountOverCeilingIsRejected() {
        when(access.actor(5L)).thenReturn(Role.ADMIN);
        expectFreshReservation();

        var reply = service.credit(5L, 9L, null, new CreditAccount(new BigDecimal("99999999999999.99"), "too much"));

        assertThat(reply.status()).isEqualTo(422);
        verifyNoInteractions(accounts, ledger);
    }

    @Test
    void completedReservationReplaysWithoutTouchingMoney() {
        when(access.actor(5L)).thenReturn(Role.ADMIN);
        when(policy.key(null)).thenReturn("KEY-1");
        when(idempotency.reserve(eq(5L), eq("ADMIN_CREDIT"), eq("KEY-1"), anyString())).thenReturn(reservation);
        when(reservation.completed()).thenReturn(true);
        when(idempotency.replay(reservation)).thenReturn(new BankingDtos.IdempotentReply(201, mapper.createObjectNode(), true));

        var reply = service.credit(5L, 9L, null, new CreditAccount(new BigDecimal("10.00"), "again"));

        assertThat(reply.replayed()).isTrue();
        verifyNoInteractions(accounts, ledger, audit);
    }

    @Test
    void requiresAdminActor() {
        when(access.actor(5L)).thenReturn(Role.LOAN_OFFICER);

        assertThatThrownBy(() -> service.credit(5L, 9L, null, new CreditAccount(new BigDecimal("10.00"), "nope")))
            .isInstanceOf(ApiException.class);
        verifyNoInteractions(idempotency, accounts, ledger, audit);
    }
}