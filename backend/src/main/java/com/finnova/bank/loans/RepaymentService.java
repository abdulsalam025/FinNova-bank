package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.IdempotentReply;
import com.finnova.bank.common.*;
import com.finnova.bank.loans.LoanDtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class RepaymentService {
    private final LoanAccess access;private final IdempotencyService idempotency;private final TransferPolicy keys;private final LoanRepository loans;
    private final ApplicationRepository applications;private final InstallmentRepository installments;private final AccountRepository accounts;
    private final LedgerRepository ledger;private final PaymentRepository payments;private final LoanTransitions transitions;private final AuditService audit;private final ObjectMapper mapper;private final Clock clock;
    public RepaymentService(LoanAccess access,IdempotencyService idempotency,TransferPolicy keys,LoanRepository loans,ApplicationRepository applications,
        InstallmentRepository installments,AccountRepository accounts,LedgerRepository ledger,PaymentRepository payments,LoanTransitions transitions,AuditService audit,ObjectMapper mapper,Clock clock){
        this.access=access;this.idempotency=idempotency;this.keys=keys;this.loans=loans;this.applications=applications;this.installments=installments;this.accounts=accounts;
        this.ledger=ledger;this.payments=payments;this.transitions=transitions;this.audit=audit;this.mapper=mapper;this.clock=clock;
    }
    private record Prepared(BankAccount account,LoanApplication application,BankLoan loan,Installment installment,BigDecimal after,BigDecimal outstanding){}
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('CUSTOMER') and #user==authentication.principal.id()")
    public IdempotentReply repay(long user,long loanId,long installmentId,String key,RepayRequest request){
        keys.key(key);if(loanId<=0||installmentId<=0||request==null||request.accountId()==null||request.accountId()<=0)throw new ApiException(HttpStatus.BAD_REQUEST,"Positive loan, installment and account IDs are required.");
        String fingerprint;
        try{fingerprint=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(("REPAYMENT:v1:"+loanId+":"+installmentId+":"+request.accountId()).getBytes(StandardCharsets.UTF_8)));}
        catch(NoSuchAlgorithmException ex){throw new IllegalStateException("Required SHA-256 unavailable");}
        var reservation=idempotency.reserve(user,"REPAYMENT",key,fingerprint);
        long customer=access.customer(user,false).getId(); // FK reservation already holds the actor's SHARE lock.
        if(reservation.completed())return idempotency.replay(reservation);
        Prepared prepared;
        try{
            var locator=loans.locator(loanId).filter(l->l.getCustomerId()==customer).orElseThrow(access::missing);
            if(accounts.countOwned(customer,List.of(request.accountId()))!=1)throw access.missing();
            BankAccount account=accounts.lockById(request.accountId()).orElseThrow(access::missing);
            LoanApplication application=applications.lock(locator.getApplicationId()).orElseThrow(access::missing);
            BankLoan loan=loans.lock(loanId).orElseThrow(access::missing);
            Installment installment=installments.lock(installmentId,loanId).orElseThrow(access::missing);
            if(!"REPAYMENT".equals(loan.status)||application.status!=ApplicationStatus.REPAYMENT||"PAID".equals(installment.status))throw new ApiException(HttpStatus.CONFLICT,"This installment cannot be paid in the current state.");
            if(installments.earlierUnpaid(loanId,installment.number)>0)throw new ApiException(HttpStatus.CONFLICT,"Pay the earliest unpaid installment first.");
            if(account.getStatus()!=BankAccount.Status.ACTIVE||!"INR".equals(account.getCurrency()))throw new ApiException(HttpStatus.CONFLICT,"Use an owned ACTIVE INR account.");
            if(loan.outstanding.compareTo(installments.unpaidPrincipal(loanId))!=0)throw new IllegalStateException("Loan outstanding/schedule invariant failed");
            if(account.getBalance().compareTo(installment.total)<0)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"Insufficient simulated balance for this full installment.");
            BigDecimal outstanding=loan.outstanding.subtract(installment.principal).setScale(2);
            if(outstanding.signum()<0)throw new IllegalStateException("Negative internal outstanding principal");
            prepared=new Prepared(account,application,loan,installment,account.getBalance().subtract(installment.total).setScale(2),outstanding);
        }catch(ApiException expected){
            audit.record(AuditActor.user(user,Role.CUSTOMER),"REPAYMENT_REJECTED","FAILURE","LOAN",Long.toString(loanId),Map.of("reason",expected.getMessage()));
            ApiError error=new ApiError(clock.instant(),expected.status().value(),expected.status().getReasonPhrase(),expected.getMessage(),"/api/loans/"+loanId+"/installments/"+installmentId+"/pay",List.of());
            return idempotency.complete(reservation,expected.status().value(),mapper.valueToTree(error));
        }
        var now=clock.instant().truncatedTo(ChronoUnit.MICROS);String reference=UUID.randomUUID().toString();
        prepared.account().applyBalance(prepared.after(),now);prepared.loan().outstanding=prepared.outstanding();prepared.loan().updatedAt=now;
        prepared.installment().status="PAID";prepared.installment().paidAt=now;prepared.installment().updatedAt=now;
        if(prepared.outstanding().signum()==0){
            prepared.loan().status="CLOSED";prepared.loan().closedAt=now;
            transitions.move(prepared.application(),ApplicationStatus.CLOSED,null,null,"System closed loan at exactly zero outstanding principal.");
            audit.record(AuditActor.system(),"LOAN_CLOSED","SUCCESS","LOAN",Long.toString(loanId),Map.of());
        }
        accounts.flush(); // Real account/loan/installment SQL before fault-injected payment write.
        FinancialTransaction entry=ledger.save(FinancialTransaction.loan(prepared.account().getId(),reference,"LOAN_REPAYMENT",prepared.installment().total,prepared.after(),user,reservation.getId(),prepared.application().id,now));
        LoanPayment payment=new LoanPayment();payment.loanId=loanId;payment.installmentId=installmentId;payment.accountId=prepared.account().getId();payment.transactionId=entry.getId();payment.keyId=reservation.getId();
        payment.reference=reference;payment.amount=prepared.installment().total;payment.principal=prepared.installment().principal;payment.interest=prepared.installment().interest;payment.paidAt=now;payment.createdAt=now;payment.updatedAt=now;
        payments.save(payment);
        audit.record(AuditActor.user(user,Role.CUSTOMER),"REPAYMENT","SUCCESS","LOAN",Long.toString(loanId),Map.of("reference",reference,"amount",payment.amount.toPlainString(),"synthetic",true));
        return idempotency.complete(reservation,201,mapper.valueToTree(new RepaymentView(LoanDtos.view(payment),prepared.outstanding(),prepared.after(),prepared.loan().status,true)));
    }
}
