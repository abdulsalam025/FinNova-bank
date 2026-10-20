package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.util.UUID;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.loans.LoanDtos.RepayRequest;
import com.finnova.testsupport.LoanFixtures;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE)@ActiveProfiles("dbtest")@Import(LoanFixtures.class)
class RepaymentRollbackTest {
    @Autowired LoanFixtures.Factory fixtures;@Autowired RepaymentService service;@Autowired JdbcTemplate jdbc;@MockitoSpyBean PaymentRepository payments;
    LoanFixtures.Fixture fixture;
    @AfterEach void retire(){reset(payments);fixtures.retire(fixture);}
    @Test void paymentInsertFailureRollsBackAllServicingMoneyAndAllowsSameKeyRetry(){
        fixture=fixtures.create();long installment=jdbc.queryForObject("SELECT id FROM installments WHERE loan_id=? AND installment_number=1",Long.class,fixture.loan());String key=UUID.randomUUID().toString();
        BigDecimal before=jdbc.queryForObject("SELECT balance FROM accounts WHERE id=?",BigDecimal.class,fixture.borrower().source());
        doThrow(new DataIntegrityViolationException("Injected synthetic payment failure")).when(payments).save(any(LoanPayment.class));assertThrows(DataIntegrityViolationException.class,()->pay(key,installment));
        assertEquals(before,jdbc.queryForObject("SELECT balance FROM accounts WHERE id=?",BigDecimal.class,fixture.borrower().source()));
        assertEquals(new BigDecimal("10000.00"),jdbc.queryForObject("SELECT outstanding_principal FROM loans WHERE id=?",BigDecimal.class,fixture.loan()));
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM installments WHERE id=?",String.class,installment));
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM idempotency_keys WHERE user_id=? AND operation='REPAYMENT'",Long.class,fixture.borrower().user()));
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM transactions WHERE loan_application_id=? AND transaction_type='LOAN_REPAYMENT'",Long.class,fixture.application()));
        reset(payments);assertEquals(201,pay(key,installment).status());
    }
    private com.finnova.bank.banking.BankingDtos.IdempotentReply pay(String key,long installment){return LoanFixtures.as(fixture.borrower().user(),Role.CUSTOMER,()->service.repay(fixture.borrower().user(),fixture.loan(),installment,key,new RepayRequest(fixture.borrower().source())));}
}
