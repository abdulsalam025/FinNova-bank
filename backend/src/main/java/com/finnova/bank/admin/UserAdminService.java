package com.finnova.bank.admin;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.*;
import java.util.stream.Collectors;
import com.finnova.bank.admin.AdminDtos.*;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.auth.repository.*;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.LoanPolicy;
import jakarta.persistence.criteria.Predicate;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class UserAdminService {
    private final UserRepository users;private final CustomerRepository customers;private final SettingRepository settings;
    private final BankingAccess access;private final AuditService audit;private final Clock clock;private final LoanPolicy notes;
    public UserAdminService(UserRepository users,CustomerRepository customers,SettingRepository settings,BankingAccess access,AuditService audit,Clock clock,LoanPolicy notes){this.users=users;this.customers=customers;this.settings=settings;this.access=access;this.audit=audit;this.clock=clock;this.notes=notes;}
    @Transactional(readOnly=true)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public PageView<UserView> list(long actor,String q,Role role,Boolean enabled,int page,int size,String sortBy,String direction){
        access.actor(actor);String search=ListQuery.search(q);var query=ListQuery.of(page,size,sortBy,direction,Set.of("id","createdAt","fullName","email","role","enabled"));
        var result=users.findAll((r,c,b)->{List<Predicate> p=new ArrayList<>();if(role!=null)p.add(b.equal(r.get("role"),role));if(enabled!=null)p.add(b.equal(r.get("enabled"),enabled));if(search!=null)p.add(b.or(b.like(b.lower(r.get("email")),ListQuery.like(search),'\\'),b.like(b.lower(r.get("fullName")),ListQuery.like(search),'\\')));return b.and(p.toArray(Predicate[]::new));},query.pageable());
        Map<Long,Long> ids=customers.findAllByUserIdIn(result.getContent().stream().map(BankUser::getId).toList()).stream().collect(Collectors.toMap(CustomerProfile::getUserId,CustomerProfile::getId));
        return new PageView<>(result.getContent().stream().map(u->view(u,ids.get(u.getId()))).toList(),page,size,result.getTotalElements(),result.getTotalPages(),sortBy,query.direction());
    }
    @Transactional(readOnly=true)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public UserView detail(long actor,long id){access.actor(actor);return view(users.findById(id).orElseThrow(this::missing),customer(id));}
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public UserView activate(long actor,long id,Activation request){
        String reason=notes.notes(request.reason());BankUser target=lock(actor,id);
        if(actor==id&&!request.active())throw conflict("You cannot deactivate your own administrator account.");
        if(target.isEnabled()==request.active())return view(target,customer(id));
        if(request.active()&&target.getPasswordHash()==null)throw invalid("Provision a BCrypt credential before activating this identity.");
        preserveAdmin(target,!request.active());boolean before=target.isEnabled();target.setEnabledByAdmin(request.active(),clock.instant());users.flush();
        audit.record(AuditActor.user(actor,Role.ADMIN),"USER_ACTIVATION_CHANGED","SUCCESS","USER",Long.toString(id),Map.of("before",before,"active",request.active(),"reason",reason,"sessionsRevoked",true));
        return view(target,customer(id));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public UserView role(long actor,long id,AssignRole request){
        String reason=notes.notes(request.reason());BankUser target=lock(actor,id);
        if(actor==id)throw conflict("Use another administrator to change your role or approval limit.");
        BigDecimal limit=request.approvalLimit();
        if(request.role()==Role.CUSTOMER){if(limit!=null)throw invalid("Customer approval limit must be null.");if(customer(id)==null)throw invalid("A real customer profile is required before assigning CUSTOMER.");}
        else if(limit==null||limit.signum()<=0||limit.scale()>2||limit.compareTo(TransferPolicy.MAX_MONEY)>0)throw invalid("Staff roles require a positive supported approval limit.");
        if(target.getRole()==request.role()&&Objects.equals(target.getApprovalLimit(),limit))return view(target,customer(id));
        preserveAdmin(target,request.role()!=Role.ADMIN);String before=target.getRole().name();target.assignRoleByAdmin(request.role(),limit==null?null:limit.setScale(2),clock.instant());users.flush();
        audit.record(AuditActor.user(actor,Role.ADMIN),"USER_ROLE_CHANGED","SUCCESS","USER",Long.toString(id),Map.of("before",before,"role",request.role().name(),"approvalLimit",limit==null?"NONE":limit.toPlainString(),"reason",reason,"sessionsRevoked",true));
        return view(target,customer(id));
    }
    private BankUser lock(long actor,long target){
        // Cross-admin commands serialize on a stable settings row BEFORE user locks.
        // Never hold actor SHARE then wait for this mutex: that would permit a cycle.
        settings.lockByKey("demo.synthetic_only").orElseThrow(()->new IllegalStateException("Admin metadata mutex missing"));
        long low=Math.min(actor,target),high=Math.max(actor,target);
        BankUser first=users.lockById(low).orElseThrow(this::missing);BankUser second=high==low?first:users.lockById(high).orElseThrow(this::missing);
        if(access.actor(actor)!=Role.ADMIN)throw new ApiException(HttpStatus.FORBIDDEN,"Administrator role required.");return target==low?first:second;
    }
    private void preserveAdmin(BankUser target,boolean removesAdmin){if(removesAdmin&&target.isEnabled()&&target.getRole()==Role.ADMIN&&users.countByRoleAndEnabled(Role.ADMIN,true)<=1)throw conflict("At least one active administrator must remain.");}
    private Long customer(long id){return customers.findByUserId(id).map(CustomerProfile::getId).orElse(null);}
    private UserView view(BankUser u,Long customer){return new UserView(u.getId(),u.getEmail(),u.getFullName(),u.getRole().name(),u.isEnabled(),u.getApprovalLimit(),customer,u.getCreatedAt(),u.getLastLoginAt(),u.getLockedUntil());}
    private ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"User not found.");}
    private ApiException invalid(String message){return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,message);}
    private ApiException conflict(String message){return new ApiException(HttpStatus.CONFLICT,message);}
}
