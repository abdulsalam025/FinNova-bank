package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.LoanDtos.*;
import jakarta.persistence.criteria.Predicate;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class ApplicationService {
    private final ApplicationRepository applications;private final ProductRepository products;private final AccountRepository accounts;
    private final HistoryRepository history;private final LoanAccess access;private final LoanPolicy policy;private final LoanTransitions transitions;
    private final AuditService audit;private final Clock clock;
    public ApplicationService(ApplicationRepository applications,ProductRepository products,AccountRepository accounts,HistoryRepository history,
        LoanAccess access,LoanPolicy policy,LoanTransitions transitions,AuditService audit,Clock clock){
        this.applications=applications;this.products=products;this.accounts=accounts;this.history=history;this.access=access;this.policy=policy;this.transitions=transitions;this.audit=audit;this.clock=clock;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('CUSTOMER') and #user==authentication.principal.id()")
    public ApplicationView create(long user,CreateApplication request){
        CustomerProfile customer=access.customer(user,true);
        LoanApplication a=new LoanApplication();a.customerId=customer.getId();a.status=ApplicationStatus.DRAFT;a.createdAt=clock.instant();a.updatedAt=a.createdAt;
        fill(a,customer,request.productId(),request.accountId(),request.principal(),request.months(),request.purpose());
        applications.saveAndFlush(a);audit.record(AuditActor.user(user,Role.CUSTOMER),"LOAN_DRAFT_CREATED","SUCCESS","LOAN_APPLICATION",a.id.toString(),Map.of("synthetic",true));
        return LoanDtos.view(a);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('CUSTOMER') and #user==authentication.principal.id()")
    public ApplicationView update(long user,long id,UpdateDraft request){
        CustomerProfile customer=access.customer(user,true);
        var locator=owned(id,customer.getId());
        if(accounts.countOwned(customer.getId(),List.of(request.accountId()))!=1)throw access.missing();
        // Global ordering: actor SHARE -> account -> application. Draft account may
        // change, so lock both old/new account IDs in ascending order first.
        long low=Math.min(locator.getAccountId(),request.accountId()),high=Math.max(locator.getAccountId(),request.accountId());
        accounts.lockById(low).orElseThrow(access::missing);if(high!=low)accounts.lockById(high).orElseThrow(access::missing);
        LoanApplication a=applications.lock(id).orElseThrow(access::missing);
        if(a.status!=ApplicationStatus.DRAFT)throw conflict();
        fill(a,customer,request.productId(),request.accountId(),request.principal(),request.months(),request.purpose());a.updatedAt=clock.instant();
        audit.record(AuditActor.user(user,Role.CUSTOMER),"LOAN_DRAFT_UPDATED","SUCCESS","LOAN_APPLICATION",a.id.toString(),Map.of());return LoanDtos.view(a);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('CUSTOMER') and #user==authentication.principal.id()")
    public void deleteDraft(long user,long id){
        long customer=access.customer(user,true).getId();owned(id,customer);LoanApplication a=applications.lock(id).orElseThrow(access::missing);
        if(a.status!=ApplicationStatus.DRAFT)throw conflict();
        applications.delete(a);applications.flush();
        audit.record(AuditActor.user(user,Role.CUSTOMER),"LOAN_DRAFT_DELETED","SUCCESS","LOAN_APPLICATION",Long.toString(id),Map.of("hardDeleteAllowed",true));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('CUSTOMER') and #user==authentication.principal.id()")
    public ApplicationView submit(long user,long id){
        CustomerProfile customer=access.customer(user,true);var locator=owned(id,customer.getId());
        BankAccount account=accounts.lockById(locator.getAccountId()).orElseThrow(access::missing);
        LoanApplication a=applications.lock(id).orElseThrow(access::missing);LoanLifecycle.require(a.status,ApplicationStatus.SUBMITTED,Role.CUSTOMER);
        activeOwned(account,customer.getId());LoanProduct product=products.share(a.productId).orElseThrow(access::missing);
        policy.eligibility(product,customer,a.principal,a.annualRate,a.months,a.income);a.submittedAt=clock.instant();
        transitions.move(a,ApplicationStatus.SUBMITTED,user,Role.CUSTOMER,"Customer submitted synthetic application.");return LoanDtos.view(a);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('CUSTOMER') and #user==authentication.principal.id()")
    public ApplicationView resubmit(long user,long id,String notes){
        long customer=access.customer(user,true).getId();owned(id,customer);LoanApplication a=applications.lock(id).orElseThrow(access::missing);
        LoanLifecycle.require(a.status,ApplicationStatus.UNDER_REVIEW,Role.CUSTOMER);a.customerNotes=policy.notes(notes);
        transitions.move(a,ApplicationStatus.UNDER_REVIEW,user,Role.CUSTOMER,a.customerNotes);return LoanDtos.view(a);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasAnyRole('LOAN_OFFICER','ADMIN') and #user==authentication.principal.id()")
    public ApplicationView staffAction(long user,long id,String action,String notes){
        BankUser actor=access.staff(user);String reason=policy.notes(notes);
        LoanApplication a=applications.lock(id).orElseThrow(access::missing);access.noSelfDecision(user,a.customerId);
        ApplicationStatus to=switch(action){case "review"->ApplicationStatus.UNDER_REVIEW;case "request-info"->ApplicationStatus.ADDITIONAL_INFO_REQUIRED;case "approve"->ApplicationStatus.APPROVED;case "reject"->ApplicationStatus.REJECTED;default->throw conflict();};
        LoanLifecycle.require(a.status,to,actor.getRole());
        if("approve".equals(action)){
            LoanProduct product=products.share(a.productId).orElseThrow(access::missing);
            policy.eligibility(product,access.owner(a.customerId),a.principal,a.annualRate,a.months,a.income);
            approval(actor,a);a.approvedBy=user;a.approvedAt=clock.instant();a.decisionReason=reason;
        }
        if("review".equals(action))a.assignedOfficer=user;
        if("request-info".equals(action))a.additionalInfo=reason;
        if("reject".equals(action))a.decisionReason=reason;
        transitions.move(a,to,user,actor.getRole(),reason);
        if(to==ApplicationStatus.APPROVED||to==ApplicationStatus.REJECTED)audit.record(AuditActor.user(user,actor.getRole()),"LOAN_DECISION","SUCCESS","LOAN_APPLICATION",a.id.toString(),Map.of("decision",to.name()));
        return LoanDtos.view(a);
    }
    public void approval(BankUser actor,LoanApplication a){
        if(actor.getApprovalLimit()==null||a.principal.compareTo(actor.getApprovalLimit())>0)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"Application exceeds your policy approval limit.");
        if(!"VERIFIED".equals(applications.kyc(a.customerId).orElse("PENDING")))throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"Verified synthetic KYC is required before approval/disbursement.");
    }
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #user==authentication.principal.id()")
    public PageView<ApplicationView> list(long user,ApplicationStatus status,int page,int size){
        Role role=access.readActor(user);Long customer=role==Role.CUSTOMER?access.customer(user,false).getId():null;
        var query=ListQuery.of(page,size,"createdAt","DESC",Set.of("createdAt"));
        var result=applications.findAll((r,c,b)->{List<Predicate> p=new ArrayList<>();if(customer!=null)p.add(b.equal(r.get("customerId"),customer));if(status!=null)p.add(b.equal(r.get("status"),status));if(customer==null)p.add(b.notEqual(r.get("status"),ApplicationStatus.DRAFT));return b.and(p.toArray(Predicate[]::new));},query.pageable());
        return new PageView<>(result.getContent().stream().map(LoanDtos::view).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"createdAt","DESC");
    }
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #user==authentication.principal.id()")
    public ApplicationView detail(long user,long id){LoanApplication a=applications.findById(id).orElseThrow(access::missing);access.readable(user,a.customerId);if(access.readActor(user)!=Role.CUSTOMER&&a.status==ApplicationStatus.DRAFT)throw access.missing();return LoanDtos.view(a);}
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #user==authentication.principal.id()")
    public PageView<HistoryView> history(long user,long id,int page,int size){
        LoanApplication a=applications.findById(id).orElseThrow(access::missing);access.readable(user,a.customerId);
        var query=ListQuery.of(page,size,"occurredAt","ASC",Set.of("occurredAt"));
        var result=history.findAll((r,c,b)->b.equal(r.get("applicationId"),id),query.pageable());
        return new PageView<>(result.getContent().stream().map(h->new HistoryView(h.id,h.fromStatus,h.toStatus,h.actorType,h.actorId,h.actorRole,h.notes,h.occurredAt)).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"occurredAt","ASC");
    }
    private ApplicationRepository.Locator owned(long id,long customer){return applications.locator(id).filter(a->a.getCustomerId()==customer).orElseThrow(access::missing);}
    private void fill(LoanApplication a,CustomerProfile customer,long productId,long accountId,BigDecimal principal,int months,String purpose){
        if(accounts.countOwned(customer.getId(),List.of(accountId))!=1)throw access.missing();
        BankAccount account=accounts.lockById(accountId).orElseThrow(access::missing);activeOwned(account,customer.getId());
        LoanProduct product=products.share(productId).orElseThrow(access::missing);
        policy.eligibility(product,customer,principal,product.annualRate,months,customer.getDeclaredMonthlyIncome());
        a.productId=productId;a.accountId=accountId;a.productName=product.name;a.principal=principal.setScale(2);a.annualRate=product.annualRate;a.months=months;
        a.income=customer.getDeclaredMonthlyIncome();a.purpose=policy.notes(purpose);
    }
    public void activeOwned(BankAccount account,long customer){if(account.getCustomerId()!=customer)throw access.missing();if(account.getStatus()!=BankAccount.Status.ACTIVE||!"INR".equals(account.getCurrency()))throw new ApiException(HttpStatus.CONFLICT,"Use an owned ACTIVE INR account.");}
    private ApiException conflict(){return new ApiException(HttpStatus.CONFLICT,"The requested loan action is not allowed in the current state.");}
}
