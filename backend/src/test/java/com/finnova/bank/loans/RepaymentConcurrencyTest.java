package com.finnova.bank.loans;
import java.util.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.BankingDtos.IdempotentReply;
import com.finnova.bank.loans.LoanDtos.RepayRequest;
import com.finnova.testsupport.LoanFixtures;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE)@ActiveProfiles("dbtest")@Import(LoanFixtures.class)
class RepaymentConcurrencyTest {
    @Autowired LoanFixtures.Factory fixtures;@Autowired RepaymentService payments;@Autowired JdbcTemplate jdbc;@Autowired ObjectMapper mapper;
    LoanFixtures.Fixture fixture;
    @AfterEach void retire(){fixtures.retire(fixture);}
    @Test void simultaneousSameKeyPaysExactlyOnce()throws Exception{
        fixture=fixtures.create();long id=first();String key=UUID.randomUUID().toString();var replies=race(key,key,id);
        assertEquals(201,replies.get(0).status());assertEquals(201,replies.get(1).status());assertEquals(1,replies.stream().filter(r->!r.replayed()).count());
        assertEquals(mapper.readTree(replies.get(0).body().toString()),mapper.readTree(replies.get(1).body().toString()));invariants(id);
    }
    @Test void differentKeysCannotDoublePayOneInstallment()throws Exception{
        fixture=fixtures.create();long id=first();var replies=race(UUID.randomUUID().toString(),UUID.randomUUID().toString(),id);
        assertEquals(Set.of(201,409),new HashSet<>(replies.stream().map(IdempotentReply::status).toList()));invariants(id);
    }
    private long first(){return jdbc.queryForObject("SELECT id FROM installments WHERE loan_id=? AND installment_number=1",Long.class,fixture.loan());}
    private List<IdempotentReply> race(String one,String two,long id)throws Exception{
        CountDownLatch gate=new CountDownLatch(1);try(ExecutorService executor=Executors.newFixedThreadPool(2)){
            List<Future<IdempotentReply>> futures=new ArrayList<>();for(String key:List.of(one,two))futures.add(executor.submit(()->{gate.await();return LoanFixtures.as(fixture.borrower().user(),Role.CUSTOMER,()->payments.repay(fixture.borrower().user(),fixture.loan(),id,key,new RepayRequest(fixture.borrower().source())));}));
            gate.countDown();return List.of(futures.get(0).get(30,TimeUnit.SECONDS),futures.get(1).get(30,TimeUnit.SECONDS));
        }
    }
    private void invariants(long id){
        assertEquals(1L,jdbc.queryForObject("SELECT COUNT(*) FROM payments WHERE installment_id=?",Long.class,id));
        assertEquals(0,jdbc.queryForObject("SELECT outstanding_principal FROM loans WHERE id=?",java.math.BigDecimal.class,fixture.loan()).compareTo(jdbc.queryForObject("SELECT SUM(principal_amount) FROM installments WHERE loan_id=? AND status<>'PAID'",java.math.BigDecimal.class,fixture.loan())));
        assertEquals(0,jdbc.queryForObject("SELECT balance FROM accounts WHERE id=?",java.math.BigDecimal.class,fixture.borrower().source()).compareTo(jdbc.queryForObject("SELECT SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) FROM transactions WHERE account_id=?",java.math.BigDecimal.class,fixture.borrower().source())));
    }
}
