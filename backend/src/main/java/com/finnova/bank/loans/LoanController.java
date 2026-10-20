package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.loans.LoanDtos.*;
import com.finnova.bank.security.BankPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController@RequestMapping("/api")
public class LoanController {
    private final ProductService products;private final ApplicationService applications;private final DisbursementService disbursement;
    private final LoanQueryService loans;private final RepaymentService repayments;private final OverdueService overdue;
    public LoanController(ProductService products,ApplicationService applications,DisbursementService disbursement,LoanQueryService loans,RepaymentService repayments,OverdueService overdue){this.products=products;this.applications=applications;this.disbursement=disbursement;this.loans=loans;this.repayments=repayments;this.overdue=overdue;}
    @GetMapping("/loan-products")public PageView<ProductView> products(@RequestParam(required=false)String q,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return products.list(q,page,size);}
    @GetMapping("/loan-products/compare")public List<Quote> compare(@RequestParam List<Long> ids,@RequestParam BigDecimal principal,@RequestParam int months){return products.compare(ids,principal,months);}
    @GetMapping("/loan-products/{id}")public ProductView product(@PathVariable long id){return products.detail(id);}
    @GetMapping("/loan-products/{id}/quote")public Quote quote(@PathVariable long id,@RequestParam BigDecimal principal,@RequestParam int months,@RequestParam(required=false)BigDecimal annualRate){return products.quote(id,principal,months,annualRate);}
    @PostMapping("/loan-applications")@ResponseStatus(HttpStatus.CREATED)public ApplicationView create(@AuthenticationPrincipal BankPrincipal user,@Valid@RequestBody CreateApplication body){return applications.create(user.id(),body);}
    @GetMapping("/loan-applications")public PageView<ApplicationView> applications(@AuthenticationPrincipal BankPrincipal user,@RequestParam(required=false)ApplicationStatus status,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return applications.list(user.id(),status,page,size);}
    @GetMapping("/loan-applications/{id}")public ApplicationView application(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id){return applications.detail(user.id(),id);}
    @PutMapping("/loan-applications/{id}")public ApplicationView update(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@Valid@RequestBody UpdateDraft body){return applications.update(user.id(),id,body);}
    @DeleteMapping("/loan-applications/{id}")@ResponseStatus(HttpStatus.NO_CONTENT)public void delete(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id){applications.deleteDraft(user.id(),id);}
    @PostMapping("/loan-applications/{id}/submit")public ApplicationView submit(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id){return applications.submit(user.id(),id);}
    @PostMapping("/loan-applications/{id}/resubmit")public ApplicationView resubmit(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@Valid@RequestBody Notes body){return applications.resubmit(user.id(),id,body.reason());}
    @PostMapping("/loan-applications/{id}/{action:review|request-info|approve|reject}")public ApplicationView staff(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@PathVariable String action,@Valid@RequestBody Notes body){return applications.staffAction(user.id(),id,action,body.reason());}
    @PostMapping("/loan-applications/{id}/disburse")public LoanView disburse(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@Valid@RequestBody Notes body){return disbursement.disburse(user.id(),id,body.reason());}
    @GetMapping("/loan-applications/{id}/history")public PageView<HistoryView> history(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return applications.history(user.id(),id,page,size);}
    @GetMapping("/loans")public PageView<LoanView> loans(@AuthenticationPrincipal BankPrincipal user,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return loans.list(user.id(),page,size);}
    @GetMapping("/loans/{id}")public LoanView loan(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id){return loans.detail(user.id(),id);}
    @GetMapping("/loans/{id}/installments")public PageView<InstallmentView> schedule(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@RequestParam(required=false)String status,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return loans.schedule(user.id(),id,status,page,size);}
    @GetMapping("/loans/{id}/payments")public PageView<PaymentView> payments(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return loans.payments(user.id(),id,page,size);}
    @PostMapping("/loans/{id}/installments/{installment}/pay")public ResponseEntity<JsonNode> repay(@AuthenticationPrincipal BankPrincipal user,@PathVariable long id,@PathVariable long installment,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid@RequestBody RepayRequest body){var result=repayments.repay(user.id(),id,installment,key,body);return ResponseEntity.status(result.status()).header("Idempotency-Replayed",Boolean.toString(result.replayed())).body(result.body());}
    @PutMapping("/loans/demo-date")public Map<String,Object> date(@AuthenticationPrincipal BankPrincipal user,@RequestBody DemoDate body){return overdue.setDate(user.id(),body.date());}
    @PostMapping("/loans/overdue-scan")public Map<String,Object> scan(@AuthenticationPrincipal BankPrincipal user){return overdue.manual(user.id());}
}
