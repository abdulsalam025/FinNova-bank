package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface InstallmentRepository extends JpaRepository<Installment,Long>,JpaSpecificationExecutor<Installment>{
    @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select i from Installment i where i.id=:id and i.loanId=:loan")
    Optional<Installment> lock(@Param("id")long id,@Param("loan")long loan);
    @Query("select count(i) from Installment i where i.loanId=:loan and i.number<:number and i.status<>'PAID'")
    long earlierUnpaid(@Param("loan")long loan,@Param("number")int number);
    @Query("select coalesce(sum(i.principal),0) from Installment i where i.loanId=:loan and i.status<>'PAID'")
    BigDecimal unpaidPrincipal(@Param("loan")long loan);
    @Modifying(flushAutomatically=true,clearAutomatically=true)
    @Query(value="UPDATE installments SET status='OVERDUE',version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE status='PENDING' AND due_date<:date ORDER BY due_date,id LIMIT 100",nativeQuery=true)
    int markOverdue(@Param("date")LocalDate date);
}
