package com.finnova.bank.loans;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.banking.*;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.LoanDtos.LoanView;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class DisbursementService {
    private final LoanAccess access;private final ApplicationRepository applications;private final AccountRepository accounts;private final ProductRepository products;
    private final ApplicationService rules;private final LoanPolicy policy;private final EmiEngine engine;private final LoanRepository loans;private final InstallmentRepository installments;
    private final LoanTransitions transitions;private final LedgerRepository ledger;private final AuditService audit;private final Clock clock;
    public DisbursementService(LoanAccess access,ApplicationRepository applications,AccountRepository accounts,ProductRepository products,ApplicationService rules,
        LoanPolicy policy,EmiEngine engine,LoanRepository loans,InstallmentRepository installments,LoanTransitions transitions,LedgerRepository ledger,AuditService audit,Clock clock){
        this.access=access;this.applications=applications;this.accounts=accounts;this.products=products;this.rules=rules;this.policy=policy;this.engine=engine;
        this.loans=loans;this.installments=installments;this.transitions=transitions;this.ledger=ledger;this.audit=audit;this.clock=clock;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasAnyRole('LOAN_OFFICER','ADMIN') and #user==authentication.principal.id()")
    public LoanView disburse(long user,long id,String reason){
        BankUser actor=access.staff(user);String notes=policy.notes(reason);
        var locator=applications.locator(id).orElseThrow(access::missing);access.noSelfDecision(user,locator.getCustomerId());
        // Consistent financial order: actor SHARE -> account -> application -> loan -> installment.
        var account=accounts.lockById(locator.getAccountId()).orElseThrow(access::missing);
        LoanApplication a=applications.lock(id).orElseThrow(access::missing);LoanLifecycle.require(a.status,ApplicationStatus.DISBURSED,actor.getRole());
        rules.activeOwned(account,a.customerId);LoanProduct product=products.share(a.productId).orElseThrow(access::missing);
        policy.eligibility(product,access.owner(a.customerId),a.principal,a.annualRate,a.months,a.income);rules.approval(actor,a);
        var now=clock.instant().truncatedTo(ChronoUnit.MICROS);
        var schedule=engine.calculate(a.principal,a.annualRate,a.months,LocalDate.now(clock.withZone(ZoneId.of("Asia/Kolkata"))).plusMonths(1));
        var credited=account.getBalance().add(a.principal).setScale(2);
        if(credited.compareTo(TransferPolicy.MAX_MONEY)>0)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"Disbursement would exceed account capacity.");
        account.applyBalance(credited,now);accounts.flush();
        ledger.save(FinancialTransaction.loan(account.getId(),UUID.randomUUID().toString(),"LOAN_DISBURSEMENT",a.principal,credited,user,null,a.id,now));
        transitions.move(a,ApplicationStatus.DISBURSED,user,actor.getRole(),notes);
        BankLoan loan=new BankLoan();loan.applicationId=a.id;loan.customerId=a.customerId;loan.accountId=a.accountId;loan.principal=a.principal;loan.annualRate=a.annualRate;
        loan.months=a.months;loan.emi=schedule.emi();loan.outstanding=a.principal;loan.status="DISBURSED";loan.disbursedAt=now;loan.createdAt=now;loan.updatedAt=now;
        loans.saveAndFlush(loan);
        for(var row:schedule.schedule()){
            Installment installment=new Installment();installment.loanId=loan.id;installment.number=row.number();installment.dueDate=row.dueDate();installment.principal=row.principal();
            installment.interest=row.interest();installment.total=row.total();installment.remaining=row.remaining();installment.status="PENDING";installment.createdAt=now;installment.updatedAt=now;installments.save(installment);
        }
        installments.flush();loan.status="REPAYMENT";loan.updatedAt=now;
        transitions.move(a,ApplicationStatus.REPAYMENT,null,null,"System generated the cent-rounded amortization schedule.");
        audit.record(AuditActor.user(user,actor.getRole()),"LOAN_DISBURSED","SUCCESS","LOAN",loan.id.toString(),Map.of("amount",a.principal.toPlainString(),"synthetic",true));
        return LoanDtos.view(loan);
    }
}
