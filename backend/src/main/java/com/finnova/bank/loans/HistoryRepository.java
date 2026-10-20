package com.finnova.bank.loans;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.Repository;
public interface HistoryRepository extends Repository<ApplicationHistory,Long>,JpaSpecificationExecutor<ApplicationHistory>{ApplicationHistory save(ApplicationHistory value);}
