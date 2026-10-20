package com.finnova.bank.loans;
import java.util.Set;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.banking.ListQuery;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.LoanDtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class LoanQueryService {
    private final LoanRepository loans;private final InstallmentRepository installments;private final PaymentRepository payments;private final LoanAccess access;
    public LoanQueryService(LoanRepository loans,InstallmentRepository installments,PaymentRepository payments,LoanAccess access){this.loans=loans;this.installments=installments;this.payments=payments;this.access=access;}
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #user==authentication.principal.id()")
    public PageView<LoanView> list(long user,int page,int size){
        Long customer=access.readActor(user)==Role.CUSTOMER?access.customer(user,false).getId():null;
        var query=ListQuery.of(page,size,"createdAt","DESC",Set.of("createdAt"));
        var result=loans.findAll((r,c,b)->customer==null?b.conjunction():b.equal(r.get("customerId"),customer),query.pageable());
        return new PageView<>(result.getContent().stream().map(LoanDtos::view).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"createdAt","DESC");
    }
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #user==authentication.principal.id()")public LoanView detail(long user,long id){return LoanDtos.view(readable(user,id));}
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #user==authentication.principal.id()")
    public PageView<InstallmentView> schedule(long user,long id,String status,int page,int size){
        readable(user,id);if(status!=null&&!Set.of("PENDING","PAID","OVERDUE").contains(status))throw new ApiException(HttpStatus.BAD_REQUEST,"Unsupported installment status.");
        var query=ListQuery.of(page,size,"number","ASC",Set.of("number"));
        var result=installments.findAll((r,c,b)->status==null?b.equal(r.get("loanId"),id):b.and(b.equal(r.get("loanId"),id),b.equal(r.get("status"),status)),query.pageable());
        return new PageView<>(result.getContent().stream().map(LoanDtos::view).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"number","ASC");
    }
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #user==authentication.principal.id()")
    public PageView<PaymentView> payments(long user,long id,int page,int size){
        readable(user,id);var query=ListQuery.of(page,size,"paidAt","DESC",Set.of("paidAt"));
        var result=payments.findAll((r,c,b)->b.equal(r.get("loanId"),id),query.pageable());
        return new PageView<>(result.getContent().stream().map(LoanDtos::view).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"paidAt","DESC");
    }
    private BankLoan readable(long user,long id){BankLoan loan=loans.findById(id).orElseThrow(access::missing);access.readable(user,loan.customerId);return loan;}
}
