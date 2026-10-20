package com.finnova.bank.admin;
import java.util.*;
import java.util.concurrent.*;
import com.finnova.bank.admin.AdminDtos.Activation;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.common.ApiException;
import com.finnova.testsupport.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE)@ActiveProfiles("dbtest")@Import(BankingFixtures.class)
class AdminConcurrencyTest {
    @Autowired BankingFixtures.Factory fixtures;@Autowired UserAdminService users;@Autowired JdbcTemplate jdbc;@Autowired PlatformTransactionManager manager;
    BankingFixtures.Fixture first,second;
    @AfterEach void retire(){fixtures.retire(first);fixtures.retire(second);}
    @Test void twoAdminsCannotDeactivateEachOtherAndLeaveNoActiveAdmin()throws Exception{
        assertEquals("finnova_test",jdbc.queryForObject("SELECT DATABASE()",String.class));first=fixtures.create("0.00","0.00");second=fixtures.create("0.00","0.00");
        new TransactionTemplate(manager).executeWithoutResult(status->{jdbc.update("UPDATE users SET role='ADMIN',approval_limit=500000.00 WHERE id IN (?,?)",first.user(),second.user());});
        CountDownLatch gate=new CountDownLatch(1);
        try(ExecutorService executor=Executors.newFixedThreadPool(2)){
            Future<Integer> one=executor.submit(()->{gate.await();return deactivate(first.user(),second.user());});Future<Integer> two=executor.submit(()->{gate.await();return deactivate(second.user(),first.user());});gate.countDown();
            assertEquals(Set.of(200,401),Set.of(one.get(30,TimeUnit.SECONDS),two.get(30,TimeUnit.SECONDS)));
        }
        assertEquals(1L,jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id IN (?,?) AND role='ADMIN' AND enabled=TRUE",Long.class,first.user(),second.user()));
        assertEquals(1L,jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE event_type='USER_ACTIVATION_CHANGED' AND resource_id IN (?,?)",Long.class,Long.toString(first.user()),Long.toString(second.user())));
    }
    private int deactivate(long actor,long target){try{LoanFixtures.as(actor,Role.ADMIN,()->users.activate(actor,target,new Activation(false,"Concurrent synthetic admin test")));return 200;}catch(ApiException ex){return ex.status().value();}}
}
