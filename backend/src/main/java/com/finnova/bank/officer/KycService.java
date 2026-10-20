package com.finnova.bank.officer;
import java.time.Clock;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.auth.repository.*;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.LoanPolicy;
import com.finnova.bank.officer.KycDtos.*;
import jakarta.persistence.criteria.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class KycService {
    private final KycRepository kyc;private final CustomerRepository customers;private final UserRepository users;private final BankingAccess access;private final LoanPolicy notes;private final AuditService audit;private final Clock clock;
    public KycService(KycRepository kyc,CustomerRepository customers,UserRepository users,BankingAccess access,LoanPolicy notes,AuditService audit,Clock clock){this.kyc=kyc;this.customers=customers;this.users=users;this.access=access;this.notes=notes;this.audit=audit;this.clock=clock;}
    @Transactional(readOnly=true)@PreAuthorize("hasAnyRole('LOAN_OFFICER','ADMIN') and #actor==authentication.principal.id()")
    public PageView<View> list(long actor,String status,String q,int page,int size){
        access.actor(actor);if(status!=null&&!Set.of("PENDING","VERIFIED","REJECTED").contains(status))throw new ApiException(HttpStatus.BAD_REQUEST,"Unsupported KYC status.");
        String search=ListQuery.search(q);var query=ListQuery.of(page,size,"createdAt","ASC",Set.of("createdAt"));
        var result=kyc.findAll((r,c,b)->{
            List<Predicate> p=new ArrayList<>();if(status!=null)p.add(b.equal(r.get("status"),status));
            if(search!=null){Subquery<Integer> sub=c.subquery(Integer.class);Root<CustomerProfile> cp=sub.from(CustomerProfile.class);Root<BankUser> u=sub.from(BankUser.class);
                sub.select(b.literal(1)).where(b.equal(cp.get("id"),r.get("customerId")),b.equal(cp.get("userId"),u.get("id")),b.or(b.like(b.lower(u.get("email")),ListQuery.like(search),'\\'),b.like(b.lower(u.get("fullName")),ListQuery.like(search),'\\')));p.add(b.exists(sub));}
            return b.and(p.toArray(Predicate[]::new));
        },query.pageable());
        Map<Long,CustomerProfile> profiles=customers.findAllById(result.getContent().stream().map(KycRecord::getCustomerId).toList()).stream().collect(Collectors.toMap(CustomerProfile::getId,Function.identity()));
        Map<Long,BankUser> identities=users.findAllById(profiles.values().stream().map(CustomerProfile::getUserId).toList()).stream().collect(Collectors.toMap(BankUser::getId,Function.identity()));
        return new PageView<>(result.getContent().stream().map(k->view(k,identities.get(profiles.get(k.getCustomerId()).getUserId()))).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"createdAt","ASC");
    }
    @Transactional(readOnly=true)@PreAuthorize("hasAnyRole('LOAN_OFFICER','ADMIN') and #actor==authentication.principal.id()")
    public View detail(long actor,long id){access.actor(actor);KycRecord row=kyc.findById(id).orElseThrow(this::missing);return view(row,users.findById(owner(row.getCustomerId())).orElseThrow(this::missing));}
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('LOAN_OFFICER') and #actor==authentication.principal.id()")
    public View review(long actor,long id,Review request){
        long customer=kyc.customerFor(id).orElseThrow(this::missing),owner=owner(customer);if(actor==owner)throw new ApiException(HttpStatus.FORBIDDEN,"You cannot review your own KYC.");
        lockUsers(actor,owner);access.actor(actor);BankUser subject=users.findById(owner).orElseThrow(this::missing);
        if(!subject.isEnabled()||subject.getRole()!=Role.CUSTOMER)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"The KYC subject must be an active Customer.");
        String reason=notes.notes(request.reason());KycRecord row=kyc.lockById(id).orElseThrow(this::missing);
        if(!"PENDING".equals(row.getStatus()))throw new ApiException(HttpStatus.CONFLICT,"Only pending KYC can be decided.");
        row.decide(request.decision().name(),actor,reason,clock.instant());kyc.flush();
        audit.record(AuditActor.user(actor,Role.LOAN_OFFICER),"KYC_DECISION","SUCCESS","KYC_RECORD",Long.toString(id),Map.of("decision",request.decision().name(),"reason",reason,"synthetic",true));return view(row,subject);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('CUSTOMER') and #actor==authentication.principal.id()")
    public Map<String,Object> resubmit(long actor,String reason){
        users.shareById(actor).orElseThrow(this::missing);long customer=access.customer(actor);
        KycRecord row=kyc.lockByCustomer(customer).orElseThrow(this::missing);
        if(!"REJECTED".equals(row.getStatus()))throw new ApiException(HttpStatus.CONFLICT,"Only rejected KYC can be resubmitted.");
        String note=notes.notes(reason);row.resubmit(note,clock.instant());kyc.flush();
        audit.record(AuditActor.user(actor,Role.CUSTOMER),"KYC_RESUBMITTED","SUCCESS","KYC_RECORD",row.getId().toString(),Map.of("reason",note));return Map.of("id",row.getId(),"status",row.getStatus());
    }
    private void lockUsers(long a,long b){users.shareById(Math.min(a,b)).orElseThrow(this::missing);if(a!=b)users.shareById(Math.max(a,b)).orElseThrow(this::missing);}
    private long owner(long customer){return customers.findById(customer).orElseThrow(this::missing).getUserId();}
    @Transactional(readOnly=true)@PreAuthorize("hasRole('CUSTOMER') and #actor==authentication.principal.id()")
    public View own(long actor){long customer=access.customer(actor);return view(kyc.findByCustomerId(customer).orElseThrow(this::missing),users.findById(actor).orElseThrow(this::missing));}
    private View view(KycRecord k,BankUser u){return new View(k.getId(),k.getCustomerId(),u.getEmail(),u.getFullName(),u.getRole().name(),u.isEnabled(),k.getDocumentType(),k.getDocumentReference(),k.getStatus(),k.getReviewedBy(),k.getReviewedAt(),k.getReviewNotes(),k.getCreatedAt());}
    private ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"KYC resource not found.");}
}
