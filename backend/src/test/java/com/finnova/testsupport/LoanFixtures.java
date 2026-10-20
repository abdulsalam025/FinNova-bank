package com.finnova.testsupport;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.Supplier;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.loans.*;
import com.finnova.bank.loans.LoanDtos.*;
import com.finnova.bank.security.BankPrincipal;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
@TestConfiguration@Import(BankingFixtures.class)
public class LoanFixtures {
    public record Fixture(BankingFixtures.Fixture borrower,BankingFixtures.Fixture officer,long application,long loan){}
    public static <T>T as(long user,Role role,Supplier<T> call){
        var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new BankPrincipal(user,role,0),null,List.of(new SimpleGrantedAuthority("ROLE_"+role.name()))));
        SecurityContextHolder.setContext(context);try{return call.get();}finally{SecurityContextHolder.clearContext();}
    }
    @Bean public Factory loanFixtureFactory(BankingFixtures.Factory banks,ApplicationService applications,DisbursementService disbursement,JdbcTemplate jdbc,PlatformTransactionManager manager){return new Factory(banks,applications,disbursement,jdbc,manager);}
    public static class Factory {
        private final BankingFixtures.Factory banks;private final ApplicationService applications;private final DisbursementService disbursement;private final JdbcTemplate jdbc;private final TransactionTemplate tx;
        Factory(BankingFixtures.Factory banks,ApplicationService applications,DisbursementService disbursement,JdbcTemplate jdbc,PlatformTransactionManager manager){this.banks=banks;this.applications=applications;this.disbursement=disbursement;this.jdbc=jdbc;tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);}
        public Fixture create(){
            assertEquals("finnova_test",jdbc.queryForObject("SELECT DATABASE()",String.class));
            var borrower=banks.create("2000.00","0.00");var officer=banks.create("0.00","0.00");
            return tx.execute(status->{
                jdbc.update("UPDATE users SET role='LOAN_OFFICER',approval_limit=500000.00 WHERE id=?",officer.user());
                jdbc.update("INSERT INTO kyc_records(customer_id,document_reference,status,reviewed_by,reviewed_at,review_notes) VALUES(?,?,'VERIFIED',?,UTC_TIMESTAMP(6),'Synthetic loan fixture')",borrower.customer(),"DEMO-"+UUID.randomUUID(),officer.user());
                var app=as(borrower.user(),Role.CUSTOMER,()->applications.create(borrower.user(),new CreateApplication(1L,borrower.source(),new BigDecimal("10000.00"),6,"Synthetic loan fixture")));
                as(borrower.user(),Role.CUSTOMER,()->applications.submit(borrower.user(),app.id()));
                as(officer.user(),Role.LOAN_OFFICER,()->applications.staffAction(officer.user(),app.id(),"review","Synthetic review"));
                as(officer.user(),Role.LOAN_OFFICER,()->applications.staffAction(officer.user(),app.id(),"approve","Synthetic approval"));
                var loan=as(officer.user(),Role.LOAN_OFFICER,()->disbursement.disburse(officer.user(),app.id(),"Synthetic disbursement"));
                return new Fixture(borrower,officer,app.id(),loan.id());
            });
        }
        public void retire(Fixture fixture){if(fixture!=null){banks.retire(fixture.borrower());banks.retire(fixture.officer());}}
    }
}
