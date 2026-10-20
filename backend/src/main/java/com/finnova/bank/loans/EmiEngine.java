package com.finnova.bank.loans;
import java.math.*;
import java.time.LocalDate;
import java.util.*;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.banking.TransferPolicy;
import com.fasterxml.jackson.annotation.JsonFormat;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
@Component
public class EmiEngine {
    private static final MathContext MC=new MathContext(34,RoundingMode.HALF_UP);
    private static final BigDecimal ZERO=new BigDecimal("0.00");
    public record Row(int number,LocalDate dueDate,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal principal,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal interest,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal total,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal remaining){}
    public record Result(@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal emi,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal totalInterest,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal totalPayment,List<Row> schedule){}
    public Result calculate(BigDecimal principal,BigDecimal annualRate,int months,LocalDate firstDue){
        if(principal==null || principal.signum()<=0 || principal.scale()>2 || principal.compareTo(TransferPolicy.MAX_MONEY)>0
            || annualRate==null || annualRate.signum()<0 || annualRate.compareTo(new BigDecimal("100.00"))>0 || annualRate.scale()>2
            || months<1 || months>600 || firstDue==null)throw invalid("Use positive principal, rate 0..100 and 1..600 months, with at most two decimals.");
        principal=money(principal);
        BigDecimal rate=annualRate.divide(new BigDecimal("1200"),MC);
        BigDecimal exact;
        if(rate.signum()==0)exact=principal.divide(BigDecimal.valueOf(months),MC);
        else{
            BigDecimal factor=BigDecimal.ONE.add(rate,MC).pow(months,MC);
            exact=principal.multiply(rate,MC).multiply(factor,MC).divide(factor.subtract(BigDecimal.ONE,MC),MC);
        }
        BigDecimal emi=money(exact),balance=principal,interestSum=ZERO,paymentSum=ZERO;
        List<Row> rows=new ArrayList<>();
        for(int number=1;number<=months;number++){
            BigDecimal interest=money(balance.multiply(rate,MC));
            BigDecimal component=number==months?balance:money(emi.subtract(interest));
            if(component.signum()<0 || component.compareTo(balance)>0)throw invalid("This principal/rate/tenure cannot produce a valid cent-rounded schedule.");
            BigDecimal total=money(component.add(interest));
            if(total.signum()<=0 || total.compareTo(TransferPolicy.MAX_MONEY)>0)throw invalid("Every installment must be a positive supported cent amount; increase principal or shorten tenure.");
            balance=money(balance.subtract(component));
            interestSum=interestSum.add(interest);paymentSum=paymentSum.add(total);
            rows.add(new Row(number,firstDue.plusMonths(number-1L),component,interest,total,balance));
        }
        if(balance.signum()!=0)throw new IllegalStateException("Internal amortization mismatch");
        return new Result(emi,money(interestSum),money(paymentSum),List.copyOf(rows));
    }
    private BigDecimal money(BigDecimal value){return value.setScale(2,RoundingMode.HALF_UP);}
    private ApiException invalid(String message){return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,message);}
}
