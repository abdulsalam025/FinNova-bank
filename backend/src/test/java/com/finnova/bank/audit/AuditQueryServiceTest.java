package com.finnova.bank.audit;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.BankingAccess;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuditQueryServiceTest {

    private AuditRepository records;
    private BankingAccess access;
    private AuditQueryService service;

    @BeforeEach
    void setUp() {
        records = mock(AuditRepository.class);
        access = mock(BankingAccess.class);
        service = new AuditQueryService(records, access,
                Clock.fixed(Instant.parse("2026-10-20T00:00:00Z"), ZoneOffset.UTC));
        PageImpl<AuditRecord> empty = new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
        doReturn(empty).when(records).findAll(
                org.mockito.ArgumentMatchers.<Specification<AuditRecord>>any(),
                org.mockito.ArgumentMatchers.any(Pageable.class));
    }

    @Test
    void adminWithoutActorFilterQueriesAllRecordedActions() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);
        PageView<AuditQueryService.View> view =
                service.search(7L, null, null, null, null, null, null, 0, 20);
        assertNotNull(view);
        assertEquals(0, view.totalElements());
        verify(records).findAll(org.mockito.ArgumentMatchers.<Specification<AuditRecord>>any(),
                org.mockito.ArgumentMatchers.any(Pageable.class));
    }

    @Test
    void adminWithActorFilterAppliesScopedSearch() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);
        assertDoesNotThrow(() -> service.search(7L, 42L, "LOAN_SUBMITTED", "SUCCESS", "kyc",
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 20), 0, 20));
    }

    @Test
    void officerDefaultsToOwnActionsAndMayFilterSelf() {
        when(access.actor(9L)).thenReturn(Role.LOAN_OFFICER);
        assertDoesNotThrow(() -> service.search(9L, null, null, null, null, null, null, 0, 20));
        assertDoesNotThrow(() -> service.search(9L, 9L, null, null, null, null, null, 0, 20));
    }

    @Test
    void officerFilteringAnotherActorIsForbidden() {
        when(access.actor(9L)).thenReturn(Role.LOAN_OFFICER);
        assertThrows(ApiException.class,
                () -> service.search(9L, 10L, null, null, null, null, null, 0, 20));
    }

    @Test
    void rejectsInvalidEventAndOutcomeFilters() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);
        assertThrows(ApiException.class,
                () -> service.search(7L, null, "drop table", null, null, null, null, 0, 20));
        assertThrows(ApiException.class,
                () -> service.search(7L, null, null, "MAYBE", null, null, null, 0, 20));
    }

    @Test
    void rejectsInvalidPagination() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);
        assertThrows(ApiException.class,
                () -> service.search(7L, null, null, null, null, null, null, -1, 20));
        assertThrows(ApiException.class,
                () -> service.search(7L, null, null, null, null, null, null, 0, 101));
    }

    @Test
    void rejectsOverlongDateRange() {
        when(access.actor(7L)).thenReturn(Role.ADMIN);
        assertThrows(ApiException.class,
                () -> service.search(7L, null, null, null, null,
                        LocalDate.of(2024, 1, 1), LocalDate.of(2025, 2, 1), 0, 20));
    }
}