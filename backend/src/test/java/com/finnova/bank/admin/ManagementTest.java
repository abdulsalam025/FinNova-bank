package com.finnova.bank.admin;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finnova.bank.admin.AdminDtos.*;
import com.finnova.bank.audit.AuditQueryService;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.auth.repository.KycRepository;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.TransferRequest;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.*;
import com.finnova.bank.officer.*;
import com.finnova.bank.reports.*;
import com.finnova.bank.security.*;
import com.finnova.testsupport.*;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
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
@SpringBootTest@AutoConfigureMockMvc(print=MockMvcPrint.NONE)@ActiveProfiles("dbtest")@Transactional@Import(BankingFixtures.class)
class ManagementTest {
    @Autowired UserAdminService users;@Autowired ProductAdminService products;@Autowired ProductService catalog;@Autowired KycService kyc;
    @Autowired KycRepository kycRecords;@Autowired AuditQueryService audit;@Autowired DecisionService decisions;@Autowired ReportService reports;
    @Autowired TransferService transfers;@Autowired BankingFixtures.Factory fixtures;@Autowired JdbcTemplate jdbc;@Autowired EntityManager em;
    @Autowired MockMvc mvc;@Autowired ObjectMapper mapper;@Autowired JwtTokenService tokens;
    BankingFixtures.Fixture admin,officer,customer;
    @BeforeEach void setup(){
        admin=fixtures.create("0.00","0.00");officer=fixtures.create("0.00","0.00");customer=fixtures.create("1000.00","0.00");
        em.flush();jdbc.update("UPDATE users SET role='ADMIN',approval_limit=500000.00 WHERE id=?",admin.user());jdbc.update("UPDATE users SET role='LOAN_OFFICER',approval_limit=500000.00 WHERE id=?",officer.user());em.clear();
    }
    @AfterTransaction void retire(){fixtures.retire(admin);fixtures.retire(officer);fixtures.retire(customer);}
    @Test void activationRevokesOldTokensWithoutMovingMoney()throws Exception{
        Cookie old=cookie(customer.user(),0);asAdmin(()->users.activate(admin.user(),customer.user(),new Activation(false,"Synthetic deactivate")));
        mvc.perform(get("/api/profile").cookie(old)).andExpect(status().isUnauthorized());
        asAdmin(()->users.activate(admin.user(),customer.user(),new Activation(true,"Synthetic reactivate")));
        mvc.perform(get("/api/profile").cookie(old)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profile").cookie(cookie(customer.user(),2))).andExpect(status().isOk());
        assertEquals(new BigDecimal("1000.00"),jdbc.queryForObject("SELECT balance FROM accounts WHERE id=?",BigDecimal.class,customer.source()));
        assertEquals(2L,jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE event_type='USER_ACTIVATION_CHANGED' AND resource_id=?",Long.class,Long.toString(customer.user())));
    }
    @Test void roleAssignmentValidatesLimitRevokesSessionsAndCannotModifySelf(){
        assertEquals(409,assertThrows(ApiException.class,()->asAdmin(()->users.activate(admin.user(),admin.user(),new Activation(false,"Self deactivate")))).status().value());
        assertEquals(409,assertThrows(ApiException.class,()->asAdmin(()->users.role(admin.user(),admin.user(),new AssignRole(Role.LOAN_OFFICER,new BigDecimal("1000.00"),"Self role")))).status().value());
        assertEquals(422,assertThrows(ApiException.class,()->asAdmin(()->users.role(admin.user(),customer.user(),new AssignRole(Role.LOAN_OFFICER,null,"Missing limit")))).status().value());
        var changed=asAdmin(()->users.role(admin.user(),customer.user(),new AssignRole(Role.LOAN_OFFICER,new BigDecimal("10000.00"),"Synthetic staff assignment")));
        assertEquals("LOAN_OFFICER",changed.role());assertEquals(new BigDecimal("10000.00"),changed.approvalLimit());
        assertEquals(1L,jdbc.queryForObject("SELECT token_version FROM users WHERE id=?",Long.class,customer.user()));
    }
    @Test void activationRejectsUnprovisionedSeedAndUserReadNeverExposesSecrets()throws Exception{
        assertEquals(422,assertThrows(ApiException.class,()->asAdmin(()->users.activate(admin.user(),1001,new Activation(true,"Cannot invent credential")))).status().value());
        mvc.perform(get("/api/admin/users/"+customer.user()).cookie(cookie(admin.user(),0))).andExpect(status().isOk())
            .andExpect(jsonPath("$.passwordHash").doesNotExist()).andExpect(jsonPath("$.tokenVersion").doesNotExist());
        mvc.perform(get("/api/admin/users").cookie(cookie(customer.user(),0))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users").cookie(cookie(officer.user(),0))).andExpect(status().isForbidden());
    }
    @Test void productCrudDeactivatesRatherThanDeleting(){
        String tag=UUID.randomUUID().toString().replace("-","").substring(0,12);var created=asAdmin(()->products.create(admin.user(),new ProductAdminService.Create("DEMO_"+tag.toUpperCase(),terms("Synthetic "+tag),"Synthetic create")));
        long id=created.product().id();assertTrue(created.active());assertEquals(id,catalog.detail(id).id());
        asAdmin(()->products.update(admin.user(),id,new ProductAdminService.Update(terms("Updated "+tag),"Synthetic update")));
        var inactive=asAdmin(()->products.activate(admin.user(),id,new Activation(false,"Synthetic deactivate")));assertFalse(inactive.active());
        assertEquals(404,assertThrows(ApiException.class,()->catalog.detail(id)).status().value());
        assertEquals(1L,jdbc.queryForObject("SELECT COUNT(*) FROM loan_products WHERE id=?",Long.class,id));
    }
    @Test void productRangeValidationDoesNotRelyOnDatabaseErrors(){
        var t=terms("Invalid synthetic");var invalid=new ProductAdminService.Terms(t.name(),t.description(),new BigDecimal("100000.00"),new BigDecimal("10000.00"),t.annualRate(),t.minAnnualRate(),t.maxAnnualRate(),t.minTenureMonths(),t.maxTenureMonths(),t.tenureStepMonths(),t.minAge(),t.maxAge(),t.maxIncomeMultiplier());
        assertEquals(422,assertThrows(ApiException.class,()->asAdmin(()->products.create(admin.user(),new ProductAdminService.Create("DEMO_BAD_"+UUID.randomUUID().toString().substring(0,8).toUpperCase(),invalid,"Invalid range")))).status().value());
    }
    @Test void officerKycRejectResubmitVerifyAndImmutableHistory(){
        long id=pending();var rejected=asOfficer(()->kyc.review(officer.user(),id,new KycDtos.Review(KycDtos.Decision.REJECTED,"Synthetic information missing")));assertEquals("REJECTED",rejected.status());
        LoanFixtures.as(customer.user(),Role.CUSTOMER,()->kyc.resubmit(customer.user(),"Synthetic information supplied"));
        var verified=asOfficer(()->kyc.review(officer.user(),id,new KycDtos.Review(KycDtos.Decision.VERIFIED,"Synthetic checks satisfied")));assertEquals("VERIFIED",verified.status());
        assertEquals(409,assertThrows(ApiException.class,()->asOfficer(()->kyc.review(officer.user(),id,new KycDtos.Review(KycDtos.Decision.REJECTED,"Cannot overwrite")))).status().value());
        assertEquals(2L,jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE event_type='KYC_DECISION' AND resource_id=?",Long.class,Long.toString(id)));
    }
    @Test void adminCanViewKycButCannotDecideAndReasonsAreValidated()throws Exception{
        long id=pending();mvc.perform(get("/api/officer/kyc/"+id).cookie(cookie(admin.user(),0))).andExpect(status().isOk());
        mvc.perform(post("/api/officer/kyc/"+id+"/decision").cookie(cookie(admin.user(),0)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"VERIFIED\",\"reason\":\"Admin view only\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/officer/kyc/"+id+"/decision").cookie(cookie(officer.user(),0)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"VERIFIED\",\"reason\":\"\"}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/officer/kyc").cookie(cookie(customer.user(),0))).andExpect(status().isForbidden());
    }
    @Test void officerCannotReviewOwnHistoricalCustomerKyc(){
        long id=pending();em.flush();jdbc.update("UPDATE users SET role='LOAN_OFFICER',approval_limit=500000.00 WHERE id=?",customer.user());em.clear();
        assertEquals(403,assertThrows(ApiException.class,()->LoanFixtures.as(customer.user(),Role.LOAN_OFFICER,()->kyc.review(customer.user(),id,new KycDtos.Review(KycDtos.Decision.VERIFIED,"Self review forbidden")))).status().value());
    }
    @Test void officerAuditAndDecisionHistoryCannotEscapeActorScope(){
        long id=pending();asOfficer(()->kyc.review(officer.user(),id,new KycDtos.Review(KycDtos.Decision.VERIFIED,"Reason retained")));
        var own=asOfficer(()->audit.search(officer.user(),null,"KYC_DECISION",null,null,null,null,0,20));assertEquals(1,own.items().size());assertTrue(own.items().stream().allMatch(a->a.actorUserId()==officer.user()));
        assertEquals(403,assertThrows(ApiException.class,()->asOfficer(()->audit.search(officer.user(),admin.user(),null,null,null,null,null,0,20))).status().value());
        var history=asOfficer(()->decisions.list(officer.user(),false,null,null,null,0,20));assertEquals(1,history.items().size());assertEquals("Reason retained",history.items().getFirst().reason());
        assertEquals(403,assertThrows(ApiException.class,()->asOfficer(()->decisions.list(officer.user(),true,null,null,null,0,20))).status().value());
    }
    @Test void dashboardUsesRealScopedQueriesAndDoesNotDoubleCountTransferCredit(){
        LoanFixtures.as(customer.user(),Role.CUSTOMER,()->transfers.transfer(customer.user(),UUID.randomUUID().toString(),new TransferRequest(customer.source(),customer.target(),new BigDecimal("10.00"),"Report proof")));
        var own=LoanFixtures.as(customer.user(),Role.CUSTOMER,()->reports.dashboard(customer.user(),null,null));
        assertEquals(0,new BigDecimal("1000.00").compareTo(own.accounts().balance()));assertEquals(3,own.accounts().ledgerEntries());assertEquals(2,own.accounts().operations());assertEquals(0,new BigDecimal("1010.00").compareTo(own.accounts().operationVolume()));
        assertEquals(0,new BigDecimal("1010.00").compareTo(own.activity().stream().map(p->p.credits()).reduce(BigDecimal.ZERO,BigDecimal::add)));
        assertEquals(0,new BigDecimal("10.00").compareTo(own.activity().stream().map(p->p.debits()).reduce(BigDecimal.ZERO,BigDecimal::add)));
        var officerView=asOfficer(()->reports.dashboard(officer.user(),null,null));assertNull(officerView.accounts());assertTrue(officerView.activity().isEmpty());
        var adminView=asAdmin(()->reports.dashboard(admin.user(),null,null));assertNotNull(adminView.accounts().activeCustomers());
        assertEquals(0,jdbc.queryForObject("SELECT COALESCE(SUM(balance),0.00) FROM accounts",BigDecimal.class).compareTo(adminView.accounts().balance()));
        assertTrue(asAdmin(()->reports.performance(admin.user(),null,null,0,20)).totalElements()>=3);
    }
    @Test void dashboardAndAuditHttpFiltersRejectInvalidDatesAndOversizedPages()throws Exception{
        mvc.perform(get("/api/dashboard").cookie(cookie(admin.user(),0)).param("from","2026-10-20").param("to","2026-10-01")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/dashboard")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/audit-logs").cookie(cookie(customer.user(),0))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users").cookie(cookie(admin.user(),0)).param("size","101")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/dashboard").cookie(cookie(officer.user(),0))).andExpect(status().isOk()).andExpect(jsonPath("$.accounts").doesNotExist());
    }
    private long pending(){return kycRecords.saveAndFlush(new KycRecord(customer.customer(),Instant.now())).getId();}
    private ProductAdminService.Terms terms(String name){return new ProductAdminService.Terms(name,"Synthetic product only",new BigDecimal("10000.00"),new BigDecimal("100000.00"),new BigDecimal("12.00"),new BigDecimal("10.00"),new BigDecimal("14.00"),6,24,6,21,65,new BigDecimal("20.00"));}
    private <T>T asAdmin(Supplier<T> call){return LoanFixtures.as(admin.user(),Role.ADMIN,call);}private <T>T asOfficer(Supplier<T> call){return LoanFixtures.as(officer.user(),Role.LOAN_OFFICER,call);}
    private Cookie cookie(long user,long version){return new Cookie(AuthCookies.ACCESS,tokens.issue(user,version));}
    private RequestPostProcessor csrf()throws Exception{var r=mvc.perform(get("/api/auth/csrf")).andReturn();String h=r.getResponse().getHeaders("Set-Cookie").stream().filter(s->s.startsWith("FN_CSRF=")).findFirst().orElseThrow();String t=mapper.readTree(r.getResponse().getContentAsString()).get("token").asText();return request->{var values=new ArrayList<Cookie>();if(request.getCookies()!=null)values.addAll(Arrays.asList(request.getCookies()));values.removeIf(c->c.getName().equals("FN_CSRF"));values.add(new Cookie("FN_CSRF",h.substring(8,h.indexOf(';'))));request.setCookies(values.toArray(Cookie[]::new));request.addHeader("X-CSRF-TOKEN",t);return request;};}
}
