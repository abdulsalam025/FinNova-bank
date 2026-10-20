package com.finnova.bank.banking;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.Repository;
// Deliberately no delete/update methods. DB grants provide a second enforcement layer.
public interface LedgerRepository extends Repository<FinancialTransaction,Long>, JpaSpecificationExecutor<FinancialTransaction> {
    FinancialTransaction save(FinancialTransaction entry);
}
