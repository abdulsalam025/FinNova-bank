package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.*;
import com.finnova.bank.auth.domain.CustomerProfile;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
@Component
public class LoanPolicy {
    private final Clock clock;
    public LoanPolicy(Clock clock){this.clock=clock;}
    public void product(LoanProduct p,BigDecimal principal,BigDecimal rate,int months){
        if(!p.active)throw invalid("Loan product is inactive.");
        if(principal==null||principal.signum()<=0||principal.scale()>2||principal.compareTo(p.minPrincipal)<0||principal.compareTo(p.maxPrincipal)>0)throw invalid("Principal is outside product limits.");
        if(rate==null||rate.scale()>2||rate.signum()<0||rate.compareTo(p.minAnnualRate)<0||rate.compareTo(p.maxAnnualRate)>0)throw invalid("Rate is outside product limits.");
        if(months<p.minTenure||months>p.maxTenure||(months-p.minTenure)%p.tenureStep!=0||months>600)throw invalid("Tenure is not allowed by this product.");
    }
    public void eligibility(LoanProduct p,CustomerProfile customer,BigDecimal principal,BigDecimal rate,int months,BigDecimal income){
        product(p,principal,rate,months);
        int age=Period.between(customer.getDateOfBirth(),LocalDate.now(clock.withZone(ZoneId.of("Asia/Kolkata")))).getYears();
        if(age<p.minAge||age>p.maxAge)throw invalid("Age is outside the visible product limits.");
        if(income==null||income.signum()<=0||principal.compareTo(income.multiply(p.incomeMultiplier))>0)throw invalid("Principal exceeds the declared monthly-income multiplier limit.");
    }
    public String notes(String value){if(value==null||value.trim().isEmpty()||value.trim().length()>1000||value.chars().anyMatch(Character::isISOControl))throw new ApiException(HttpStatus.BAD_REQUEST,"A reason/notes of 1..1000 characters without control characters is required.");return value.trim();}
    private ApiException invalid(String message){return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,message);}
}
