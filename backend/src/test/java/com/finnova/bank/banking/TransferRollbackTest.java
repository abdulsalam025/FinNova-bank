package com.finnova.bank.banking;
import java.math.BigDecimal;
import java.util.UUID;
import com.finnova.bank.banking.BankingDtos.TransferRequest;
import com.finnova.testsupport.BankingFixtures;
import com.finnova.testsupport.BankingFixtures.Fixture;
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
import static org.mockito.ArgumentMatchers.argThat;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE) @ActiveProfiles("dbtest") @Import(BankingFixtures.class)
class TransferRollbackTest {
    @Autowired TransferService transfers;@Autowired BankingFixtures.Factory fixtures;@Autowired JdbcTemplate jdbc;
    @MockitoSpyBean LedgerRepository ledger;
    Fixture fixture;
    @AfterEach void retire(){reset(ledger);fixtures.retire(fixture);}
    @Test void creditWriteFailureRollsBackDebitBothBalancesReservationAndAuditAndAllowsSafeRetry(){
        fixture=fixtures.create("1000.00","0.00");String key="rollback-"+UUID.randomUUID();
        var request=new TransferRequest(fixture.source(),fixture.target(),new BigDecimal("50.00"),"Fault-injection test");
        doThrow(new DataIntegrityViolationException("Injected synthetic credit failure"))
                .when(ledger).save(argThat(entry->entry!=null && "TRANSFER_CREDIT".equals(entry.getTransactionType())));
        assertThrows(DataIntegrityViolationException.class,()->BankingFixtures.as(fixture,()->transfers.transfer(fixture.user(),key,request)));
        assertMoney("1000.00",fixture.source());assertMoney("0.00",fixture.target());
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM transactions WHERE account_id IN (?,?) AND transaction_type LIKE 'TRANSFER_%'",Long.class,fixture.source(),fixture.target()));
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM idempotency_keys WHERE user_id=?",Long.class,fixture.user()));
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE actor_user_id=? AND event_type='TRANSFER'",Long.class,fixture.user()));
        reset(ledger);
        var retried=BankingFixtures.as(fixture,()->transfers.transfer(fixture.user(),key,request));
        assertEquals(201,retried.status());assertMoney("950.00",fixture.source());assertMoney("50.00",fixture.target());
    }
    private void assertMoney(String expected,long id){assertEquals(0,new BigDecimal(expected).compareTo(jdbc.queryForObject("SELECT balance FROM accounts WHERE id=?",BigDecimal.class,id)));}
}
