package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.loans.LoanDtos.*;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.security.*;
import com.finnova.testsupport.*;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.transaction.AfterTransaction;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest@AutoConfigureMockMvc(print=MockMvcPrint.NONE)@ActiveProfiles("dbtest")@Transactional
@Import({BankingFixtures.class,LoanWorkflowTest.Time.class})
class LoanWorkflowTest {
    @TestConfiguration static class Time{@Bean@Primary Clock loanTestClock(){return Clock.fixed(Instant.parse("2026-01-10T00:00:00Z"),ZoneOffset.UTC);}}
    @Autowired ApplicationService applications;@Autowired DisbursementService disbursement;@Autowired RepaymentService repayments;@Autowired LoanQueryService queries;
    @Autowired OverdueService overdue;@Autowired JdbcTemplate jdbc;@Autowired EntityManager em;@Autowired BankingFixtures.Factory fixtures;
    @Autowired MockMvc mvc;@Autowired ObjectMapper mapper;@Autowired JwtTokenService tokens;
    BankingFixtures.Fixture borrower,officer;
    @BeforeEach void setup(){
        borrower=fixtures.create("2000.00","0.00");officer=fixtures.create("0.00","0.00");
        jdbc.update("UPDATE users SET role='LOAN_OFFICER',approval_limit=500000.00 WHERE id=?",officer.user());
        jdbc.update("INSERT INTO kyc_records(customer_id,document_reference,status,reviewed_by,reviewed_at,review_notes) VALUES(?,?,'VERIFIED',?,UTC_TIMESTAMP(6),'Synthetic review')",borrower.customer(),"DEMO-"+UUID.randomUUID(),officer.user());em.clear();
    }
    @AfterTransaction void retire(){fixtures.retire(borrower);fixtures.retire(officer);}
    @Test void fullLifecycleInfoLoopApprovalDisbursementAndClosure(){
        var app=draft();count(0,"SELECT COUNT(*) FROM loans WHERE loan_application_id=?",app.id());
        customer(()->applications.submit(borrower.user(),app.id()));staff(()->applications.staffAction(officer.user(),app.id(),"review","Review"));
        staff(()->applications.staffAction(officer.user(),app.id(),"request-info","Explain purpose"));customer(()->applications.resubmit(borrower.user(),app.id(),"Synthetic details"));
        staff(()->applications.staffAction(officer.user(),app.id(),"approve","Within policy"));count(0,"SELECT COUNT(*) FROM loans WHERE loan_application_id=?",app.id());
        var loan=staff(()->disbursement.disburse(officer.user(),app.id(),"Simulated disbursement"));assertEquals("REPAYMENT",loan.status());
        var schedule=customer(()->queries.schedule(borrower.user(),loan.id(),null,0,100));assertEquals(6,schedule.items().size());
        for(var installment:schedule.items())assertEquals(201,customer(()->repayments.repay(borrower.user(),loan.id(),installment.id(),UUID.randomUUID().toString(),new RepayRequest(borrower.source()))).status());
        var closed=customer(()->queries.detail(borrower.user(),loan.id()));assertEquals("CLOSED",closed.status());assertEquals(new BigDecimal("0.00"),closed.outstandingPrincipal());
        count(6,"SELECT COUNT(*) FROM payments WHERE loan_id=?",loan.id());
        assertEquals(List.of("SUBMITTED","UNDER_REVIEW","ADDITIONAL_INFO_REQUIRED","UNDER_REVIEW","APPROVED","DISBURSED","REPAYMENT","CLOSED"),customer(()->applications.history(borrower.user(),app.id(),0,100)).items().stream().map(HistoryView::toStatus).toList());
        reconcile(loan.id());
    }
    @Test void draftCrudAndRejectedCannotReopen(){
        var first=draft();customer(()->applications.update(borrower.user(),first.id(),new UpdateDraft(1L,borrower.source(),new BigDecimal("12000.00"),6,"Updated purpose")));
        customer(()->{applications.deleteDraft(borrower.user(),first.id());return true;});count(0,"SELECT COUNT(*) FROM loan_applications WHERE id=?",first.id());
        var app=draft();customer(()->applications.submit(borrower.user(),app.id()));
        assertEquals(409,assertThrows(ApiException.class,()->customer(()->{applications.deleteDraft(borrower.user(),app.id());return true;})).status().value());
        staff(()->applications.staffAction(officer.user(),app.id(),"review","Review"));staff(()->applications.staffAction(officer.user(),app.id(),"reject","Policy reason"));
        assertEquals(409,assertThrows(ApiException.class,()->customer(()->applications.resubmit(borrower.user(),app.id(),"No reopen"))).status().value());
    }
    @Test void ownershipApprovalLimitAndKycAreEnforced(){
        assertThrows(ApiException.class,()->customer(()->applications.create(borrower.user(),new CreateApplication(1L,officer.source(),new BigDecimal("10000.00"),6,"Wrong owner"))));
        var app=draft();customer(()->applications.submit(borrower.user(),app.id()));staff(()->applications.staffAction(officer.user(),app.id(),"review","Review"));
        // Flush the review before JDBC fixture changes and em.clear().
        em.flush();
        assertEquals("UNDER_REVIEW",jdbc.queryForObject("SELECT status FROM loan_applications WHERE id=?",String.class,app.id()));
        jdbc.update("UPDATE users SET approval_limit=5000.00 WHERE id=?",officer.user());em.clear();
        ApiException limit=assertThrows(ApiException.class,()->staff(()->applications.staffAction(officer.user(),app.id(),"approve","Too large")));
        assertEquals(422,limit.status().value());assertTrue(limit.getMessage().contains("approval limit"));
        em.flush();
        jdbc.update("UPDATE users SET approval_limit=500000.00 WHERE id=?",officer.user());jdbc.update("UPDATE kyc_records SET status='PENDING',reviewed_by=NULL,reviewed_at=NULL WHERE customer_id=?",borrower.customer());em.clear();
        assertEquals("UNDER_REVIEW",jdbc.queryForObject("SELECT status FROM loan_applications WHERE id=?",String.class,app.id()));
        ApiException kyc=assertThrows(ApiException.class,()->staff(()->applications.staffAction(officer.user(),app.id(),"approve","KYC pending")));
        assertEquals(422,kyc.status().value());assertTrue(kyc.getMessage().contains("KYC"));
    }
    @Test void formerCustomerCannotReviewTheirOwnApplication(){
        var app=draft();customer(()->applications.submit(borrower.user(),app.id()));jdbc.update("UPDATE users SET role='LOAN_OFFICER',approval_limit=500000.00 WHERE id=?",borrower.user());em.clear();
        assertEquals(403,assertThrows(ApiException.class,()->LoanFixtures.as(borrower.user(),Role.LOAN_OFFICER,()->applications.staffAction(borrower.user(),app.id(),"review","Self review"))).status().value());
    }
    @Test void repaymentReplayOrderingAndDoublePaymentProtection()throws Exception{
        var loan=ready();var schedule=customer(()->queries.schedule(borrower.user(),loan.id(),null,0,100));
        assertEquals(409,customer(()->repayments.repay(borrower.user(),loan.id(),schedule.items().get(1).id(),UUID.randomUUID().toString(),new RepayRequest(borrower.source()))).status());
        long id=schedule.items().getFirst().id();String key=UUID.randomUUID().toString();
        var first=customer(()->repayments.repay(borrower.user(),loan.id(),id,key,new RepayRequest(borrower.source())));var repeat=customer(()->repayments.repay(borrower.user(),loan.id(),id,key,new RepayRequest(borrower.source())));
        assertEquals(201,first.status());assertTrue(repeat.replayed());assertEquals(mapper.readTree(first.body().toString()),mapper.readTree(repeat.body().toString()));
        assertEquals(409,customer(()->repayments.repay(borrower.user(),loan.id(),id,UUID.randomUUID().toString(),new RepayRequest(borrower.source()))).status());
        count(1,"SELECT COUNT(*) FROM payments WHERE installment_id=?",id);reconcile(loan.id());
    }
    @Test void adminDemoDateMarksOverdueButCustomerCannotSetIt(){
        var loan=ready();var first=customer(()->queries.schedule(borrower.user(),loan.id(),null,0,100)).items().getFirst();jdbc.update("UPDATE users SET role='ADMIN' WHERE id=?",officer.user());em.clear();
        LoanFixtures.as(officer.user(),Role.ADMIN,()->overdue.setDate(officer.user(),first.dueDate().plusDays(1)));LoanFixtures.as(officer.user(),Role.ADMIN,()->overdue.manual(officer.user()));
        assertEquals("OVERDUE",jdbc.queryForObject("SELECT status FROM installments WHERE id=?",String.class,first.id()));
        assertThrows(org.springframework.security.access.AccessDeniedException.class,()->customer(()->overdue.setDate(borrower.user(),first.dueDate())));
    }
    @Test void publicQuoteHttp403409AndMassAssignmentChecks()throws Exception{
        mvc.perform(get("/api/loan-products/1/quote").param("principal","100000.00").param("months","12")).andExpect(status().isOk()).andExpect(jsonPath("$.calculation.emi").value("8884.88"));
        mvc.perform(get("/api/loan-products/compare").param("ids","1,2,3").param("principal","50000.00").param("months","12")).andExpect(status().isOk());
        var app=draft();mvc.perform(post("/api/loan-applications/"+app.id()+"/approve").cookie(cookie(borrower.user())).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Customer cannot approve\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/loan-applications/"+app.id()+"/approve").cookie(cookie(officer.user())).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Wrong state\"}")).andExpect(status().isConflict());
        mvc.perform(get("/api/loan-applications/"+app.id()).cookie(cookie(officer.user()))).andExpect(status().isNotFound());
        mvc.perform(post("/api/loan-applications").cookie(cookie(borrower.user())).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"productId\":1,\"accountId\":"+borrower.source()+",\"principal\":10000,\"months\":6,\"purpose\":\"Synthetic\",\"status\":\"APPROVED\"}")).andExpect(status().isBadRequest());
    }
    private ApplicationView draft(){return customer(()->applications.create(borrower.user(),new CreateApplication(1L,borrower.source(),new BigDecimal("10000.00"),6,"Synthetic purpose")));}
    private LoanView ready(){var app=draft();customer(()->applications.submit(borrower.user(),app.id()));staff(()->applications.staffAction(officer.user(),app.id(),"review","Review"));staff(()->applications.staffAction(officer.user(),app.id(),"approve","Approve"));return staff(()->disbursement.disburse(officer.user(),app.id(),"Disburse"));}
    private <T>T customer(java.util.function.Supplier<T> call){return LoanFixtures.as(borrower.user(),Role.CUSTOMER,call);}
    private <T>T staff(java.util.function.Supplier<T> call){return LoanFixtures.as(officer.user(),Role.LOAN_OFFICER,call);}
    private void count(long n,String sql,Object...args){assertEquals(n,jdbc.queryForObject(sql,Long.class,args));}
    private void reconcile(long loan){
        em.flush();assertEquals(0,jdbc.queryForObject("SELECT outstanding_principal FROM loans WHERE id=?",BigDecimal.class,loan).compareTo(jdbc.queryForObject("SELECT COALESCE(SUM(principal_amount),0.00) FROM installments WHERE loan_id=? AND status<>'PAID'",BigDecimal.class,loan)));
        assertEquals(0,jdbc.queryForObject("SELECT balance FROM accounts WHERE id=?",BigDecimal.class,borrower.source()).compareTo(jdbc.queryForObject("SELECT SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) FROM transactions WHERE account_id=?",BigDecimal.class,borrower.source())));
    }
    private Cookie cookie(long user){return new Cookie(AuthCookies.ACCESS,tokens.issue(user,0));}
    private RequestPostProcessor csrf()throws Exception{
        var result=mvc.perform(get("/api/auth/csrf")).andReturn();String header=result.getResponse().getHeaders("Set-Cookie").stream().filter(s->s.startsWith("FN_CSRF=")).findFirst().orElseThrow();String token=mapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
        return request->{var values=new ArrayList<Cookie>();if(request.getCookies()!=null)values.addAll(Arrays.asList(request.getCookies()));values.removeIf(c->c.getName().equals("FN_CSRF"));values.add(new Cookie("FN_CSRF",header.substring(8,header.indexOf(';'))));request.setCookies(values.toArray(Cookie[]::new));request.addHeader("X-CSRF-TOKEN",token);return request;};
    }
}
