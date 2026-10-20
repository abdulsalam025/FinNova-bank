package com.finnova.bank.officer;
import java.time.*;
import java.util.Set;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.reports.DateWindow;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class DecisionService {
    public record View(String id,String resourceType,String resourceId,String decision,String reason,long actorId,String actorRole,Instant occurredAt){}
    private final DecisionRepository decisions;private final BankingAccess access;private final Clock clock;
    public DecisionService(DecisionRepository decisions,BankingAccess access,Clock clock){this.decisions=decisions;this.access=access;this.clock=clock;}
    @Transactional(readOnly=true)@PreAuthorize("hasAnyRole('LOAN_OFFICER','ADMIN') and #actor==authentication.principal.id()")
    public PageView<View> list(long actor,boolean all,String decision,LocalDate from,LocalDate to,int page,int size){
        Role role=access.actor(actor);if(all&&role!=Role.ADMIN)throw new ApiException(HttpStatus.FORBIDDEN,"All decision history is restricted to Admin.");
        if(decision!=null&&!Set.of("APPROVED","REJECTED","VERIFIED").contains(decision))throw new ApiException(HttpStatus.BAD_REQUEST,"Unsupported decision filter.");
        ListQuery.of(page,size,"occurredAt","DESC",Set.of("occurredAt"));
        return decisions.find(all?null:actor,decision,DateWindow.of(from,to,clock),page,size);
    }
}
