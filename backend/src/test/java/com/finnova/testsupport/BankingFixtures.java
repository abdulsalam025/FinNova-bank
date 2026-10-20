package com.finnova.testsupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.auth.repository.*;
import com.finnova.bank.banking.*;
import com.finnova.bank.security.BankPrincipal;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
@TestConfiguration
public class BankingFixtures {
    public record Fixture(long user,long customer,long source,long target) { }
    @Bean public Factory bankingFixtureFactory(UserRepository users,CustomerRepository customers,AccountRepository accounts,
            LedgerRepository ledger,AuditService audit,PasswordEncoder encoder,JdbcTemplate jdbc,PlatformTransactionManager manager){
        return new Factory(users,customers,accounts,ledger,audit,encoder,jdbc,manager);
    }
    public static <T>T as(Fixture fixture,Supplier<T> action){
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new BankPrincipal(fixture.user(),Role.CUSTOMER,0),null,List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER"))));
        SecurityContextHolder.setContext(context);
        try{return action.get();}finally{SecurityContextHolder.clearContext();}
    }
    public static class Factory {
        private final UserRepository users;private final CustomerRepository customers;private final AccountRepository accounts;
        private final LedgerRepository ledger;private final AuditService audit;private final PasswordEncoder encoder;private final JdbcTemplate jdbc;
        private final TransactionTemplate tx;
        Factory(UserRepository users,CustomerRepository customers,AccountRepository accounts,LedgerRepository ledger,
                AuditService audit,PasswordEncoder encoder,JdbcTemplate jdbc,PlatformTransactionManager manager){
            this.users=users;this.customers=customers;this.accounts=accounts;this.ledger=ledger;this.audit=audit;this.encoder=encoder;this.jdbc=jdbc;
            tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        }
        public Fixture create(String first,String second){
            guard();
            return tx.execute(status->{
                Instant now=Instant.now();String run=UUID.randomUUID().toString();
                var user=users.saveAndFlush(BankUser.customer("banking-fixture-"+run+"@finnova.test","Synthetic Banking Fixture",encoder.encode("Fixture_Only9!Password"),now));
                var customer=customers.saveAndFlush(new CustomerProfile(user.getId(),java.time.LocalDate.of(1990,1,1),new BigDecimal("35000.00"),now));
                BankAccount source=funded(customer.getId(),user.getId(),new BigDecimal(first),now);
                BankAccount target=funded(customer.getId(),user.getId(),new BigDecimal(second),now);
                audit.record(AuditActor.system(),"TEST_FIXTURE_CREATED","SUCCESS","USER",user.getId().toString(),Map.of("testOnly",true));
                return new Fixture(user.getId(),customer.getId(),source.getId(),target.getId());
            });
        }
        private BankAccount funded(long customer,long user,BigDecimal amount,Instant now){
            BankAccount account=accounts.saveAndFlush(new BankAccount(customer,"Synthetic test account",BankAccount.Type.SAVINGS,now));
            if(amount.signum()>0){
                account.applyBalance(amount,now);
                ledger.save(new FinancialTransaction(account.getId(),null,UUID.randomUUID().toString(),"CREDIT","OPENING_CREDIT",amount,amount,"TEST ONLY synthetic fixture funding",user,null,now));
            }
            accounts.flush();return account;
        }
        public void retire(Fixture fixture){
            if(fixture==null)return;guard();
            tx.executeWithoutResult(status->{
                jdbc.update("UPDATE users SET enabled=FALSE,token_version=token_version+1 WHERE id=?",fixture.user());
                jdbc.update("UPDATE accounts SET status='FROZEN',version=version+1 WHERE id IN (?,?) AND status<>'CLOSED'",fixture.source(),fixture.target());
                audit.record(AuditActor.system(),"TEST_FIXTURE_RETIRED","SUCCESS","USER",Long.toString(fixture.user()),Map.of("financialRowsRetained",true));
            });
        }
        private void guard(){
            assertEquals("finnova_test",jdbc.queryForObject("SELECT DATABASE()",String.class),"STOP: fixture write outside test schema");
            assertTrue(jdbc.queryForObject("SELECT CURRENT_USER()",String.class).startsWith("finnova_app@"));
        }
    }
}
