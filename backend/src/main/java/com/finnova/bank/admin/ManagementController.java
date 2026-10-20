package com.finnova.bank.admin;
import java.time.LocalDate;
import com.finnova.bank.admin.AdminDtos.*;
import com.finnova.bank.audit.AuditQueryService;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.loans.ProductAdminService;
import com.finnova.bank.officer.*;
import com.finnova.bank.reports.*;
import com.finnova.bank.reports.ReportDtos.*;
import com.finnova.bank.security.BankPrincipal;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController@RequestMapping("/api")
public class ManagementController {
    private final UserAdminService users;private final ProductAdminService products;private final KycService kyc;private final AuditQueryService audit;private final DecisionService decisions;private final ReportService reports;
    public ManagementController(UserAdminService users,ProductAdminService products,KycService kyc,AuditQueryService audit,DecisionService decisions,ReportService reports){this.users=users;this.products=products;this.kyc=kyc;this.audit=audit;this.decisions=decisions;this.reports=reports;}
    @GetMapping("/admin/users")public PageView<UserView> users(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)String q,@RequestParam(required=false)Role role,@RequestParam(required=false)Boolean enabled,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size,@RequestParam(defaultValue="createdAt")String sortBy,@RequestParam(defaultValue="DESC")String sortDirection){return users.list(actor.id(),q,role,enabled,page,size,sortBy,sortDirection);}
    @GetMapping("/admin/users/{id}")public UserView user(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id){return users.detail(actor.id(),id);}
    @PutMapping("/admin/users/{id}/activation")public UserView activate(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id,@Valid@RequestBody Activation body){return users.activate(actor.id(),id,body);}
    @PutMapping("/admin/users/{id}/role")public UserView role(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id,@Valid@RequestBody AssignRole body){return users.role(actor.id(),id,body);}
    @GetMapping("/admin/loan-products")public PageView<ProductAdminService.View> products(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)Boolean active,@RequestParam(required=false)String q,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return products.list(actor.id(),active,q,page,size);}
    @GetMapping("/admin/loan-products/{id}")public ProductAdminService.View product(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id){return products.detail(actor.id(),id);}
    @PostMapping("/admin/loan-products")@ResponseStatus(HttpStatus.CREATED)public ProductAdminService.View product(@AuthenticationPrincipal BankPrincipal actor,@Valid@RequestBody ProductAdminService.Create body){return products.create(actor.id(),body);}
    @PutMapping("/admin/loan-products/{id}")public ProductAdminService.View product(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id,@Valid@RequestBody ProductAdminService.Update body){return products.update(actor.id(),id,body);}
    @PutMapping("/admin/loan-products/{id}/activation")public ProductAdminService.View productActive(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id,@Valid@RequestBody Activation body){return products.activate(actor.id(),id,body);}
    @GetMapping("/officer/kyc")public PageView<KycDtos.View> kyc(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)String status,@RequestParam(required=false)String q,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return kyc.list(actor.id(),status,q,page,size);}
    @GetMapping("/officer/kyc/{id}")public KycDtos.View kyc(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id){return kyc.detail(actor.id(),id);}
    @PostMapping("/officer/kyc/{id}/decision")public KycDtos.View review(@AuthenticationPrincipal BankPrincipal actor,@PathVariable long id,@Valid@RequestBody KycDtos.Review body){return kyc.review(actor.id(),id,body);}
    @GetMapping("/kyc")public KycDtos.View ownKyc(@AuthenticationPrincipal BankPrincipal actor){return kyc.own(actor.id());}
    @PostMapping("/kyc/resubmit")public java.util.Map<String,Object> resubmit(@AuthenticationPrincipal BankPrincipal actor,@Valid@RequestBody KycDtos.Resubmit body){return kyc.resubmit(actor.id(),body.reason());}
    @GetMapping("/audit-logs")public PageView<AuditQueryService.View> audit(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)Long actorId,@RequestParam(required=false)String eventType,@RequestParam(required=false)String outcome,@RequestParam(required=false)String q,
        @RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate from,@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate to,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return audit.search(actor.id(),actorId,eventType,outcome,q,from,to,page,size);}
    @GetMapping("/officer/decisions")public PageView<DecisionService.View> ownDecisions(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)String decision,
        @RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate from,@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate to,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return decisions.list(actor.id(),false,decision,from,to,page,size);}
    @GetMapping("/admin/decisions")public PageView<DecisionService.View> allDecisions(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)String decision,
        @RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate from,@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate to,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return decisions.list(actor.id(),true,decision,from,to,page,size);}
    @GetMapping("/dashboard")public Dashboard dashboard(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate from,@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate to){return reports.dashboard(actor.id(),from,to);}
    @GetMapping("/reports/product-performance")public PageView<Performance> performance(@AuthenticationPrincipal BankPrincipal actor,@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate from,@RequestParam(required=false)@DateTimeFormat(iso=DateTimeFormat.ISO.DATE)LocalDate to,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return reports.performance(actor.id(),from,to,page,size);}
}
