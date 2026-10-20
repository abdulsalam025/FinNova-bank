package com.finnova.bank.reports;
import java.time.*;
import java.util.*;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.loans.OverdueService;
import com.finnova.bank.reports.ReportDtos.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class ReportService {
    private final ReportRepository reports;private final BankingAccess access;private final OverdueService dates;private final Clock clock;
    public ReportService(ReportRepository reports,BankingAccess access,OverdueService dates,Clock clock){this.reports=reports;this.access=access;this.dates=dates;this.clock=clock;}
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #actor==authentication.principal.id()")
    public Dashboard dashboard(long actor,LocalDate from,LocalDate to){
        Role role=access.actor(actor);Long customer=role==Role.CUSTOMER?access.customer(actor):null;DateWindow range=DateWindow.of(from,to,clock);LocalDate effective=dates.today();
        boolean banking=role!=Role.LOAN_OFFICER;
        return new Dashboard(role.name(),range.from(),range.to(),"Asia/Kolkata",clock.instant(),effective,
            "Date range filters event flows/charts; balances, active counts, outstanding and unpaid counts are CURRENT stocks, not historical reconstructions.",
            banking?reports.accounts(customer,role==Role.ADMIN,range):null,reports.loans(customer,range,effective),banking?reports.activity(customer,range):List.of(),
            reports.portfolio(customer),reports.repayments(customer,range),reports.overdue(customer,range),reports.performance(customer,range,0,10));
    }
    @Transactional(readOnly=true)@PreAuthorize("isAuthenticated() and #actor==authentication.principal.id()")
    public PageView<Performance> performance(long actor,LocalDate from,LocalDate to,int page,int size){Role role=access.actor(actor);Long customer=role==Role.CUSTOMER?access.customer(actor):null;var query=ListQuery.of(page,size,"id","ASC",Set.of("id"));DateWindow range=DateWindow.of(from,to,clock);long count=reports.productCount(customer);return new PageView<>(reports.performance(customer,range,page,size),page,size,count,(int)((count+size-1)/size),"id","ASC");}
}
