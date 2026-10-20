package com.finnova.bank.audit;
import org.springframework.data.repository.Repository;
public interface AuditRepository extends Repository<AuditRecord, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<AuditRecord> {
    AuditRecord save(AuditRecord record);
}

