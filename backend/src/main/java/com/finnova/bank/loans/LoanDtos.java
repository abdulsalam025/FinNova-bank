package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.*;
public final class LoanDtos {
    private LoanDtos(){}
    public record CreateApplication(@NotNull@Positive Long productId,@NotNull@Positive Long accountId,
        @NotNull@DecimalMin("0.01")@Digits(integer=13,fraction=2)BigDecimal principal,
        @Min(1)@Max(600)int months,@NotBlank@Size(max=1000)String purpose){}
    public record UpdateDraft(@NotNull@Positive Long productId,@NotNull@Positive Long accountId,
        @NotNull@DecimalMin("0.01")@Digits(integer=13,fraction=2)BigDecimal principal,
        @Min(1)@Max(600)int months,@NotBlank@Size(max=1000)String purpose){}
    public record Notes(@NotBlank@Size(max=1000)String reason){}
    public record RepayRequest(@NotNull@Positive Long accountId){}
    public record DemoDate(LocalDate date){}
    public record ProductView(long id,String code,String name,String description,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal minPrincipal,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal maxPrincipal,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal annualRate,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal minAnnualRate,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal maxAnnualRate,int minTenureMonths,int maxTenureMonths,int tenureStepMonths,
        int minAge,int maxAge,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal maxIncomeMultiplier){}
    public record Quote(ProductView product,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal principal,int months,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal annualRate,EmiEngine.Result calculation){}
    public record ApplicationView(long id,long customerId,long productId,long accountId,String productName,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal principal,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal annualRate,int months,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal declaredMonthlyIncome,String purpose,String customerNotes,String status,
        Long assignedOfficerId,Long approvedBy,String decisionReason,String additionalInfoRequest,Instant createdAt,Instant submittedAt,Instant approvedAt){}
    public record HistoryView(long id,String fromStatus,String toStatus,String actorType,Long actorId,String actorRole,String notes,Instant occurredAt){}
    public record LoanView(long id,long applicationId,long customerId,long accountId,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal principal,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal annualRate,int months,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal emi,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal outstandingPrincipal,
        String status,Instant disbursedAt,Instant closedAt){}
    public record InstallmentView(long id,long loanId,int number,LocalDate dueDate,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal principal,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal interest,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal total,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal remainingBalance,String status,Instant paidAt){}
    public record PaymentView(long id,long loanId,long installmentId,long accountId,String reference,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal amount,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal principal,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal interest,Instant paidAt){}
    public record RepaymentView(PaymentView payment,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal outstandingPrincipal,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal accountBalance,String loanStatus,boolean simulated){}
    public static ProductView view(LoanProduct p){return new ProductView(p.id,p.code,p.name,p.description,p.minPrincipal,p.maxPrincipal,p.annualRate,p.minAnnualRate,p.maxAnnualRate,p.minTenure,p.maxTenure,p.tenureStep,p.minAge,p.maxAge,p.incomeMultiplier);}
    public static ApplicationView view(LoanApplication a){return new ApplicationView(a.id,a.customerId,a.productId,a.accountId,a.productName,a.principal,a.annualRate,a.months,a.income,a.purpose,a.customerNotes,a.status.name(),a.assignedOfficer,a.approvedBy,a.decisionReason,a.additionalInfo,a.createdAt,a.submittedAt,a.approvedAt);}
    public static LoanView view(BankLoan l){return new LoanView(l.id,l.applicationId,l.customerId,l.accountId,l.principal,l.annualRate,l.months,l.emi,l.outstanding,l.status,l.disbursedAt,l.closedAt);}
    public static InstallmentView view(Installment i){return new InstallmentView(i.id,i.loanId,i.number,i.dueDate,i.principal,i.interest,i.total,i.remaining,i.status,i.paidAt);}
    public static PaymentView view(LoanPayment p){return new PaymentView(p.id,p.loanId,p.installmentId,p.accountId,p.reference,p.amount,p.principal,p.interest,p.paidAt);}
}
