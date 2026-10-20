package com.finnova.bank.reports;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonFormat;
public final class ReportDtos {
    private ReportDtos(){}
    public record Accounts(Long activeCustomers,long accountCount,long activeAccounts,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal balance,long ledgerEntries,long operations,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal operationVolume){}
    public record Loans(long pendingApplications,long approved,long rejected,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal outstandingPrincipal,long upcomingInstallments,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal upcomingAmount,long overdueInstallments,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal overdueAmount){}
    public record Activity(LocalDate date,long operations,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal debits,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal credits){}
    public record Portfolio(String status,long count,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal outstandingPrincipal){}
    public record Repayments(LocalDate date,long count,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal total,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal principal,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal interest){}
    public record Overdue(LocalDate dueDate,long count,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal amount){}
    public record Performance(long productId,String productName,long submittedApplications,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal requestedPrincipal,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal disbursedPrincipal,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal repayments,@JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal currentOutstanding){}
    public record Dashboard(String role,LocalDate from,LocalDate to,String timezone,Instant stockMetricsAsOf,LocalDate effectiveRepaymentDate,String dateFilterMeaning,
        Accounts accounts,Loans loans,List<Activity> activity,List<Portfolio> loanPortfolio,List<Repayments> repaymentTrend,List<Overdue> overdueTrend,List<Performance> productPerformanceTop10){}
}
