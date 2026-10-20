package com.finnova.bank.loans;
import java.time.*;
import java.util.Map;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.auth.repository.SettingRepository;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class OverdueService {
    private final SettingRepository settings;private final InstallmentRepository installments;private final AuditService audit;private final LoanAccess access;private final Clock clock;
    public OverdueService(SettingRepository settings,InstallmentRepository installments,AuditService audit,LoanAccess access,Clock clock){this.settings=settings;this.installments=installments;this.audit=audit;this.access=access;this.clock=clock;}
    @Transactional(readOnly=true)public LocalDate today(){String value=settings.findById("demo.current_date").orElseThrow().getValue();return value.isBlank()?LocalDate.now(clock.withZone(ZoneId.of("Asia/Kolkata"))):LocalDate.parse(value);}
    @Transactional public int scan(){LocalDate date=today();int count=installments.markOverdue(date);if(count>0)audit.record(AuditActor.system(),"INSTALLMENTS_MARKED_OVERDUE","SUCCESS","SYSTEM","overdue-scan",Map.of("date",date.toString(),"count",count));return count;}
    @Transactional@PreAuthorize("hasRole('ADMIN') and #user==authentication.principal.id()")public Map<String,Object> setDate(long user,LocalDate date){
        access.staff(user);if(date!=null&&(date.getYear()<1900||date.getYear()>2100))throw new ApiException(HttpStatus.BAD_REQUEST,"Demo date must be within 1900..2100.");
        settings.findById("demo.current_date").orElseThrow().setValue(date==null?"":date.toString());
        audit.record(AuditActor.user(user,Role.ADMIN),"DEMO_DATE_CHANGED","SUCCESS","SYSTEM_SETTING","demo.current_date",Map.of("value",date==null?"REAL_INDIA_DATE":date.toString()));
        return Map.of("date",date==null?"REAL_INDIA_DATE":date.toString());
    }
    @Transactional@PreAuthorize("hasRole('ADMIN') and #user==authentication.principal.id()")public Map<String,Object> manual(long user){access.staff(user);return Map.of("markedOverdue",scan(),"batchLimit",100);}
}
