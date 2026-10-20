package com.finnova.bank.auth.repository;

import java.util.Optional;
import com.finnova.bank.auth.domain.BankUser;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<BankUser, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<BankUser> {
    interface ActorState {
        boolean getEnabled();
        com.finnova.bank.auth.domain.Role getRole();
        long getTokenVersion();
        java.time.Instant getLockedUntil();
    }
    // Scalar projection always reads DB state, not a potentially cached entity.
    @Query("select u.enabled as enabled,u.role as role,u.tokenVersion as tokenVersion,u.lockedUntil as lockedUntil from BankUser u where u.id=:id")
    Optional<ActorState> readActorState(@Param("id") long id);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select u from BankUser u where u.id=:id")
    Optional<BankUser> shareById(@Param("id") long id);
    long countByRoleAndEnabled(com.finnova.bank.auth.domain.Role role, boolean enabled);
    boolean existsByEmail(String email);
    Optional<BankUser> findByEmail(String email);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from BankUser u where u.email=:email")
    Optional<BankUser> lockByEmail(@Param("email") String email);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from BankUser u where u.id=:id")
    Optional<BankUser> lockById(@Param("id") long id);
}



