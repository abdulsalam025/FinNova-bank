package com.finnova.bank.reports;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.*;
import com.finnova.bank.reports.ReportDtos.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class ReportRepository {
    private final JdbcTemplate jdbc;private static final BigDecimal ZERO=new BigDecimal("0.00");
    public ReportRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
    private List<Object> dates(DateWindow w){return new ArrayList<>(List.of(Timestamp.from(w.start()),Timestamp.from(w.end())));}
    private String scope(String column,Long customer,List<Object> args){if(customer==null)return "";args.add(customer);return " AND "+column+"=?";}
    private long count(String sql,List<Object> args){Long n=jdbc.queryForObject(sql,Long.class,args.toArray());return n==null?0:n;}
    private BigDecimal money(String sql,List<Object> args){BigDecimal n=jdbc.queryForObject(sql,BigDecimal.class,args.toArray());return n==null?ZERO:n.setScale(2);}
    public Accounts accounts(Long customer,boolean admin,DateWindow w){
        List<Object> stock=new ArrayList<>();String a=scope("a.customer_id",customer,stock);
        long accounts=count("SELECT COUNT(*) FROM accounts a WHERE 1=1"+a,stock),active=count("SELECT COUNT(*) FROM accounts a WHERE status='ACTIVE'"+a,stock);
        BigDecimal balance=money("SELECT COALESCE(SUM(balance),0.00) FROM accounts a WHERE 1=1"+a,stock);
        List<Object> flow=dates(w);String f=scope("a.customer_id",customer,flow);
        String base=" FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.created_at>=? AND t.created_at<?"+f;
        long ledger=count("SELECT COUNT(*)"+base,flow),operations=count("SELECT COUNT(*)"+base+" AND t.transaction_type<>'TRANSFER_CREDIT'",flow);
        BigDecimal volume=money("SELECT COALESCE(SUM(t.amount),0.00)"+base+" AND t.transaction_type<>'TRANSFER_CREDIT'",flow);
        Long customers=admin?count("SELECT COUNT(*) FROM customers c JOIN users u ON u.id=c.user_id WHERE u.enabled=TRUE AND u.role='CUSTOMER'",List.of()):null;
        return new Accounts(customers,accounts,active,balance,ledger,operations,volume);
    }
    public Loans loans(Long customer,DateWindow w,LocalDate today){
        List<Object> stock=new ArrayList<>();String a=scope("a.customer_id",customer,stock);
        long pending=count("SELECT COUNT(*) FROM loan_applications a WHERE a.status IN ('SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFO_REQUIRED')"+a,stock);
        List<Object> current=new ArrayList<>();String l=scope("l.customer_id",customer,current);
        BigDecimal outstanding=money("SELECT COALESCE(SUM(l.outstanding_principal),0.00) FROM loans l WHERE 1=1"+l,current);
        List<Object> decisions=dates(w);String d=scope("a.customer_id",customer,decisions);
        String decisionBase=" FROM loan_application_history h JOIN loan_applications a ON a.id=h.loan_application_id WHERE h.occurred_at>=? AND h.occurred_at<?"+d;
        long approved=count("SELECT COUNT(*)"+decisionBase+" AND h.to_status='APPROVED'",decisions),rejected=count("SELECT COUNT(*)"+decisionBase+" AND h.to_status='REJECTED'",decisions);
        List<Object> upcoming=new ArrayList<>(List.of(today,today.plusDays(30)));String u=scope("l.customer_id",customer,upcoming);
        String upcomingBase=" FROM installments i JOIN loans l ON l.id=i.loan_id WHERE l.status='REPAYMENT' AND i.status<>'PAID' AND i.due_date>=? AND i.due_date<=?"+u;
        long upcomingCount=count("SELECT COUNT(*)"+upcomingBase,upcoming);BigDecimal upcomingAmount=money("SELECT COALESCE(SUM(i.total_amount),0.00)"+upcomingBase,upcoming);
        List<Object> past=new ArrayList<>();String o=scope("l.customer_id",customer,past);String overdueBase=" FROM installments i JOIN loans l ON l.id=i.loan_id WHERE l.status='REPAYMENT' AND i.status='OVERDUE'"+o;
        return new Loans(pending,approved,rejected,outstanding,upcomingCount,upcomingAmount,count("SELECT COUNT(*)"+overdueBase,past),money("SELECT COALESCE(SUM(i.total_amount),0.00)"+overdueBase,past));
    }
    public List<Activity> activity(Long customer,DateWindow w){
        List<Object> args=dates(w);String s=scope("a.customer_id",customer,args);
        return jdbc.query("SELECT DATE(CONVERT_TZ(t.created_at,'+00:00','+05:30')) AS day,SUM(CASE WHEN t.transaction_type<>'TRANSFER_CREDIT' THEN 1 ELSE 0 END) AS operations,COALESCE(SUM(CASE WHEN t.direction='DEBIT' THEN t.amount ELSE 0 END),0.00) AS debits,COALESCE(SUM(CASE WHEN t.direction='CREDIT' THEN t.amount ELSE 0 END),0.00) AS credits FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.created_at>=? AND t.created_at<?"+s+" GROUP BY day ORDER BY day",(r,n)->new Activity(r.getDate("day").toLocalDate(),r.getLong("operations"),r.getBigDecimal("debits"),r.getBigDecimal("credits")),args.toArray());
    }
    public List<Portfolio> portfolio(Long customer){List<Object> args=new ArrayList<>();String s=scope("l.customer_id",customer,args);return jdbc.query("SELECT l.status,COUNT(*) AS count,COALESCE(SUM(l.outstanding_principal),0.00) AS amount FROM loans l WHERE 1=1"+s+" GROUP BY l.status ORDER BY l.status",(r,n)->new Portfolio(r.getString("status"),r.getLong("count"),r.getBigDecimal("amount")),args.toArray());}
    public List<Repayments> repayments(Long customer,DateWindow w){List<Object> args=dates(w);String s=scope("l.customer_id",customer,args);return jdbc.query("SELECT DATE(CONVERT_TZ(p.paid_at,'+00:00','+05:30')) AS day,COUNT(*) AS count,COALESCE(SUM(p.amount),0.00) AS total,COALESCE(SUM(p.principal_amount),0.00) AS principal,COALESCE(SUM(p.interest_amount),0.00) AS interest FROM payments p JOIN loans l ON l.id=p.loan_id WHERE p.paid_at>=? AND p.paid_at<?"+s+" GROUP BY day ORDER BY day",(r,n)->new Repayments(r.getDate("day").toLocalDate(),r.getLong("count"),r.getBigDecimal("total"),r.getBigDecimal("principal"),r.getBigDecimal("interest")),args.toArray());}
    public List<Overdue> overdue(Long customer,DateWindow w){List<Object> args=new ArrayList<>(List.of(w.from(),w.to()));String s=scope("l.customer_id",customer,args);return jdbc.query("SELECT i.due_date,COUNT(*) AS count,COALESCE(SUM(i.total_amount),0.00) AS amount FROM installments i JOIN loans l ON l.id=i.loan_id WHERE i.status='OVERDUE' AND i.due_date>=? AND i.due_date<=?"+s+" GROUP BY i.due_date ORDER BY i.due_date",(r,n)->new Overdue(r.getDate("due_date").toLocalDate(),r.getLong("count"),r.getBigDecimal("amount")),args.toArray());}
    public long productCount(Long customer){List<Object> args=new ArrayList<>();String where=visibility(customer,args);return count("SELECT COUNT(*) FROM loan_products p WHERE "+where,args);}
    private String visibility(Long customer,List<Object> args){if(customer==null)return "1=1";args.add(customer);return "(p.active=TRUE OR EXISTS(SELECT 1 FROM loan_applications a WHERE a.loan_product_id=p.id AND a.customer_id=?))";}
    public List<Performance> performance(Long customer,DateWindow w,int page,int size){
        List<Object> args=new ArrayList<>();
        String app=" FROM loan_applications a WHERE a.loan_product_id=p.id AND a.submitted_at>=? AND a.submitted_at<?";args.addAll(dates(w));String appCount=app+scope("a.customer_id",customer,args);
        args.addAll(dates(w));String appAmount=app+scope("a.customer_id",customer,args);
        args.addAll(dates(w));String disb=" FROM loans l JOIN loan_applications a ON a.id=l.loan_application_id WHERE a.loan_product_id=p.id AND l.disbursed_at>=? AND l.disbursed_at<?"+scope("l.customer_id",customer,args);
        args.addAll(dates(w));String paid=" FROM payments pay JOIN loans l ON l.id=pay.loan_id JOIN loan_applications a ON a.id=l.loan_application_id WHERE a.loan_product_id=p.id AND pay.paid_at>=? AND pay.paid_at<?"+scope("l.customer_id",customer,args);
        String outstanding=" FROM loans l JOIN loan_applications a ON a.id=l.loan_application_id WHERE a.loan_product_id=p.id"+scope("l.customer_id",customer,args);
        String visible=visibility(customer,args);args.add(size);args.add(page*size);
        String sql="SELECT p.id,p.name,(SELECT COUNT(*)"+appCount+") AS submitted,(SELECT COALESCE(SUM(a.principal),0.00)"+appAmount+") AS requested,(SELECT COALESCE(SUM(l.principal),0.00)"+disb+") AS disbursed,(SELECT COALESCE(SUM(pay.amount),0.00)"+paid+") AS repayments,(SELECT COALESCE(SUM(l.outstanding_principal),0.00)"+outstanding+") AS outstanding FROM loan_products p WHERE "+visible+" ORDER BY p.id LIMIT ? OFFSET ?";
        return jdbc.query(sql,(r,n)->new Performance(r.getLong("id"),r.getString("name"),r.getLong("submitted"),r.getBigDecimal("requested"),r.getBigDecimal("disbursed"),r.getBigDecimal("repayments"),r.getBigDecimal("outstanding")),args.toArray());
    }
}
