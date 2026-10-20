package com.finnova.bank.loans;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface ApplicationRepository extends JpaRepository<LoanApplication,Long>,JpaSpecificationExecutor<LoanApplication>{
    interface Locator{Long getId();Long getCustomerId();Long getAccountId();}
    @Query("select a.id as id,a.customerId as customerId,a.accountId as accountId from LoanApplication a where a.id=:id")
    Optional<Locator> locator(@Param("id")long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select a from LoanApplication a where a.id=:id")
    Optional<LoanApplication> lock(@Param("id")long id);
    @Query(value="SELECT status FROM kyc_records WHERE customer_id=:id",nativeQuery=true)
    Optional<String> kyc(@Param("id")long customerId);
}
