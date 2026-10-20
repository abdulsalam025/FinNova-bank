package com.finnova.bank.loans;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface LoanRepository extends JpaRepository<BankLoan,Long>,JpaSpecificationExecutor<BankLoan>{
    interface Locator{Long getId();Long getApplicationId();Long getCustomerId();}
    @Query("select l.id as id,l.applicationId as applicationId,l.customerId as customerId from BankLoan l where l.id=:id")
    Optional<Locator> locator(@Param("id")long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select l from BankLoan l where l.id=:id")Optional<BankLoan> lock(@Param("id")long id);
}
