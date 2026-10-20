package com.finnova.bank.officer;
import java.sql.Timestamp;
import java.util.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.officer.DecisionService.View;
import com.finnova.bank.reports.DateWindow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class DecisionRepository {
    private final JdbcTemplate jdbc;
    public DecisionRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public PageView<View> find(Long actor,String decision,DateWindow range,int page,int size){
        String union="""
            (SELECT CONVERT(CONCAT('LOAN-',id) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci AS decision_id,
            CONVERT('LOAN_APPLICATION' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci AS resource_type,
            CONVERT(loan_application_id USING utf8mb4) COLLATE utf8mb4_0900_ai_ci AS resource_id,
            to_status COLLATE utf8mb4_0900_ai_ci AS decision,notes COLLATE utf8mb4_0900_ai_ci AS reason,
            actor_user_id AS actor_id,actor_role COLLATE utf8mb4_0900_ai_ci AS actor_role,occurred_at FROM loan_application_history
            WHERE to_status IN ('APPROVED','REJECTED') AND actor_user_id IS NOT NULL
            UNION ALL SELECT CONVERT(CONCAT('KYC-',id) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci,
            resource_type COLLATE utf8mb4_0900_ai_ci,resource_id COLLATE utf8mb4_0900_ai_ci,
            JSON_UNQUOTE(JSON_EXTRACT(details,'$.decision')) COLLATE utf8mb4_0900_ai_ci,
            JSON_UNQUOTE(JSON_EXTRACT(details,'$.reason')) COLLATE utf8mb4_0900_ai_ci,
            actor_user_id,actor_role COLLATE utf8mb4_0900_ai_ci,occurred_at FROM audit_logs
            WHERE event_type='KYC_DECISION' AND actor_user_id IS NOT NULL) d
            """;
        String where=" WHERE occurred_at>=? AND occurred_at<?";List<Object> args=new ArrayList<>(List.of(Timestamp.from(range.start()),Timestamp.from(range.end())));
        if(actor!=null){where+=" AND actor_id=?";args.add(actor);}if(decision!=null){where+=" AND decision=?";args.add(decision);}
        Long count=jdbc.queryForObject("SELECT COUNT(*) FROM "+union+where,Long.class,args.toArray());List<Object> paged=new ArrayList<>(args);paged.add(size);paged.add(page*size);
        var rows=jdbc.query("SELECT * FROM "+union+where+" ORDER BY occurred_at DESC,decision_id DESC LIMIT ? OFFSET ?",(r,n)->new View(r.getString("decision_id"),r.getString("resource_type"),r.getString("resource_id"),r.getString("decision"),r.getString("reason"),r.getLong("actor_id"),r.getString("actor_role"),r.getTimestamp("occurred_at").toInstant()),paged.toArray());
        return new PageView<>(rows,page,size,count==null?0:count,count==null?0:(int)((count+size-1)/size),"occurredAt","DESC");
    }
}
