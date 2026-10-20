package com.finnova.bank.banking;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
public interface IdempotencyRepository extends Repository<IdempotencyRecord,Long> {
    @Modifying(flushAutomatically=true)
    @Query(value="""
        INSERT INTO idempotency_keys(user_id,operation,idempotency_key,request_hash,state,created_at,updated_at)
        VALUES(:user,:operation,:key,:hash,'IN_PROGRESS',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE updated_at=updated_at
        """,nativeQuery=true)
    int reserve(@Param("user") long user,@Param("operation") String operation,@Param("key") String key,@Param("hash") String hash);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from IdempotencyRecord i where i.userId=:user and i.operation=:operation and i.idempotencyKey=:key")
    Optional<IdempotencyRecord> lock(@Param("user") long user,@Param("operation") String operation,@Param("key") String key);
}
