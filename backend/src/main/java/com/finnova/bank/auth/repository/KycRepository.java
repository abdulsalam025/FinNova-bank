package com.finnova.bank.auth.repository;
import java.util.Optional;
import com.finnova.bank.auth.domain.KycRecord;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface KycRepository extends JpaRepository<KycRecord,Long>,JpaSpecificationExecutor<KycRecord>{
    @Query("select k.customerId from KycRecord k where k.id=:id")Optional<Long> customerFor(@Param("id")long id);
    Optional<KycRecord> findByCustomerId(long customerId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select k from KycRecord k where k.id=:id")Optional<KycRecord> lockById(@Param("id")long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select k from KycRecord k where k.customerId=:customer")Optional<KycRecord> lockByCustomer(@Param("customer")long customer);
}
