package com.finnova.bank.auth.repository;
import java.util.Optional;
import com.finnova.bank.auth.domain.CustomerProfile;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CustomerRepository extends JpaRepository<CustomerProfile, Long> {
    java.util.List<CustomerProfile> findAllByUserIdIn(java.util.Collection<Long> ids);
    Optional<CustomerProfile> findByUserId(long userId);
}

