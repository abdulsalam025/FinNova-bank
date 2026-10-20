package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.finnova.bank.admin.AdminDtos.Activation;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.common.ApiException;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class ProductAdminService {
    // Separate create/update commands; no client-controlled id, active or version.
    public record Create(@NotBlank@Pattern(regexp="[A-Z0-9_]{2,30}")String code,@NotNull@jakarta.validation.Valid Terms terms,@NotBlank@Size(max=1000)String reason){}
    public record Update(@NotNull@jakarta.validation.Valid Terms terms,@NotBlank@Size(max=1000)String reason){}
    public record Terms(@NotBlank@Size(max=100)String name,@NotBlank@Size(max=1000)String description,
        @NotNull@DecimalMin("0.01")@Digits(integer=13,fraction=2)BigDecimal minPrincipal,
        @NotNull@DecimalMin("0.01")@Digits(integer=13,fraction=2)BigDecimal maxPrincipal,
        @NotNull@DecimalMin("0.00")@DecimalMax("100.00")@Digits(integer=3,fraction=2)BigDecimal annualRate,
        @NotNull@DecimalMin("0.00")@DecimalMax("100.00")@Digits(integer=3,fraction=2)BigDecimal minAnnualRate,
        @NotNull@DecimalMin("0.00")@DecimalMax("100.00")@Digits(integer=3,fraction=2)BigDecimal maxAnnualRate,
        @Min(1)@Max(600)int minTenureMonths,@Min(1)@Max(600)int maxTenureMonths,@Min(1)@Max(600)int tenureStepMonths,
        @Min(18)@Max(100)int minAge,@Min(18)@Max(100)int maxAge,
        @NotNull@DecimalMin("0.01")@Digits(integer=5,fraction=2)BigDecimal maxIncomeMultiplier){}
    public record View(LoanDtos.ProductView product,boolean active,long version,Instant createdAt,Instant updatedAt){}
    private final ProductRepository products;private final LoanAccess access;private final LoanPolicy notes;private final AuditService audit;private final Clock clock;
    public ProductAdminService(ProductRepository products,LoanAccess access,LoanPolicy notes,AuditService audit,Clock clock){this.products=products;this.access=access;this.notes=notes;this.audit=audit;this.clock=clock;}
    @Transactional(readOnly=true)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public PageView<View> list(long actor,Boolean active,String q,int page,int size){
        access.readActor(actor);String search=ListQuery.search(q);var query=ListQuery.of(page,size,"id","ASC",Set.of("id"));
        var result=products.findAll((r,c,b)->b.and(active==null?b.conjunction():b.equal(r.get("active"),active),search==null?b.conjunction():b.or(b.like(b.lower(r.get("name")),ListQuery.like(search),'\\'),b.like(b.lower(r.get("code")),ListQuery.like(search),'\\'))),query.pageable());
        return new PageView<>(result.getContent().stream().map(this::view).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"id","ASC");
    }
    @Transactional(readOnly=true)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")public View detail(long actor,long id){access.readActor(actor);return view(products.findById(id).orElseThrow(this::missing));}
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public View create(long actor,Create request){
        access.staff(actor);String reason=notes.notes(request.reason());if(request.code()==null||!request.code().matches("[A-Z0-9_]{2,30}"))throw invalid("Invalid product code.");
        LoanProduct product=new LoanProduct();product.code=request.code();product.active=true;product.createdAt=clock.instant();apply(product,request.terms());products.saveAndFlush(product);
        audit.record(AuditActor.user(actor,Role.ADMIN),"PRODUCT_CREATED","SUCCESS","LOAN_PRODUCT",product.id.toString(),Map.of("code",product.code,"reason",reason));return view(product);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public View update(long actor,long id,Update request){access.staff(actor);String reason=notes.notes(request.reason());LoanProduct product=products.lock(id).orElseThrow(this::missing);apply(product,request.terms());products.flush();audit.record(AuditActor.user(actor,Role.ADMIN),"PRODUCT_UPDATED","SUCCESS","LOAN_PRODUCT",Long.toString(id),Map.of("reason",reason));return view(product);}
    @Transactional(isolation=Isolation.READ_COMMITTED)@PreAuthorize("hasRole('ADMIN') and #actor==authentication.principal.id()")
    public View activate(long actor,long id,Activation request){access.staff(actor);String reason=notes.notes(request.reason());LoanProduct product=products.lock(id).orElseThrow(this::missing);if(product.active==request.active())return view(product);product.active=request.active();product.updatedAt=clock.instant();products.flush();audit.record(AuditActor.user(actor,Role.ADMIN),"PRODUCT_ACTIVATION_CHANGED","SUCCESS","LOAN_PRODUCT",Long.toString(id),Map.of("active",request.active(),"reason",reason,"softDelete",!request.active()));return view(product);}
    private void apply(LoanProduct p,Terms t){
        if(t==null||t.minPrincipal()==null||t.maxPrincipal()==null||t.annualRate()==null||t.minAnnualRate()==null||t.maxAnnualRate()==null||t.maxIncomeMultiplier()==null)throw invalid("All product terms are required.");
        if(t.minPrincipal().signum()<=0||t.maxPrincipal().compareTo(t.minPrincipal())<0||t.maxPrincipal().compareTo(TransferPolicy.MAX_MONEY)>0||t.minPrincipal().scale()>2||t.maxPrincipal().scale()>2
            ||t.minAnnualRate().signum()<0||t.maxAnnualRate().compareTo(new BigDecimal("100.00"))>0||t.annualRate().compareTo(t.minAnnualRate())<0||t.annualRate().compareTo(t.maxAnnualRate())>0
            ||t.minTenureMonths()<1||t.maxTenureMonths()>600||t.maxTenureMonths()<t.minTenureMonths()||t.tenureStepMonths()<1||(t.maxTenureMonths()-t.minTenureMonths())%t.tenureStepMonths()!=0
            ||t.minAge()<18||t.maxAge()>100||t.maxAge()<t.minAge()||t.maxIncomeMultiplier().signum()<=0)throw invalid("Product term ranges, rates or tenure step are inconsistent.");
        p.name=t.name().trim();p.description=t.description().trim();p.minPrincipal=t.minPrincipal().setScale(2);p.maxPrincipal=t.maxPrincipal().setScale(2);p.annualRate=t.annualRate().setScale(2);
        p.minAnnualRate=t.minAnnualRate().setScale(2);p.maxAnnualRate=t.maxAnnualRate().setScale(2);p.minTenure=t.minTenureMonths();p.maxTenure=t.maxTenureMonths();p.tenureStep=t.tenureStepMonths();p.minAge=t.minAge();p.maxAge=t.maxAge();p.incomeMultiplier=t.maxIncomeMultiplier().setScale(2);p.updatedAt=clock.instant();
    }
    private View view(LoanProduct p){return new View(LoanDtos.view(p),p.active,p.version,p.createdAt,p.updatedAt);}
    private ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"Loan product not found.");}
    private ApiException invalid(String message){return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,message);}
}
