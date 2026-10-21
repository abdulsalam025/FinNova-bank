package com.finnova.bank.admin;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.finnova.bank.admin.AdminDtos.CreateOfficer;
import com.finnova.bank.audit.AuditService;
import com.finnova.bank.auth.domain.BankUser;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.auth.repository.CustomerRepository;
import com.finnova.bank.auth.repository.SettingRepository;
import com.finnova.bank.auth.repository.UserRepository;
import com.finnova.bank.banking.BankingAccess;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.LoanPolicy;

@ExtendWith(MockitoExtension.class)
class UserAdminServiceCreateOfficerTest {

    @Mock UserRepository users;
    @Mock CustomerRepository customers;
    @Mock SettingRepository settings;
    @Mock BankingAccess access;
    @Mock AuditService audit;
    @Mock LoanPolicy notes;
    @Mock PasswordEncoder encoder;

    private final Clock clock = Clock.fixed(Instant.parse("2026-10-20T00:00:00Z"), ZoneOffset.UTC);
    private UserAdminService service;

    @BeforeEach
    void setUp() {
        service = new UserAdminService(users, customers, settings, access, audit, clock, notes, encoder);
    }

    private static CreateOfficer request(String email) {
        return new CreateOfficer(email, "Officer Rao", "Strong#Pass1", new BigDecimal("250000.00"));
    }

    @Test
    void createOfficerSavesEnabledLoanOfficerWithHashedPasswordLimitAndAudit() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);
        when(encoder.encode("Strong#Pass1")).thenReturn("ENCODED_HASH");
        when(users.save(any(BankUser.class))).thenAnswer(invocation -> {
            BankUser entity = invocation.getArgument(0);
            ReflectionTestUtils.setField(entity, "id", 99L);
            return entity;
        });

        var view = service.createOfficer(7L, request("  New.Officer@FinNova.IO "));

        ArgumentCaptor<BankUser> saved = ArgumentCaptor.forClass(BankUser.class);
        verify(users).save(saved.capture());
        BankUser entity = saved.getValue();
        assertThat(entity.getRole()).isEqualTo(Role.LOAN_OFFICER);
        assertThat(entity.isEnabled()).isTrue();
        assertThat(entity.getPasswordHash()).isEqualTo("ENCODED_HASH");
        assertThat(entity.getEmail()).isEqualTo("new.officer@finnova.io");
        assertThat(entity.getApprovalLimit()).isEqualByComparingTo("250000.00");
        verify(audit).record(any(), eq("USER_CREATED"), eq("SUCCESS"), eq("USER"), eq("99"), anyMap());
        assertThat(view.role()).isEqualTo("LOAN_OFFICER");
        assertThat(view.enabled()).isTrue();
    }

    @Test
    void createOfficerRejectsDuplicateEmailWithConflict() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);
        when(encoder.encode(any())).thenReturn("ENCODED_HASH");
        doThrow(new DataIntegrityViolationException("Duplicate entry")).when(users).flush();

        assertThatThrownBy(() -> service.createOfficer(7L, request("taken@finnova.io")))
            .isInstanceOf(ApiException.class)
            .hasMessage("An account with this email already exists.");
        verifyNoInteractions(audit);
    }

    @Test
    void createOfficerRejectsZeroLimitWith422() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);

        assertThatThrownBy(() -> service.createOfficer(7L, new CreateOfficer("x@finnova.io", "Officer Rao", "Strong#Pass1", BigDecimal.ZERO)))
            .isInstanceOf(ApiException.class)
            .hasMessage("Officer approval limit must be a positive supported amount.");
        verifyNoInteractions(encoder, audit);
    }

    @Test
    void createOfficerRequiresAdminActor() {
        when(access.actor(7L)).thenReturn(Role.CUSTOMER);

        assertThatThrownBy(() -> service.createOfficer(7L, request("x@finnova.io")))
            .isInstanceOf(ApiException.class);
        verifyNoInteractions(encoder, users, audit);
    }
}