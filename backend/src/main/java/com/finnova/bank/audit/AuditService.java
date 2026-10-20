package com.finnova.bank.audit;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {
    private final AuditRepository repository;
    private final Clock clock;
    public AuditService(AuditRepository repository, Clock clock) { this.repository = repository; this.clock = clock; }
    // Audit writes must be part of the business transaction, not best-effort logging.
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(AuditActor actor, String event, String outcome, String resourceType,
                       String resourceId, Map<String, Object> details) {
        repository.save(new AuditRecord(actor, event, outcome, resourceType, resourceId, details, Instant.now(clock)));
    }
}
