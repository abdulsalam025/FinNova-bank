package com.finnova.bank.banking;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.finnova.bank.audit.*;
import com.finnova.bank.banking.BankingDtos.*;
import com.finnova.bank.common.ApiException;
import jakarta.persistence.criteria.Predicate;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class AccountService {
    private final AccountRepository accounts;
    private final BankingAccess access;
    private final AuditService audit;
    private final Clock clock;
    public AccountService(AccountRepository accounts,BankingAccess access,AuditService audit,Clock clock){
        this.accounts=accounts;this.access=access;this.audit=audit;this.clock=clock;
    }
    @Transactional(readOnly=true)
    @PreAuthorize("hasAnyRole('CUSTOMER','ADMIN') and #userId==authentication.principal.id()")
    public PageView<AccountView> list(long userId,Long customerId,BankAccount.Status status,String q,int page,int size,String sortBy,String direction){
        var scope=access.readScope(userId,customerId);
        var query=ListQuery.of(page,size,sortBy,direction,Set.of("id","createdAt","balance","nickname","accountNumber"));
        String search=ListQuery.search(q);
        var result=accounts.findAll((root,criteria,cb)->{
            List<Predicate> predicates=new ArrayList<>();
            if(scope.customerId()!=null)predicates.add(cb.equal(root.get("customerId"),scope.customerId()));
            if(status!=null)predicates.add(cb.equal(root.get("status"),status));
            if(search!=null)predicates.add(cb.or(cb.like(cb.lower(root.get("nickname")),ListQuery.like(search),'\\'),
                    cb.like(cb.lower(root.get("accountNumber")),ListQuery.like(search),'\\')));
            return cb.and(predicates.toArray(Predicate[]::new));
        },query.pageable());
        return new PageView<>(result.getContent().stream().map(this::view).toList(),page,size,result.getTotalElements(),result.getTotalPages(),sortBy,query.direction());
    }
    @Transactional(readOnly=true)
    @PreAuthorize("hasAnyRole('CUSTOMER','ADMIN') and #userId==authentication.principal.id()")
    public AccountView detail(long userId,long id){
        var scope=access.readScope(userId,null);
        BankAccount account=accounts.findById(id).orElseThrow(this::missing);
        if(scope.customerId()!=null && !scope.customerId().equals(account.getCustomerId()))throw missing();
        return view(account);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    @PreAuthorize("hasRole('CUSTOMER') and #userId==authentication.principal.id()")
    public AccountView open(long userId,OpenAccountRequest request){
        long customer=access.customer(userId);
        String nickname=nickname(request.nickname());
        if(request.accountType()==null)throw new ApiException(HttpStatus.BAD_REQUEST,"An account type is required.");
        var now=clock.instant().truncatedTo(ChronoUnit.MICROS);
        BankAccount account=accounts.saveAndFlush(new BankAccount(customer,nickname,request.accountType(),now));
        audit.record(AuditActor.user(userId,com.finnova.bank.auth.domain.Role.CUSTOMER),"ACCOUNT_OPENED","SUCCESS","ACCOUNT",account.getId().toString(),Map.of("currency","INR","initialBalance","0.00","synthetic",true));
        return view(account);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    @PreAuthorize("hasRole('CUSTOMER') and #userId==authentication.principal.id()")
    public AccountView rename(long userId,long id,RenameAccountRequest request){
        long customer=access.customer(userId);
        if(accounts.countOwned(customer,List.of(id))!=1)throw missing();
        BankAccount account=accounts.lockById(id).orElseThrow(this::missing);
        if(account.getStatus()==BankAccount.Status.CLOSED)throw new ApiException(HttpStatus.CONFLICT,"Closed accounts cannot be renamed.");
        account.rename(nickname(request.nickname()),clock.instant());
        audit.record(AuditActor.user(userId,com.finnova.bank.auth.domain.Role.CUSTOMER),"ACCOUNT_RENAMED","SUCCESS","ACCOUNT",Long.toString(id),Map.of());
        return view(account);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    @PreAuthorize("hasRole('CUSTOMER') and #userId==authentication.principal.id()")
    public AccountView close(long userId,long id){
        long customer=access.customer(userId);
        if(accounts.countOwned(customer,List.of(id))!=1)throw missing();
        BankAccount account=accounts.lockById(id).orElseThrow(this::missing);
        if(account.getStatus()==BankAccount.Status.CLOSED)return view(account);
        if(account.getBalance().signum()!=0)throw new ApiException(HttpStatus.CONFLICT,"Move the remaining simulated balance before closing this account.");
        if(accounts.activeApplications(id)>0 || accounts.activeLoans(id)>0)throw new ApiException(HttpStatus.CONFLICT,"An active application or loan still references this account.");
        account.close(clock.instant());
        audit.record(AuditActor.user(userId,com.finnova.bank.auth.domain.Role.CUSTOMER),"ACCOUNT_CLOSED","SUCCESS","ACCOUNT",Long.toString(id),Map.of("softDelete",true));
        return view(account);
    }
    public AccountView view(BankAccount account){
        return new AccountView(account.getId(),account.getCustomerId(),account.getAccountNumber(),account.getNickname(),account.getAccountType().name(),
                account.getCurrency(),account.getBalance(),account.getStatus().name(),account.getCreatedAt(),account.getClosedAt());
    }
    private String nickname(String value){
        if(value==null || value.trim().length()<2 || value.trim().length()>60 || value.chars().anyMatch(Character::isISOControl))
            throw new ApiException(HttpStatus.BAD_REQUEST,"Use a nickname of 2..60 characters without control characters.");
        return value.trim();
    }
    private ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"Account not found.");}
}
