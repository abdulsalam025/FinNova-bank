package com.finnova.bank.banking;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import com.finnova.bank.banking.BankingDtos.*;
import com.finnova.bank.common.ApiException;
import jakarta.persistence.criteria.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class TransactionService {
    private static final Set<String> TYPES=Set.of("OPENING_CREDIT","TRANSFER_DEBIT","TRANSFER_CREDIT","LOAN_DISBURSEMENT","LOAN_REPAYMENT","REVERSAL","ADJUSTMENT");
    private final LedgerRepository ledger;
    private final AccountRepository accounts;
    private final BankingAccess access;
    public TransactionService(LedgerRepository ledger,AccountRepository accounts,BankingAccess access){this.ledger=ledger;this.accounts=accounts;this.access=access;}
    @Transactional(readOnly=true)
    @PreAuthorize("hasAnyRole('CUSTOMER','ADMIN') and #userId==authentication.principal.id()")
    public PageView<TransactionView> list(long userId,Long customerId,Long accountId,String q,String type,String direction,
            LocalDate from,LocalDate to,BigDecimal minAmount,BigDecimal maxAmount,int page,int size,String sortBy,String sortDirection){
        var scope=access.readScope(userId,customerId);
        var query=ListQuery.of(page,size,sortBy,sortDirection,Set.of("id","createdAt","amount","direction","transactionType"));
        String search=ListQuery.search(q);
        String kind=enumFilter(type,TYPES,"transaction type");
        String flow=enumFilter(direction,Set.of("CREDIT","DEBIT"),"direction");
        if(accountId!=null){
            BankAccount account=accounts.findById(accountId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Account not found."));
            if(scope.customerId()!=null && !scope.customerId().equals(account.getCustomerId()))throw new ApiException(HttpStatus.NOT_FOUND,"Account not found.");
        }
        if((from!=null && (from.getYear()<1900 || from.getYear()>2100)) || (to!=null && (to.getYear()<1900 || to.getYear()>2100))
                || (from!=null && to!=null && from.isAfter(to)))throw new ApiException(HttpStatus.BAD_REQUEST,"Use a valid date range within 1900..2100.");
        for(BigDecimal amount:Arrays.asList(minAmount,maxAmount))if(amount!=null && (amount.signum()<0 || amount.scale()>2 || amount.compareTo(TransferPolicy.MAX_MONEY)>0))
            throw new ApiException(HttpStatus.BAD_REQUEST,"Amount filters must be nonnegative INR values with at most two decimal places.");
        if(minAmount!=null && maxAmount!=null && minAmount.compareTo(maxAmount)>0)throw new ApiException(HttpStatus.BAD_REQUEST,"Minimum amount exceeds maximum amount.");
        Instant start=from==null?null:from.atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant();
        Instant end=to==null?null:to.plusDays(1).atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant();
        var result=ledger.findAll((root,criteria,cb)->{
            List<Predicate> predicates=new ArrayList<>();
            if(scope.customerId()!=null){
                Subquery<Integer> owned=criteria.subquery(Integer.class);
                Root<BankAccount> account=owned.from(BankAccount.class);
                owned.select(cb.literal(1)).where(cb.equal(account.get("id"),root.get("accountId")),cb.equal(account.get("customerId"),scope.customerId()));
                predicates.add(cb.exists(owned));
            }
            if(accountId!=null)predicates.add(cb.equal(root.get("accountId"),accountId));
            if(kind!=null)predicates.add(cb.equal(root.get("transactionType"),kind));
            if(flow!=null)predicates.add(cb.equal(root.get("direction"),flow));
            if(start!=null)predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"),start));
            if(end!=null)predicates.add(cb.lessThan(root.get("createdAt"),end));
            if(minAmount!=null)predicates.add(cb.greaterThanOrEqualTo(root.get("amount"),minAmount));
            if(maxAmount!=null)predicates.add(cb.lessThanOrEqualTo(root.get("amount"),maxAmount));
            if(search!=null)predicates.add(cb.or(cb.like(cb.lower(root.get("description")),ListQuery.like(search),'\\'),cb.like(cb.lower(root.get("reference")),ListQuery.like(search),'\\')));
            return cb.and(predicates.toArray(Predicate[]::new));
        },query.pageable());
        // Batch account lookup: bounded page, no per-row lazy-loading/N+1 query.
        Set<Long> ids=result.getContent().stream().map(FinancialTransaction::getAccountId).collect(Collectors.toSet());
        Map<Long,BankAccount> accountMap=accounts.findAllById(ids).stream().collect(Collectors.toMap(BankAccount::getId,Function.identity()));
        List<TransactionView> items=result.getContent().stream().map(entry->new TransactionView(entry.getId(),entry.getAccountId(),
                accountMap.get(entry.getAccountId()).getAccountNumber(),entry.getCounterpartyAccountId(),entry.getReference(),entry.getDirection(),entry.getTransactionType(),
                entry.getAmount(),entry.getBalanceAfter(),entry.getDescription(),entry.getCreatedAt())).toList();
        return new PageView<>(items,page,size,result.getTotalElements(),result.getTotalPages(),sortBy,query.direction());
    }
    private String enumFilter(String value,Set<String> allowed,String name){
        if(value==null || value.isBlank())return null;
        String normalized=value.toUpperCase(Locale.ROOT);
        if(!allowed.contains(normalized))throw new ApiException(HttpStatus.BAD_REQUEST,"Unsupported "+name+" filter.");
        return normalized;
    }
}
