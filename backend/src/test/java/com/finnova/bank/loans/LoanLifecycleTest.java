package com.finnova.bank.loans;
import org.junit.jupiter.api.Test;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.common.ApiException;
import static org.junit.jupiter.api.Assertions.*;
class LoanLifecycleTest {
    @Test void allowsOnlyTheListedActorTransitions(){
        LoanLifecycle.require(ApplicationStatus.DRAFT,ApplicationStatus.SUBMITTED,Role.CUSTOMER);
        LoanLifecycle.require(ApplicationStatus.UNDER_REVIEW,ApplicationStatus.APPROVED,Role.LOAN_OFFICER);
        LoanLifecycle.require(ApplicationStatus.UNDER_REVIEW,ApplicationStatus.REJECTED,Role.ADMIN);
        LoanLifecycle.require(ApplicationStatus.DISBURSED,ApplicationStatus.REPAYMENT,null);
        LoanLifecycle.require(ApplicationStatus.REPAYMENT,ApplicationStatus.CLOSED,null);
    }
    @Test void rejectsSelfLoopsReopeningAndCustomerDecisionsWith409(){
        for(var status:ApplicationStatus.values())assertEquals(409,assertThrows(ApiException.class,()->LoanLifecycle.require(status,status,Role.ADMIN)).status().value());
        assertThrows(ApiException.class,()->LoanLifecycle.require(ApplicationStatus.REJECTED,ApplicationStatus.UNDER_REVIEW,Role.LOAN_OFFICER));
        assertThrows(ApiException.class,()->LoanLifecycle.require(ApplicationStatus.UNDER_REVIEW,ApplicationStatus.APPROVED,Role.CUSTOMER));
        assertThrows(ApiException.class,()->LoanLifecycle.require(ApplicationStatus.APPROVED,ApplicationStatus.REPAYMENT,Role.ADMIN));
    }
}
