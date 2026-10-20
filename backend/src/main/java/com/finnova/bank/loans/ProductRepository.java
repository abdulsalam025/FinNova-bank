package com.finnova.bank.loans;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface ProductRepository extends JpaRepository<LoanProduct,Long>,JpaSpecificationExecutor<LoanProduct>{
    @Lock(LockModeType.PESSIMISTIC_READ)@Query("select p from LoanProduct p where p.id=:id")
    Optional<LoanProduct> share(@Param("id")long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select p from LoanProduct p where p.id=:id")Optional<LoanProduct> lock(@Param("id")long id);
}

