package com.finnova.bank.loans;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
public interface PaymentRepository extends Repository<LoanPayment,Long>,JpaSpecificationExecutor<LoanPayment>{LoanPayment save(LoanPayment payment);}
