package com.finnova.bank.loans;
import java.time.Clock;
import java.util.Map;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.Role;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class LoanTransitions {
    private final HistoryRepository history;private final AuditService audit;private final Clock clock;
    public LoanTransitions(HistoryRepository history,AuditService audit,Clock clock){this.history=history;this.audit=audit;this.clock=clock;}
    @Transactional(propagation=Propagation.MANDATORY)
    public void move(LoanApplication application,ApplicationStatus to,Long user,Role role,String notes){
        LoanLifecycle.require(application.status,to,role);
        ApplicationHistory row=new ApplicationHistory();row.applicationId=application.id;row.fromStatus=application.status.name();row.toStatus=to.name();
        row.actorType=user==null?"SYSTEM":"USER";row.actorId=user;row.actorRole=role==null?null:role.name();row.notes=notes;
        row.occurredAt=clock.instant();row.createdAt=row.occurredAt;row.updatedAt=row.occurredAt;
        history.save(row);application.status=to;application.updatedAt=clock.instant();
        audit.record(user==null?AuditActor.system():AuditActor.user(user,role),"LOAN_STATUS_CHANGED","SUCCESS","LOAN_APPLICATION",application.id.toString(),Map.of("from",row.fromStatus,"to",row.toStatus));
    }
}
