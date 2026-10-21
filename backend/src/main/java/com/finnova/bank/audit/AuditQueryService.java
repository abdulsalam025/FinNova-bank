package com.finnova.bank.audit;
import java.time.*;
import java.util.*;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.banking.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.reports.DateWindow;
import jakarta.persistence.criteria.Predicate;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class AuditQueryService {
    public record View(long id,String actorType,Long actorUserId,String actorRole,String eventType,String outcome,String resourceType,String resourceId,Map<String,Object> details,Instant occurredAt){}
    private final AuditRepository records;private final BankingAccess access;private final Clock clock;
    public AuditQueryService(AuditRepository records,BankingAccess access,Clock clock){this.records=records;this.access=access;this.clock=clock;}
    @Transactional(readOnly=true)@PreAuthorize("hasAnyRole('LOAN_OFFICER','ADMIN') and #actor==authentication.principal.id()")
    public PageView<View> search(long actor,Long actorId,String event,String outcome,String q,LocalDate from,LocalDate to,int page,int size){
        Role role=access.actor(actor);if(role==Role.LOAN_OFFICER&&actorId!=null&&actorId!=actor)throw new ApiException(HttpStatus.FORBIDDEN,"Officers can search only their own audit actions.");
        Long scoped=role==Role.LOAN_OFFICER?Long.valueOf(actor):actorId;String search=ListQuery.search(q);DateWindow range=DateWindow.of(from,to,clock);
        if(event!=null&&!event.matches("[A-Z0-9_]{1,64}"))throw new ApiException(HttpStatus.BAD_REQUEST,"Invalid event filter.");
        if(outcome!=null&&!Set.of("SUCCESS","FAILURE","DENIED").contains(outcome))throw new ApiException(HttpStatus.BAD_REQUEST,"Invalid outcome filter.");
        var query=ListQuery.of(page,size,"occurredAt","DESC",Set.of("occurredAt"));
        var result=records.findAll((r,c,b)->{List<Predicate> p=new ArrayList<>();p.add(b.greaterThanOrEqualTo(r.get("occurredAt"),range.start()));p.add(b.lessThan(r.get("occurredAt"),range.end()));
            if(scoped!=null)p.add(b.equal(r.get("actorUserId"),scoped));if(event!=null)p.add(b.equal(r.get("eventType"),event));if(outcome!=null)p.add(b.equal(r.get("outcome"),outcome));
            if(search!=null)p.add(b.or(b.like(b.lower(r.get("eventType")),ListQuery.like(search),'\\'),b.like(b.lower(r.get("resourceType")),ListQuery.like(search),'\\'),b.like(b.lower(r.get("resourceId")),ListQuery.like(search),'\\')));return b.and(p.toArray(Predicate[]::new));},query.pageable());
        return new PageView<>(result.getContent().stream().map(a->new View(a.getId(),a.getActorType(),a.getActorUserId(),a.getActorRole(),a.getEventType(),a.getOutcome(),a.getResourceType(),a.getResourceId(),a.getDetails(),a.getOccurredAt())).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"occurredAt","DESC");
    }
}
